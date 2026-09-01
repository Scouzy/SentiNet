'use strict'

require('dotenv').config()

const express = require('express')
const cors = require('cors')
const http = require('http')
const { exec } = require('child_process')
const os = require('os')
const fs = require('fs')
const path = require('path')
const WebSocket = require('ws')
const init = require('./data/initial')
const detection = require('./services/detection')
const audit = require('./services/audit')
const whitelist = require('./services/whitelist')
const platform = require('./services/platform')
const auth = require('./services/auth')
const threatintel = require('./services/threatintel')
const history = require('./services/history')
const mitreTaxonomy = require('./data/mitre.json')
const bpfFilters = require('./data/bpf-filters.json')
const retentionConfig = require('./config/retention.json')
const QRCode = require('qrcode')

// ── TOTP natif RFC 6238 (pas de dépendance externe) ─────────────────────────
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function b32Encode(buf) {
  let s = '', bits = 0, val = 0
  for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { s += B32[(val >>> (bits - 5)) & 31]; bits -= 5 } }
  if (bits > 0) s += B32[(val << (5 - bits)) & 31]
  return s
}
function b32Decode(s) {
  const out = []; let bits = 0, val = 0
  for (const c of s.toUpperCase().replace(/=+$/, '')) {
    const i = B32.indexOf(c); if (i < 0) continue
    val = (val << 5) | i; bits += 5
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8 }
  }
  return Buffer.from(out)
}
function totpCode(secret, t = Math.floor(Date.now() / 30000)) {
  const key = b32Decode(secret)
  const buf = Buffer.alloc(8)
  buf.writeUInt32BE(Math.floor(t / 0x100000000), 0); buf.writeUInt32BE(t >>> 0, 4)
  const hmac = require('crypto').createHmac('sha1', key).update(buf).digest()
  const off = hmac[hmac.length - 1] & 0x0f
  const code = ((hmac[off] & 0x7f) << 24 | hmac[off+1] << 16 | hmac[off+2] << 8 | hmac[off+3]) % 1e6
  return String(code).padStart(6, '0')
}
function totpVerify(secret, token) {
  const t = Math.floor(Date.now() / 30000)
  return [-1, 0, 1].some(d => totpCode(secret, t + d) === String(token).trim())
}
function totpSecret() { return b32Encode(require('crypto').randomBytes(20)) }
function totpUri(label, issuer, secret) {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}

const DB_PATH = path.join(__dirname, 'data', 'db.json')
const SIG_PATH = path.join(__dirname, 'data', 'signatures.json')

// ── Gestionnaires d’erreurs globaux — évite le crash sur exception non attrapée ──────
process.on('uncaughtException', (err) => {
  console.error('[PROCESS] uncaughtException — serveur maintenu :', err.message)
})
process.on('unhandledRejection', (reason) => {
  console.error('[PROCESS] unhandledRejection — serveur maintenu :', reason?.message ?? reason)
})

const app = express()
const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

// Gestionnaire d’erreur du serveur WebSocket
wss.on('error', (err) => {
  console.warn('[WSS] erreur serveur WebSocket :', err.message)
})

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }))
app.use(express.json({ limit: '4mb' })) // marge pour les lots de connexions remontés par les agents

// Clé partagée pour l'authentification des agents distants (sondes)
const AGENT_KEY = process.env.AGENT_KEY || ''

// Domaine supervisé par la sonde locale (affiché dans « Sondes & Agents »)
const SERVER_DOMAIN = (process.env.SERVER_DOMAIN || (() => {
  try { return new URL(process.env.CORS_ORIGIN || '').hostname || os.hostname() } catch { return os.hostname() }
})()).trim().toLowerCase()
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  next()
})

// ── Broadcast helper ──────────────────────────────────────────────────────────
function broadcast(msg) {
  const s = JSON.stringify(msg)
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(s) })
}

const PORT = Number(process.env.PORT) || 3010

// ── Persistance : chargement initial depuis db.json ──────────────────────────
function loadDb() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const saved = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'))
      return {
        alerts: Array.isArray(saved.alerts) ? saved.alerts : init.alerts.map(a => ({ ...a })),
        blocks: Array.isArray(saved.blocks) ? saved.blocks : [],
        users: Array.isArray(saved.users) ? saved.users : init.users.map(u => ({ ...u })),
        dynamicAlerts: [],
      }
    }
  } catch (e) { console.warn('[DB] Erreur lecture db.json :', e.message) }
  return {
    alerts: init.alerts.map(a => ({ ...a })),
    blocks: [],
    users: init.users.map(u => ({ ...u })),
    dynamicAlerts: [],
  }
}

let _saveTimer = null
function saveDb() {
  clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify({ alerts: db.alerts.slice(0, 10000), blocks: db.blocks, users: db.users }, null, 2))
    } catch (e) { console.warn('[DB] Erreur écriture db.json :', e.message) }
  }, 500)
}

function saveRules() {
  try {
    fs.writeFileSync(SIG_PATH, JSON.stringify(detection.getRules(), null, 2))
  } catch (e) { console.warn('[DB] Erreur écriture signatures.json :', e.message) }
}

// ── In-memory store ───────────────────────────────────────────────────────────
const db = loadDb()
db.dynamicAlerts = []

// Retire les champs sensibles avant d'exposer un utilisateur via l'API
function publicUser(u) {
  if (!u) return u
  const { passwordHash, mfaSecret, mfaPending, ...rest } = u
  return { ...rest, hasPassword: !!passwordHash }
}

// ── Playbooks SOAR (config persistée + exécutions réelles) ────────────────────
const PB_PATH = path.join(__dirname, 'data', 'playbooks.json')
let playbooks = []
try { playbooks = JSON.parse(fs.readFileSync(PB_PATH, 'utf8')) } catch { playbooks = [] }
function savePlaybooks() {
  try { fs.writeFileSync(PB_PATH, JSON.stringify(playbooks, null, 2)) } catch (e) { console.warn('[PB] écriture:', e.message) }
}
function runPlaybook(id, ok = true) {
  const pb = playbooks.find(p => p.id === id)
  if (!pb || pb.status !== 'active') return
  pb.executions++
  if (ok) pb.success++
  pb.lastRun = new Date().toISOString()
  savePlaybooks()
}

// Dernières métriques hôte (pour l'endpoint /api/sensors)
let lastMetrics = { cpu: 0, mem: 0, conns: 0 }

// ── Registre des agents distants (sondes est-ouest) — alimenté en Phase 3 ─────
const agents = new Map() // agentId -> { id, host, segment, load, connections, interfaces, version, lastSeen, lastSeenTs }
function agentSensors() {
  const now = Date.now()
  // Purge les sondes injoignables depuis > 1 h (évite les entrées fantômes)
  return [...agents.values()].filter(a => now - (a.lastSeenTs || 0) < 3600000).map(a => ({
    id: a.id, host: a.host,
    segment: a.network || a.segment || `Agent ${a.host}`,
    domain: a.domain || '—', subnet: a.subnet || '', iface: a.iface || '',
    mode: 'IDS',
    status: (now - (a.lastSeenTs || 0) < 30000) ? 'online' : 'offline',
    load: a.load || 0, connections: a.connections || 0, interfaces: a.interfaces || 0,
    droppedPct: 0, version: a.version || '3.2', kind: 'agent', lastSeen: a.lastSeen,
  }))
}

// ── EventBus — detection engine → alerts store ────────────────────────────────
detection.bus.on('alert', (alert) => {
  db.alerts.unshift(alert)
  if (db.alerts.length > 10000) db.alerts.splice(10000)
  db.dynamicAlerts.unshift(alert)
  if (db.dynamicAlerts.length > 100) db.dynamicAlerts.splice(100)
  audit.write('DETECTION_ALERT', 'system', alert.source, { type: alert.type, severity: alert.severity, mitre: alert.mitre })
  // Déclenchement des playbooks SOAR sur événements réels (EF-504)
  try {
    if (alert.severity === 'critical') runPlaybook('PB-005')
    const t = (alert.type || '').toLowerCase()
    if (t.includes('beacon') || t.includes('c2') || t.includes('ioc') || t.includes('malveillante')) runPlaybook('PB-004')
    if (t.includes('latéral') || t.includes('lateral')) runPlaybook('PB-002')
    if (t.includes('volumétrique') || t.includes('trafic anormal') || t.includes('ddos')) runPlaybook('PB-003')
  } catch {}
  broadcast({ type: 'alert', data: alert })
  saveDb()
})

// ── Ring buffer trafic (60 points × 3 s = 3 min de données live) ──────────────
const TRAFFIC_RING_SIZE = 60
const trafficRing = []

// ── Helpers ───────────────────────────────────────────────────────────────────
const run = (cmd) => new Promise((resolve) =>
  exec(cmd, { timeout: 15000, maxBuffer: 4 * 1024 * 1024 }, (err, out) =>
    resolve({ ok: !err, raw: out || '', err: err ? err.message : null })
  )
)

// ═══════════════════════════════════════════════════════════════════════════
//  Authentification (EF-901/903) — routes publiques
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {}
  const u = db.users.find(x => (x.email || '').toLowerCase() === String(email || '').toLowerCase())
  if (!u || !u.passwordHash || !auth.verifyPassword(password, u.passwordHash)) {
    audit.write('LOGIN_FAIL', String(email || 'inconnu'), String(email || '-'), {})
    return res.status(401).json({ error: 'Identifiants invalides' })
  }
  if (u.status && u.status !== 'active') {
    return res.status(403).json({ error: 'Compte désactivé' })
  }
  // MFA activé → étape 2 obligatoire
  if (u.mfa && u.mfaSecret) {
    const tempToken = auth.signToken({ scope: 'mfa', uid: u.id }, auth.MFA_TTL)
    audit.write('LOGIN_PASSWORD_OK', u.email, u.email, { mfa: 'required' })
    return res.json({ mfaRequired: true, tempToken })
  }
  u.lastLogin = new Date().toISOString()
  saveDb()
  const token = auth.signToken({ scope: 'session', uid: u.id, email: u.email, role: u.role, name: u.name })
  audit.write('LOGIN_SUCCESS', u.email, u.email, { mfa: false })
  res.json({ token, user: publicUser(u) })
})

app.post('/api/auth/mfa', (req, res) => {
  const { tempToken, code } = req.body || {}
  const p = auth.verifyToken(tempToken)
  if (!p || p.scope !== 'mfa') return res.status(401).json({ error: 'Session MFA expirée — reconnectez-vous' })
  const u = db.users.find(x => x.id === p.uid)
  if (!u || !u.mfaSecret) return res.status(401).json({ error: 'Utilisateur introuvable' })
  if (!totpVerify(u.mfaSecret, code)) {
    audit.write('LOGIN_MFA_FAIL', u.email, u.email, {})
    return res.status(422).json({ error: 'Code MFA incorrect ou expiré' })
  }
  u.lastLogin = new Date().toISOString()
  saveDb()
  const token = auth.signToken({ scope: 'session', uid: u.id, email: u.email, role: u.role, name: u.name })
  audit.write('LOGIN_SUCCESS', u.email, u.email, { mfa: true })
  res.json({ token, user: publicUser(u) })
})

app.get('/api/auth/me', auth.requireAuth, (req, res) => {
  const u = db.users.find(x => x.id === req.user.uid)
  if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' })
  res.json({ user: publicUser(u) })
})

app.post('/api/auth/logout', (_req, res) => res.json({ ok: true })) // jeton sans état : le client le supprime

// ═══ Garde d'authentification : toutes les autres routes /api sont protégées ═══
app.use('/api', (req, res, next) => {
  // /auth = login public ; /agent = authentifié par clé d'agent (X-Agent-Key)
  if (req.path.startsWith('/auth') || req.path.startsWith('/agent')) return next()
  auth.requireAuth(req, res, next)
})

// ── Network interfaces (real, from OS) ────────────────────────────────────────
app.get('/api/network/interfaces', (_req, res) => {
  const raw = os.networkInterfaces()
  const list = []
  for (const [name, addrs] of Object.entries(raw)) {
    for (const a of addrs) {
      if (a.family === 'IPv4') {
        list.push({ name, ip: a.address, netmask: a.netmask, mac: a.mac, internal: a.internal })
      }
    }
  }
  res.json({ ifaces: list, hostname: os.hostname(), uptime: Math.round(os.uptime()) })
})

// ── Active connections (real, via netstat) ────────────────────────────────────
app.get('/api/network/connections', async (_req, res) => {
  const conns = await platform.getConnections()
  res.json({ connections: conns, count: conns.length })
})

// ── ARP table (local hosts) ───────────────────────────────────────────────────
app.get('/api/network/hosts', async (_req, res) => {
  const hosts = await platform.getHosts()
  res.json({ hosts })
})

// ── Ping latency ──────────────────────────────────────────────────────────────
app.get('/api/network/ping/:host', async (req, res) => {
  const h = req.params.host
  if (!/^[\w.\-]+$/.test(h)) return res.status(400).json({ error: 'Hôte invalide' })
  const latency = await platform.ping(h)
  res.json({ host: h, latency })
})

// ── Real adapter throughput (PowerShell) ──────────────────────────────────────
let prevAdapters = null
let prevAdaptersTs = 0

async function fetchAdapterStats() {
  return platform.fetchAdapterStats()
}

function calcThroughput(adapters, prev, elapsed) {
  if (!prev || elapsed <= 0) return { inMbps: 0, outMbps: 0 }
  let dI = 0, dO = 0
  for (const a of adapters) {
    const p = prev.find(x => x.Name === a.Name)
    if (p) {
      dI += Math.max(0, a.ReceivedBytes - p.ReceivedBytes)
      dO += Math.max(0, a.SentBytes - p.SentBytes)
    }
  }
  return {
    inMbps: +((dI / elapsed * 8 / 1e6).toFixed(3)),
    outMbps: +((dO / elapsed * 8 / 1e6).toFixed(3)),
  }
}

app.get('/api/network/stats', async (_req, res) => {
  const adapters = await fetchAdapterStats()
  if (!adapters) return res.json({ adapters: [], throughput: { inMbps: 0, outMbps: 0 } })
  const dt = (Date.now() - prevAdaptersTs) / 1000
  const throughput = calcThroughput(adapters, prevAdapters, dt)
  prevAdapters = adapters
  prevAdaptersTs = Date.now()
  res.json({ adapters, throughput })
})

// ── System info ───────────────────────────────────────────────────────────────
app.get('/api/system/info', (_req, res) => {
  const cpus = os.cpus()
  const cpuPct = cpus.reduce((acc, c) => {
    const tot = Object.values(c.times).reduce((a, b) => a + b, 0)
    return acc + (tot - c.times.idle) / tot * 100
  }, 0) / cpus.length
  res.json({
    cpu: +cpuPct.toFixed(1),
    mem: +((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(1),
    totalMem: os.totalmem(),
    freeMem: os.freemem(),
    hostname: os.hostname(),
    platform: os.platform(),
    uptime: Math.round(os.uptime()),
    cpuModel: cpus[0]?.model || 'Unknown',
    cpuCores: cpus.length,
  })
})

// ── Alerts CRUD ───────────────────────────────────────────────────────────────
app.get('/api/alerts', (_req, res) => res.json({ alerts: db.alerts }))
app.get('/api/alerts/dynamic', (_req, res) => res.json({ alerts: db.dynamicAlerts }))

app.delete('/api/alerts/dynamic', (_req, res) => {
  const count = db.dynamicAlerts.length
  db.dynamicAlerts = []
  res.json({ ok: true, cleared: count })
})

app.delete('/api/alerts/dynamic/:id', (req, res) => {
  const before = db.dynamicAlerts.length
  db.dynamicAlerts = db.dynamicAlerts.filter(a => a.id !== req.params.id)
  if (db.dynamicAlerts.length === before) return res.status(404).json({ error: 'Alerte introuvable' })
  res.json({ ok: true })
})

app.patch('/api/alerts/:id', (req, res) => {
  const a = db.alerts.find(x => x.id === req.params.id)
  if (!a) return res.status(404).json({ error: 'Non trouvé' })
  const prev = a.status
  Object.assign(a, req.body, { updatedAt: new Date().toISOString() })
  audit.write('ALERT_UPDATE', req.body._actor || 'user', req.params.id, { from: prev, to: a.status })
  res.json({ alert: a })
})

// ── Blocks (Windows Firewall + whitelist guard) ───────────────────────────────
app.get('/api/blocks', (_req, res) => res.json({ blocks: db.blocks }))

app.post('/api/blocks', async (req, res) => {
  const { reason = 'Bloqué par SentiNet', alertId, actor = 'user' } = req.body
  const ip = (req.body.ip || '').trim().replace(/^\[|\]$/g, '')
  if (!ip) return res.status(400).json({ error: 'IP requise' })
  const isIPv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(ip)
  const isIPv6 = /^[0-9a-fA-F:]+$/.test(ip)
  if (!isIPv4 && !isIPv6) return res.status(400).json({ error: 'IP invalide (IPv4 ou IPv6 attendu)' })

  // ── Anti-emballement : whitelist check (EF-508) ───────────────────────────
  if (whitelist.isWhitelisted(ip)) {
    audit.write('BLOCK_REFUSED_WHITELIST', actor, ip, { reason })
    return res.status(403).json({ error: `Blocage refusé : ${ip} est dans la liste blanche des actifs critiques (EF-508)` })
  }
  if (db.blocks.find(b => b.ip === ip)) return res.status(409).json({ error: 'Déjà bloquée' })

  const rule = `SentiNet_${ip.replace(/[.:]/g, '_').replace(/__+/g, '_')}`
  const block = { ip, reason, since: new Date().toISOString(), permanent: false, rule, fwStatus: 'pending', expires: null }
  db.blocks.push(block)
  saveDb()

  // Applique les règles pare-feu de l'OS (admin/root requis — repli gracieux sinon)
  const applied = await platform.addFirewallBlock(ip, rule)
  block.fwStatus = applied ? 'active' : 'tracked'
  if (!block.permanent) {
    const expiresTs = Date.now() + 2 * 3600 * 1000
    block.expires = new Date(expiresTs).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }

  // Auto-update linked alert status
  if (alertId) {
    const a = db.alerts.find(x => x.id === alertId)
    if (a) a.status = 'blocked'
  }
  runPlaybook('PB-001', block.fwStatus === 'active') // playbook « Blocage hôte malveillant »
  saveDb()
  res.json({ block })
})

app.delete('/api/blocks/:ip', async (req, res) => {
  const ip = decodeURIComponent(req.params.ip)
  const idx = db.blocks.findIndex(b => b.ip === ip)
  if (idx === -1) return res.status(404).json({ error: 'Non trouvé' })
  const [b] = db.blocks.splice(idx, 1)
  if (b.fwStatus === 'active') {
    await platform.removeFirewallBlock(ip, b.rule)
  }
  audit.write('UNBLOCK_HOST', 'user', ip, { rule: b.rule })
  saveDb()
  res.json({ ok: true })
})

app.patch('/api/blocks/:ip', async (req, res) => {
  const ip = decodeURIComponent(req.params.ip)
  const b = db.blocks.find(x => x.ip === ip)
  if (!b) return res.status(404).json({ error: 'Non trouvé' })
  const wasPermanent = b.permanent
  Object.assign(b, req.body)
  if (req.body.permanent && !wasPermanent) b.expires = 'Manuel'
  saveDb()
  res.json({ block: b })
})

// ── Users CRUD ────────────────────────────────────────────────────────────────
app.get('/api/users', (_req, res) => res.json({ users: db.users.map(publicUser) }))

app.post('/api/users', (req, res) => {
  const { password, passwordHash: _ignore, createdBy, ...fields } = req.body || {}
  const u = { id: Date.now(), mfa: false, status: 'active', lastLogin: null, ...fields }
  if (password) u.passwordHash = auth.hashPassword(password)
  db.users.push(u)
  audit.write('USER_CREATE', createdBy || (req.user && req.user.email) || 'admin', u.email, { role: u.role })
  saveDb()
  res.json({ user: publicUser(u) })
})

app.patch('/api/users/:id', (req, res) => {
  const u = db.users.find(x => String(x.id) === req.params.id)
  if (!u) return res.status(404).json({ error: 'Non trouvé' })
  const { password, passwordHash: _ignore, ...fields } = req.body || {}
  Object.assign(u, fields)
  if (password) u.passwordHash = auth.hashPassword(password)
  audit.write('USER_UPDATE', (req.user && req.user.email) || 'admin', u.email, Object.keys({ ...fields, ...(password ? { password: '***' } : {}) }))
  saveDb()
  res.json({ user: publicUser(u) })
})

app.delete('/api/users/:id', (req, res) => {
  const idx = db.users.findIndex(x => String(x.id) === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Non trouvé' })
  const [u] = db.users.splice(idx, 1)
  audit.write('USER_DELETE', 'admin', u.email, {})
  saveDb()
  res.json({ ok: true })
})

app.post('/api/users/force-mfa', (_req, res) => {
  db.users.forEach(u => { u.mfa = true })
  audit.write('FORCE_MFA', 'admin', 'all_users', {})
  saveDb()
  res.json({ ok: true, users: db.users.map(publicUser) })
})

// ── MFA TOTP enrollment ───────────────────────────────────────────────────────
// Étape 1 : générer un secret et renvoyer l'URI QR + la clé manuelle
app.post('/api/users/:id/mfa/setup', async (req, res) => {
  const u = db.users.find(x => String(x.id) === req.params.id)
  if (!u) return res.status(404).json({ error: 'Utilisateur non trouvé' })
  const secret = totpSecret()
  u.mfaPending = secret
  saveDb()
  const otpauth = totpUri(u.email || u.name || 'user', 'SentiNet', secret)
  const qrDataUrl = await QRCode.toDataURL(otpauth, { width: 220, margin: 2 })
  res.json({ qrDataUrl, secret, otpauth })
})

// Étape 2 : vérifier le code TOTP et activer le MFA si correct
app.post('/api/users/:id/mfa/verify', (req, res) => {
  const u = db.users.find(x => String(x.id) === req.params.id)
  if (!u) return res.status(404).json({ error: 'Utilisateur non trouvé' })
  if (!u.mfaPending) return res.status(400).json({ error: 'Aucun enrôlement MFA en cours' })
  const { token } = req.body
  if (!token) return res.status(400).json({ error: 'Code requis' })
  if (!totpVerify(u.mfaPending, token)) return res.status(422).json({ error: 'Code incorrect ou expiré' })
  u.mfaSecret = u.mfaPending
  delete u.mfaPending
  u.mfa = true
  audit.write('MFA_ENROLLED', u.email || 'user', u.email, {})
  saveDb()
  res.json({ ok: true, user: publicUser(u) })
})

// Désactiver le MFA d'un utilisateur
app.delete('/api/users/:id/mfa', (req, res) => {
  const u = db.users.find(x => String(x.id) === req.params.id)
  if (!u) return res.status(404).json({ error: 'Utilisateur non trouvé' })
  u.mfa = false
  delete u.mfaSecret
  delete u.mfaPending
  audit.write('MFA_DISABLED', 'admin', u.email, {})
  saveDb()
  res.json({ ok: true, user: publicUser(u) })
})

// ── Detection rules CRUD ──────────────────────────────────────────────────────
app.get('/api/detection/rules', (_req, res) => res.json({ rules: detection.getRules() }))

app.post('/api/detection/rules', (req, res) => {
  const r = detection.addRule(req.body)
  audit.write('RULE_CREATE', 'user', r.id, { name: r.name })
  saveRules()
  res.json({ rule: r })
})

app.patch('/api/detection/rules/:id', (req, res) => {
  try {
    const r = detection.updateRule(req.params.id, req.body)
    audit.write('RULE_UPDATE', 'user', req.params.id, req.body)
    saveRules()
    res.json({ rule: r })
  } catch (e) { res.status(404).json({ error: e.message }) }
})

app.delete('/api/detection/rules/:id', (req, res) => {
  try {
    detection.deleteRule(req.params.id)
    audit.write('RULE_DELETE', 'user', req.params.id, {})
    saveRules()
    res.json({ ok: true })
  } catch (e) { res.status(404).json({ error: e.message }) }
})

// ── Whitelist CRUD (EF-508) ───────────────────────────────────────────────────
app.get('/api/whitelist', (_req, res) => res.json({ assets: whitelist.getAll() }))
app.get('/api/whitelist/check/:ip', (req, res) => res.json({ whitelisted: whitelist.isWhitelisted(req.params.ip), ip: req.params.ip }))

app.post('/api/whitelist', (req, res) => {
  const a = whitelist.add(req.body)
  audit.write('WHITELIST_ADD', 'admin', a.ip || a.hostname, { name: a.name })
  res.json({ asset: a })
})

app.patch('/api/whitelist/:id', (req, res) => {
  try {
    const a = whitelist.update(Number(req.params.id), req.body)
    res.json({ asset: a })
  } catch (e) { res.status(404).json({ error: e.message }) }
})

app.delete('/api/whitelist/:id', (req, res) => {
  try {
    whitelist.remove(Number(req.params.id))
    audit.write('WHITELIST_REMOVE', 'admin', req.params.id, {})
    res.json({ ok: true })
  } catch (e) { res.status(404).json({ error: e.message }) }
})

// ── Audit log ─────────────────────────────────────────────────────────────────
app.get('/api/audit', (_req, res) => res.json({ entries: audit.read(200) }))
app.get('/api/audit/verify', (_req, res) => res.json(audit.verify()))
app.get('/api/audit/stats', (_req, res) => res.json(audit.stats()))

// ── BPF Filters ───────────────────────────────────────────────────────────────
app.get('/api/capture/filters', (_req, res) => res.json({ filters: bpfFilters.filters }))

// ── Retention policy ──────────────────────────────────────────────────────────
app.get('/api/config/retention', (_req, res) => res.json(retentionConfig))

// ── NTP check ─────────────────────────────────────────────────────────────────
app.get('/api/system/ntp', async (_req, res) => res.json(await detection.checkNtp()))

// ── IoC management ────────────────────────────────────────────────────────────
app.post('/api/threat-intel/ioc', (req, res) => {
  const { ip } = req.body
  if (!ip) return res.status(400).json({ error: 'IP requise' })
  detection.addIoC(ip)
  threatintel.addCustom(ip)
  audit.write('IOC_ADD', (req.user && req.user.email) || 'user', ip, {})
  res.json({ ok: true, ip })
})

app.get('/api/threat-intel/check/:ip', (req, res) => {
  const ip = req.params.ip
  res.json({ ip, malicious: detection.isMalicious(ip) })
})

// ── Vrais flux de threat intelligence (EF-801/802) ────────────────────────────
app.get('/api/threat-intel/feeds', (_req, res) => {
  const observed = new Set()
  for (const c of lastParsedConns) {
    const ip = (c.remote || '').replace(/^\[|\]$/g, '').split(':').slice(0, -1).join(':')
    if (ip) observed.add(ip)
  }
  for (const a of db.alerts) { if (a.source) observed.add(a.source); if (a.destination) observed.add(a.destination) }
  res.json({ feeds: threatintel.getFeeds(observed), totalIocs: threatintel.allIps().size })
})

// ── Couverture MITRE ATT&CK calculée depuis les vraies alertes (EF-803) ───────
app.get('/api/detection/mitre', (_req, res) => {
  const ruleTechs = new Set(detection.getRules().filter(r => r.enabled).map(r => r.mitre).filter(Boolean))
  const ENGINE = new Set(['T1071.001', 'T1021.002', 'T1046', 'T1071', 'T1498'])
  const counts = {}
  for (const a of db.alerts) { if (a.mitre) counts[a.mitre] = (counts[a.mitre] || 0) + 1 }
  const tactics = mitreTaxonomy.map(t => ({
    tactic: t.tactic, id: t.id,
    techniques: t.techniques.map(tech => {
      const detections = counts[tech.id] || 0
      return { id: tech.id, name: tech.name, covered: ENGINE.has(tech.id) || ruleTechs.has(tech.id) || detections > 0, detections }
    }),
  }))
  const all = tactics.flatMap(t => t.techniques)
  const covered = all.filter(t => t.covered).length
  res.json({
    tactics,
    total: all.length,
    covered,
    coveragePct: all.length ? Math.round(covered / all.length * 100) : 0,
    totalDetections: all.reduce((s, t) => s + t.detections, 0),
  })
})

// ── Playbooks SOAR (EF-504) ───────────────────────────────────────────────────
app.get('/api/playbooks', (_req, res) => res.json({ playbooks }))

app.post('/api/playbooks/:id/run', (req, res) => {
  const pb = playbooks.find(p => p.id === req.params.id)
  if (!pb) return res.status(404).json({ error: 'Playbook introuvable' })
  runPlaybook(pb.id)
  audit.write('PLAYBOOK_MANUAL_RUN', (req.user && req.user.email) || 'user', pb.id, { name: pb.name })
  res.json({ playbook: pb })
})

app.patch('/api/playbooks/:id', (req, res) => {
  const pb = playbooks.find(p => p.id === req.params.id)
  if (!pb) return res.status(404).json({ error: 'Playbook introuvable' })
  const { status, mode } = req.body || {}
  if (status) pb.status = status
  if (mode) pb.mode = mode
  savePlaybooks()
  audit.write('PLAYBOOK_UPDATE', (req.user && req.user.email) || 'admin', pb.id, { status: pb.status, mode: pb.mode })
  res.json({ playbook: pb })
})

// ── Capteurs / sondes réels (EF-905) ──────────────────────────────────────────
app.get('/api/sensors', (_req, res) => {
  const ifaces = Object.values(os.networkInterfaces()).flat().filter(a => a && !a.internal).length
  const local = {
    id: 'SENSOR-LOCAL',
    host: os.hostname(),
    domain: SERVER_DOMAIN,
    segment: 'Hôte local (auto-surveillance)',
    mode: 'IDS',
    status: 'online',
    load: lastMetrics.cpu || 0,
    connections: lastParsedConns.length,
    interfaces: ifaces,
    droppedPct: 0,
    version: '3.2',
    kind: 'local',
    lastSeen: new Date().toISOString(),
  }
  const sensors = [local, ...agentSensors()]
  res.json({ sensors, online: sensors.filter(s => s.status === 'online').length, total: sensors.length })
})

// ── Ingestion des agents distants (sondes est-ouest) — auth par clé d'agent ────
app.post('/api/agent/ingest', (req, res) => {
  if (!AGENT_KEY || req.headers['x-agent-key'] !== AGENT_KEY) {
    return res.status(401).json({ error: 'Agent non autorisé' })
  }
  const b = req.body || {}
  const agentId = String(b.agentId || '').trim()
  if (!agentId) return res.status(400).json({ error: 'agentId requis' })
  const connections = Array.isArray(b.connections) ? b.connections : []
  // Normalisation de la casse du domaine : « NotEazy.com » et « noteazy.com »
  // doivent désigner la même sonde/le même regroupement (évite les doublons de carte).
  const domain = (b.domain || '—').trim().toLowerCase() || '—'
  const isNew = !agents.has(agentId)
  agents.set(agentId, {
    id: agentId,
    host: b.host || agentId,
    domain,
    network: b.network || '—',
    subnet: b.subnet || '',
    iface: b.iface || '',
    load: Number(b.cpu) || 0,
    connections: connections.length,
    interfaces: Number(b.interfaces) || 0,
    version: b.version || '3.2',
    lastSeen: new Date().toISOString(),
    lastSeenTs: Date.now(),
  })
  if (isNew) audit.write('AGENT_REGISTER', agentId, b.host || agentId, { domain, network: b.network })
  // Analyse du trafic OBSERVÉ par l'agent (sans auto-exclusion locale)
  try {
    detection.analyze(connections, Number(b.throughputMbps) || 0, {
      excludeLocal: false,
      tag: { probe: agentId, segment: b.network || 'AGENT', domain },
    })
    detection.trackSessions(connections)
  } catch (e) { console.warn('[AGENT] analyse:', e.message) }
  res.json({ ok: true, received: connections.length })
})

// ── Téléchargement de l'agent (facilite le déploiement de nouvelles sondes) ────
app.get('/api/agent/download', (_req, res) => {
  res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="sentinet-agent.js"')
  res.sendFile(path.join(__dirname, '..', 'agent', 'sentinet-agent.js'))
})

// Script d'installation systemd (agent en arrière-plan) — récupérable via curl
app.get('/api/agent/install', (_req, res) => {
  res.setHeader('Content-Type', 'text/x-shellscript; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="install-agent.sh"')
  res.sendFile(path.join(__dirname, '..', 'agent', 'install-agent.sh'))
})

// ── Données réelles : trafic, protocoles, top-talkers, tendances alertes ────────
const PORT_PROTO = {
  80: 'HTTP', 8080: 'HTTP-alt', 443: 'HTTPS', 8443: 'HTTPS-alt',
  22: 'SSH', 23: 'Telnet', 21: 'FTP', 20: 'FTP-data',
  25: 'SMTP', 587: 'SMTP', 110: 'POP3', 143: 'IMAP', 993: 'IMAPS',
  53: 'DNS', 3389: 'RDP', 445: 'SMB', 139: 'NetBIOS',
  3306: 'MySQL', 5432: 'PostgreSQL', 1433: 'MSSQL', 6379: 'Redis',
  27017: 'MongoDB', 5000: 'Dev/API', 8000: 'Dev/API', 9200: 'Elasticsearch',
  4444: 'C2-suspect', 31337: 'C2-suspect',
}
const PROTO_COLORS = {
  'HTTPS': '#00c98d', 'HTTP': '#3b82f6', 'SSH': '#8b5cf6', 'DNS': '#f59e0b',
  'RDP': '#ef4444', 'SMB': '#f97316', 'MySQL': '#06b6d4', 'SMTP': '#ec4899',
  'Autres': '#475569',
}

function parseProtocols(parsedConns) {
  const counts = {}
  parsedConns.forEach(c => {
    const parts = (c.remote || '').split(':')
    const port = parseInt(parts[parts.length - 1])
    const proto = PORT_PROTO[port] || 'Autres'
    const bucket = ['HTTPS', 'HTTP', 'SSH', 'DNS', 'RDP', 'SMB', 'SMTP', 'Autres'].includes(proto) ? proto : 'Autres'
    counts[bucket] = (counts[bucket] || 0) + 1
  })
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1
  return Object.entries(counts)
    .map(([name, n]) => ({ name, value: Math.round(n / total * 100), color: PROTO_COLORS[name] || PROTO_COLORS.Autres }))
    .sort((a, b) => b.value - a.value)
}

function parseTopTalkers(parsedConns) {
  const counts = {}
  parsedConns.forEach(c => {
    const ip = (c.remote || '').split(':').slice(0, -1).join(':') || c.remote
    if (ip && ip !== '*' && !ip.startsWith('0.') && !ip.startsWith('127.') && !ip.startsWith('[:'))
      counts[ip] = (counts[ip] || 0) + 1
  })
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([ip, conns]) => ({ ip, name: ip, conns, bytes: conns * 1024 }))
}

let lastParsedConns = []

app.get('/api/network/traffic-history', (req, res) => {
  const period = req.query.period
  if (!period || period === 'live') return res.json({ history: trafficRing, period: 'live' })
  res.json({ history: history.query(period), period })
})

app.get('/api/network/protocols', (_req, res) => {
  res.json({ protocols: parseProtocols(lastParsedConns) })
})

app.get('/api/network/top-talkers', (_req, res) => {
  res.json({ talkers: parseTopTalkers(lastParsedConns) })
})

app.get('/api/network/per-proto-stats', (_req, res) => {
  const inc = {}, out = {}
  for (const c of lastParsedConns) {
    const lPort = parseInt((c.local || '').split(':').pop()) || 0
    const rPort = parseInt((c.remote || '').split(':').pop()) || 0
    const rName = PORT_PROTO[rPort] || null
    const lName = PORT_PROTO[lPort] || null
    const proto = rName || lName || 'Autres'
    const bucket = ['HTTPS','HTTP','SSH','DNS','RDP','SMB','MySQL','SMTP','Autres'].includes(proto) ? proto : 'Autres'
    if (lName && !rName) {
      inc[bucket] = (inc[bucket] || 0) + 1
    } else {
      out[bucket] = (out[bucket] || 0) + 1
    }
  }
  const all = [...new Set([...Object.keys(inc), ...Object.keys(out)])]
  const stats = all.map(p => ({
    name: p,
    inbound: inc[p] || 0,
    outbound: out[p] || 0,
    total: (inc[p] || 0) + (out[p] || 0),
    color: PROTO_COLORS[p] || '#475569',
  })).sort((a, b) => b.total - a.total)
  res.json({ stats, total: lastParsedConns.length })
})

app.get('/api/alerts/trends', (_req, res) => {
  const now = Date.now()
  const dayMs = 86400000
  const days = [6, 5, 4, 3, 2, 1, 0].map(d => {
    const start = now - (d + 1) * dayMs
    const end = now - d * dayMs
    const label = new Date(end).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
    const subset = db.alerts.filter(a => {
      const t = new Date(a.timestamp).getTime()
      return t >= start && t < end
    })
    return {
      date: label,
      critical: subset.filter(a => a.severity === 'critical').length,
      high: subset.filter(a => a.severity === 'high').length,
      medium: subset.filter(a => a.severity === 'medium').length,
      low: subset.filter(a => a.severity === 'low').length,
    }
  })
  res.json({ trends: days })
})

app.get('/api/alerts/stats', (_req, res) => {
  const total = db.alerts.length
  const bySeverity = ['critical', 'high', 'medium', 'low'].map(s => ({
    severity: s,
    count: db.alerts.filter(a => a.severity === s).length,
  }))
  res.json({ total, bySeverity, open: db.alerts.filter(a => a.status === 'open').length })
})

// ── SIEM / export ─────────────────────────────────────────────────────────────
app.get('/api/export/alerts', (_req, res) => {
  const fmt = _req.query.format || 'json'
  if (fmt === 'csv') {
    const headers = 'id,severity,type,source,destination,timestamp,status,mitre,riskScore'
    const rows = db.alerts.map(a =>
      [a.id, a.severity, `"${a.type}"`, a.source, a.destination, a.timestamp, a.status, a.mitre, a.riskScore].join(','))
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename=sentinet-alerts.csv')
    return res.send([headers, ...rows].join('\n'))
  }
  res.json({ alerts: db.alerts, exportedAt: new Date().toISOString(), count: db.alerts.length })
})

// ── WebSocket — live metrics every 3 s ───────────────────────────────────────
let wsAdapters = null, wsAdaptersTs = 0

wss.on('connection', (ws, req) => {
  // Authentification du WebSocket : jeton passé en paramètre de requête (?token=)
  try {
    const u = new URL(req.url, 'http://localhost')
    const payload = auth.verifyToken(u.searchParams.get('token'))
    if (!payload || payload.scope !== 'session') { ws.close(4001, 'unauthorized'); return }
  } catch { ws.close(4001, 'unauthorized'); return }

  let dead = false
  ws.on('close', () => { dead = true })
  ws.on('error', (err) => {
    dead = true
    console.warn('[WS client] erreur connexion :', err.message)
  })

  const tick = async () => {
    if (dead || ws.readyState !== WebSocket.OPEN) return

    try {
      // CPU
      const cpus = os.cpus()
      const cpu = cpus.reduce((acc, c) => {
        const tot = Object.values(c.times).reduce((a, b) => a + b, 0)
        return acc + (tot - c.times.idle) / tot * 100
      }, 0) / cpus.length

      // Memory
      const mem = (os.totalmem() - os.freemem()) / os.totalmem() * 100

      // Connexions actives (multi-OS) + analyse pour la détection
      const parsedConns = await platform.getConnections()
      const conns = parsedConns.length
      lastMetrics = { cpu: +cpu.toFixed(1), mem: +mem.toFixed(1), conns }

      // Real adapter throughput (computed first so detection can use inMbps)
      let inMbps = 0, outMbps = 0
      const adapters = await fetchAdapterStats()
      if (adapters && wsAdapters) {
        const dt = (Date.now() - wsAdaptersTs) / 1000
        const tp = calcThroughput(adapters, wsAdapters, dt)
        inMbps = tp.inMbps
        outMbps = tp.outMbps
      }
      if (adapters) { wsAdapters = adapters; wsAdaptersTs = Date.now() }

      // Run detection engine on real connections
      try { detection.analyze(parsedConns, inMbps) } catch {}
      try { detection.trackSessions(parsedConns) } catch {}

      // Update shared connection snapshot for REST endpoints
      lastParsedConns = parsedConns

      // Accumulate traffic ring buffer
      const now = new Date()
      const timeLabel = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      const threats = db.dynamicAlerts.filter(a => Date.now() - new Date(a.timestamp).getTime() < 30000).length
      trafficRing.push({ time: timeLabel, in: +inMbps.toFixed(3), out: +outMbps.toFixed(3), conns, threats })
      if (trafficRing.length > TRAFFIC_RING_SIZE) trafficRing.shift()

      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({
            type: 'metrics',
            data: {
              cpu: +cpu.toFixed(1),
              mem: +mem.toFixed(1),
              conns,
              sessions: detection.getSessionCount(),
              net: { inMbps, outMbps },
              alerts: { total: db.alerts.length, critical: db.alerts.filter(a => a.severity === 'critical' && a.status === 'open').length },
              threats, // menaces détectées sur les 30 dernières secondes (pour la courbe)
              ts: Date.now(),
            }
          }))
        } catch { /* connexion fermée entre check et send */ }
      }
    } catch (err) {
      console.warn('[WS tick] erreur rattrapée :', err.message)
    } finally {
      if (!dead) setTimeout(tick, 3000)
    }
  }

  setTimeout(tick, 500)
})

const HOST = process.env.HOST || '127.0.0.1'
server.listen(PORT, HOST, () => {
  console.log(`\n🛡️  SentiNet API  →  http://${HOST}:${PORT}`)
  console.log(`🔌  WebSocket    →  ws://${HOST}:${PORT}`)
  console.log(`🌐  Frontend     →  http://localhost:5210 (dev) / via nginx (prod)\n`)
})

// ── Chargement des flux de threat intelligence (réels) au démarrage + refresh ─
;(async () => {
  try {
    const s = await threatintel.refresh(detection)
    console.log(`[TI] Threat intel chargée : ${s.totalIocs} IoC depuis ${s.feeds.length} flux`)
  } catch (e) { console.warn('[TI] chargement initial:', e.message) }
})()
setInterval(() => { threatintel.refresh(detection).catch(() => {}) }, 6 * 3600 * 1000)

// ── Échantillonnage de l'historique de trafic (1 point / 60 s) ────────────────
let histPrevAdapters = null, histPrevTs = 0
async function sampleTrafficHistory() {
  try {
    const adapters = await fetchAdapterStats()
    if (!adapters) return
    if (histPrevAdapters) {
      const dt = (Date.now() - histPrevTs) / 1000
      const { inMbps, outMbps } = calcThroughput(adapters, histPrevAdapters, dt)
      const conns = lastParsedConns.length
      const threats = db.dynamicAlerts.filter(a => Date.now() - new Date(a.timestamp).getTime() < 60000).length
      history.record({ inMbps, outMbps, conns, threats })
    }
    histPrevAdapters = adapters
    histPrevTs = Date.now()
  } catch (e) { console.warn('[HIST] échantillon:', e.message) }
}
setInterval(sampleTrafficHistory, 60000)
sampleTrafficHistory() // amorce la mesure (premier point réel au passage suivant)
