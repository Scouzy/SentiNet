'use strict'

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

app.use(cors({ origin: '*' }))
app.use(express.json())
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

const PORT = 3010

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
      fs.writeFileSync(DB_PATH, JSON.stringify({ alerts: db.alerts.slice(0, 500), blocks: db.blocks, users: db.users }, null, 2))
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

// ── EventBus — detection engine → alerts store ────────────────────────────────
detection.bus.on('alert', (alert) => {
  db.alerts.unshift(alert)
  if (db.alerts.length > 500) db.alerts.splice(500)
  db.dynamicAlerts.unshift(alert)
  if (db.dynamicAlerts.length > 100) db.dynamicAlerts.splice(100)
  audit.write('DETECTION_ALERT', 'system', alert.source, { type: alert.type, severity: alert.severity, mitre: alert.mitre })
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
  const { raw } = await run('netstat -an')
  const conns = raw.split('\n')
    .map(l => l.trim().split(/\s+/))
    .filter(p => p[0] === 'TCP' || p[0] === 'UDP')
    .map(p => ({ proto: p[0], local: p[1], remote: p[2], state: p[3] || '' }))
  res.json({ connections: conns, count: conns.length })
})

// ── ARP table (local hosts) ───────────────────────────────────────────────────
app.get('/api/network/hosts', async (_req, res) => {
  const { raw } = await run('arp -a')
  const hosts = raw.split('\n')
    .map(l => l.match(/^\s+([\d.]+)\s+([\w-]+)\s+(\w+)/))
    .filter(Boolean)
    .map(m => ({ ip: m[1], mac: m[2], type: m[3] }))
  res.json({ hosts })
})

// ── Ping latency ──────────────────────────────────────────────────────────────
app.get('/api/network/ping/:host', async (req, res) => {
  const h = req.params.host
  if (!/^[\w.\-]+$/.test(h)) return res.status(400).json({ error: 'Hôte invalide' })
  const { raw } = await run(`ping -n 4 ${h}`)
  const m = raw.match(/Average = (\d+)ms/)
  res.json({ host: h, latency: m ? +m[1] : null })
})

// ── Real adapter throughput (PowerShell) ──────────────────────────────────────
let prevAdapters = null
let prevAdaptersTs = 0

async function fetchAdapterStats() {
  const ps = [
    'powershell -NoProfile -NonInteractive -Command "',
    'Get-NetAdapterStatistics |',
    ' Where-Object {$_.ReceivedBytes -gt 0} |',
    ' Select-Object Name,ReceivedBytes,SentBytes |',
    ' ConvertTo-Json -Compress"'
  ].join('')
  const { raw, ok } = await run(ps)
  if (!ok || !raw.trim()) return null
  try {
    const p = JSON.parse(raw.trim())
    return Array.isArray(p) ? p : [p]
  } catch { return null }
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

  // Apply Windows Firewall rules (requires admin — graceful fallback if not)
  const { ok: okIn } = await run(`netsh advfirewall firewall add rule name="${rule}_in" dir=in action=block remoteip=${ip} enable=yes`)
  const { ok: okOut } = await run(`netsh advfirewall firewall add rule name="${rule}_out" dir=out action=block remoteip=${ip} enable=yes`)
  block.fwStatus = (okIn && okOut) ? 'active' : 'tracked'
  if (!block.permanent) {
    const expiresTs = Date.now() + 2 * 3600 * 1000
    block.expires = new Date(expiresTs).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }

  // Auto-update linked alert status
  if (alertId) {
    const a = db.alerts.find(x => x.id === alertId)
    if (a) a.status = 'blocked'
  }
  saveDb()
  res.json({ block })
})

app.delete('/api/blocks/:ip', async (req, res) => {
  const ip = decodeURIComponent(req.params.ip)
  const idx = db.blocks.findIndex(b => b.ip === ip)
  if (idx === -1) return res.status(404).json({ error: 'Non trouvé' })
  const [b] = db.blocks.splice(idx, 1)
  if (b.fwStatus === 'active') {
    await run(`netsh advfirewall firewall delete rule name="${b.rule}_in"`)
    await run(`netsh advfirewall firewall delete rule name="${b.rule}_out"`)
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
app.get('/api/users', (_req, res) => res.json({ users: db.users }))

app.post('/api/users', (req, res) => {
  const u = { id: Date.now(), mfa: false, status: 'active', lastLogin: null, ...req.body }
  db.users.push(u)
  audit.write('USER_CREATE', req.body.createdBy || 'admin', u.email, { role: u.role })
  saveDb()
  res.json({ user: u })
})

app.patch('/api/users/:id', (req, res) => {
  const u = db.users.find(x => String(x.id) === req.params.id)
  if (!u) return res.status(404).json({ error: 'Non trouvé' })
  Object.assign(u, req.body)
  audit.write('USER_UPDATE', 'admin', u.email, req.body)
  saveDb()
  res.json({ user: u })
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
  res.json({ ok: true, users: db.users })
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
  res.json({ ok: true, user: { ...u, mfaSecret: undefined, mfaPending: undefined } })
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
  res.json({ ok: true, user: u })
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
  audit.write('IOC_ADD', 'user', ip, {})
  res.json({ ok: true, ip })
})

app.get('/api/threat-intel/check/:ip', (req, res) => {
  const ip = req.params.ip
  res.json({ ip, malicious: detection.KNOWN_BAD_IPS.has(ip) })
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

app.get('/api/network/traffic-history', (_req, res) => res.json({ history: trafficRing }))

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

wss.on('connection', (ws) => {
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

      // Active connections (netstat) + parse for detection
      const { raw: ns } = await run('netstat -an')
      const parsedConns = ns.split('\n')
        .map(l => l.trim().split(/\s+/))
        .filter(p => p[0] === 'TCP' || p[0] === 'UDP')
        .map(p => ({ proto: p[0], local: p[1], remote: p[2], state: p[3] || '' }))
      const conns = parsedConns.length

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

server.listen(PORT, () => {
  console.log(`\n🛡️  SentiNet API  →  http://localhost:${PORT}`)
  console.log(`🔌  WebSocket    →  ws://localhost:${PORT}`)
  console.log(`🌐  Frontend     →  http://localhost:5210\n`)
})
