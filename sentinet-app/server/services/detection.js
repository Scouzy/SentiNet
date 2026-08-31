'use strict'

const EventEmitter = require('events')
const os = require('os')

const bus = new EventEmitter()
bus.setMaxListeners(100)

// ── IPs locales de la machine SentiNet (exclues des alertes de propre usage) ─
let _localIPs = null
function getLocalIPs() {
  if (_localIPs) return _localIPs
  _localIPs = new Set(['127.0.0.1', '::1', '0.0.0.0', '*', '[::]'])
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces) _localIPs.add(i.address)
  }
  return _localIPs
}

// Ports d'administration : suspects uniquement si dst est interne (mouvement latéral)
const ADMIN_PORTS = new Set([22, 3389, 445, 135, 139, 5985, 5986])

// ── Mutable rule store ────────────────────────────────────────────────────────
let rules = require('../data/signatures.json').map(r => ({ ...r }))

// ── Deduplication (cooldown per alert key) ────────────────────────────────────
const cooldowns = new Map()

function canFire(key, cooldownMs = 120000) {
  const now = Date.now()
  const last = cooldowns.get(key)
  if (last && now - last < cooldownMs) return false
  cooldowns.set(key, now)
  return true
}

// Contexte d'analyse courant (mono-hôte local vs agent distant)
let _ctx = {}            // { probe, segment, domain } injecté dans chaque alerte
let _excludeLocal = true // false pour le trafic observé par un agent (pas d'auto-exclusion)

function makeAlert(fields) {
  return {
    id: `DYN-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    severity: 'medium',
    type: 'Anomalie',
    description: '',
    source: '—',
    destination: '—',
    protocol: '—',
    timestamp: new Date().toISOString(),
    status: 'open',
    mitre: 'T1000',
    riskScore: 50,
    probe: 'LOCAL',
    segment: 'LOCAL',
    ..._ctx,
    ...fields,
  }
}

function emit(key, alert, cooldownMs) {
  if (!canFire(key, cooldownMs || alert._cooldown || 120000)) return null
  delete alert._cooldown
  bus.emit('alert', alert)
  return alert
}

// ── Helper ────────────────────────────────────────────────────────────────────
// Parse local/remote champ netstat — gère IPv4 (1.2.3.4:port) et IPv6 ([::1]:port)
function _parseAddr(s) {
  if (!s) return { ip: '', port: 0 }
  // IPv6 bracket notation : [addr]:port
  const m6 = s.match(/^\[(.+)\]:(\d+)$/)
  if (m6) return { ip: m6[1], port: parseInt(m6[2]) || 0 }
  // IPv4 addr:port
  const lastColon = s.lastIndexOf(':')
  if (lastColon > 0) return { ip: s.slice(0, lastColon), port: parseInt(s.slice(lastColon + 1)) || 0 }
  return { ip: s, port: 0 }
}
function srcOf(conn) { return _parseAddr(conn.local).ip }
function dstOf(conn) { return _parseAddr(conn.remote).ip }
function portOf(conn) { return _parseAddr(conn.remote).port }
function isPrivate(ip) { return /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1$|fe80:)/.test(ip) }
function isEmpty(ip) { return !ip || ip === '0.0.0.0' || ip === '*' || ip === '::' || ip === '[::]' }

// ── Beaconing detection (regular intervals to same external IP) ───────────────
const beaconTs = new Map()

function checkBeaconing(connections) {
  const alerts = []
  const now = Date.now()
  const localIPs = getLocalIPs()
  for (const c of connections) {
    if (c.state !== 'ESTABLISHED') continue
    const src = srcOf(c), dst = dstOf(c)
    if (isEmpty(dst) || isPrivate(dst) || dst === src) continue
    if (_excludeLocal && (localIPs.has(src) || isPrivate(src))) continue // exclure machine locale + IP privées (trafic local uniquement)
    const key = `${src}→${dst}`
    const ts = beaconTs.get(key) || []
    ts.push(now)
    if (ts.length > 24) ts.splice(0, ts.length - 24)
    beaconTs.set(key, ts)
    if (ts.length < 8) continue
    const diffs = ts.slice(1).map((t, i) => t - ts[i])
    const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length
    const std = Math.sqrt(diffs.reduce((a, b) => a + (b - avg) ** 2, 0) / diffs.length)
    const cv = avg > 0 ? std / avg : 1
    // avg > 25s : évite de confondre connexions TCP persistantes (intervalle polling = 5s)
    // avg < 600s : plage réaliste pour du beaconing C2
    // cv < 0.12 : très régulier (pas de jitter naturel)
    if (cv < 0.12 && avg > 25000 && avg < 600000) {
      const a = emit(`beacon:${key}`, makeAlert({
        type: 'Beaconing C2',
        severity: 'high',
        description: `Beaconing vers ${dst} — intervalle ≈ ${Math.round(avg / 1000)}s (CV=${cv.toFixed(3)}) depuis ${src}`,
        source: src, destination: dst, protocol: c.proto,
        mitre: 'T1071.001', riskScore: 88,
      }), 300000)
      if (a) alerts.push(a)
    }
  }
  return alerts
}

// ── Lateral movement (admin protocols to many internal hosts) ─────────────────
const LATERAL_PORTS = new Set([445, 135, 139, 5985, 5986, 3389, 22])

function checkLateral(connections) {
  const alerts = []
  const localIPs = getLocalIPs()
  const srcMap = new Map()
  for (const c of connections) {
    if (c.state !== 'ESTABLISHED') continue
    const src = srcOf(c), dst = dstOf(c)
    if (_excludeLocal && localIPs.has(src)) continue // la machine SentiNet elle-même ne génère pas de faux positifs
    const port = portOf(c)
    if (!isPrivate(dst) || isEmpty(dst) || !LATERAL_PORTS.has(port)) continue
    const hosts = srcMap.get(src) || new Set()
    hosts.add(dst)
    srcMap.set(src, hosts)
  }
  for (const [src, hosts] of srcMap) {
    if (hosts.size >= 4) {
      const a = emit(`lateral:${src}`, makeAlert({
        type: 'Mouvement latéral',
        severity: 'critical',
        description: `${src} — connexions admin (SMB/RDP/WinRM/SSH) vers ${hosts.size} hôtes internes distincts`,
        source: src, destination: `${hosts.size} hôtes internes`, protocol: 'TCP',
        mitre: 'T1021.002', riskScore: 93,
      }), 300000)
      if (a) alerts.push(a)
    }
  }
  return alerts
}

// ── Port scan ─────────────────────────────────────────────────────────────────
// Algorithme : on compte les ports DISTINCTS sur la MÊME IP cible
// Cela évite de confondre la navigation web normale (beaucoup d'IPs, 1-2 ports)
// avec un vrai scan (1 IP cible, beaucoup de ports différents)
function checkPortScan(connections) {
  const alerts = []
  const localIPs = getLocalIPs()
  // clé = "srcIP→dstIP", valeur = Set des ports distants testés sur ce dst
  const pairPorts = new Map()
  for (const c of connections) {
    if (c.proto !== 'TCP') continue
    const src = srcOf(c), dst = dstOf(c), port = portOf(c)
    if (!port || isEmpty(dst)) continue
    if (_excludeLocal && (localIPs.has(src) || isPrivate(src))) continue // exclure machine locale + IP privées (trafic local uniquement)
    if (isEmpty(dst) || dst === '::1' || dst === '127.0.0.1') continue // exclure loopback dst
    const key = `${src}→${dst}`
    const ports = pairPorts.get(key) || new Set()
    ports.add(port)
    pairPorts.set(key, ports)
  }
  for (const [key, ports] of pairPorts) {
    if (ports.size >= 20) { // 20 ports distincts vers la MÊME cible = scan (seuil rehaussé)
      const [src, dst] = key.split('→')
      const a = emit(`scan:${key}`, makeAlert({
        type: 'Balayage de ports',
        severity: 'high',
        description: `Scan TCP depuis ${src} vers ${dst} — ${ports.size} ports distincts sondés`,
        source: src, destination: dst, protocol: 'TCP',
        mitre: 'T1046', riskScore: 76,
      }), 120000)
      if (a) alerts.push(a)
    }
  }
  return alerts
}

// ── IoC matching ──────────────────────────────────────────────────────────────
// IoC curés (C2/backdoor confirmés) — haute confiance → alerte CRITIQUE
const KNOWN_BAD_IPS = new Set([
  '185.234.219.44', '91.134.178.201', '103.21.244.18',
  '45.33.32.156', '198.51.100.99', '192.0.2.100',
  '5.188.86.172', '194.165.16.158',
])
// IoC issus des flux publics de réputation (bruités) — confiance moindre → alerte MOYENNE
const FEED_BAD_IPS = new Set()
const C2_PORTS = new Set([4444, 1337, 31337, 8888, 9001, 6667, 6697])

function checkIoC(connections) {
  const alerts = []
  for (const c of connections) {
    const dst = dstOf(c), port = portOf(c)
    if (KNOWN_BAD_IPS.has(dst)) {
      // IoC curé / ajouté par un analyste → critique
      const a = emit(`ioc:ip:${dst}`, makeAlert({
        type: 'IoC — IP malveillante (confirmée)',
        severity: 'critical',
        description: `Connexion vers une IP répertoriée comme C2/malveillante confirmée : ${dst}`,
        source: srcOf(c), destination: dst, protocol: c.proto,
        mitre: 'T1071', riskScore: 91,
      }), 600000)
      if (a) alerts.push(a)
    } else if (FEED_BAD_IPS.has(dst)) {
      // Correspondance avec un flux public de réputation → confiance moindre → moyen
      const a = emit(`ioc:feed:${dst}`, makeAlert({
        type: 'IoC — réputation (flux public)',
        severity: 'medium',
        description: `Connexion vers une IP présente dans un flux public de threat intelligence : ${dst}`,
        source: srcOf(c), destination: dst, protocol: c.proto,
        mitre: 'T1071', riskScore: 55,
      }), 600000)
      if (a) alerts.push(a)
    }
    if (C2_PORTS.has(port)) {
      const a = emit(`ioc:port:${dst}:${port}`, makeAlert({
        type: 'Port C2 connu',
        severity: 'high',
        description: `Connexion vers port ${port} (C2/backdoor connu) — ${srcOf(c)} → ${dst}`,
        source: srcOf(c), destination: dst, protocol: c.proto,
        mitre: 'T1071', riskScore: 82,
      }), 300000)
      if (a) alerts.push(a)
    }
  }
  return alerts
}

// ── Signature-based matching ──────────────────────────────────────────────────
function checkSignatures(connections) {
  const alerts = []
  const localIPs = getLocalIPs()
  for (const rule of rules.filter(r => r.enabled)) {
    for (const c of connections) {
      let match = true
      if (rule.match.proto && rule.match.proto !== c.proto) match = false
      if (rule.match.port && portOf(c) !== rule.match.port) match = false
      if (rule.match.state && c.state !== rule.match.state) match = false
      if (!match) continue

      const src = srcOf(c), dst = dstOf(c)
      const port = portOf(c)

      // Ports d'administration (SSH, RDP, SMB, WinRM…) :
      // Ces règles visent le mouvement latéral INTERNE — ignorer si :
      //   • la source est la machine SentiNet elle-même (usage légitime de l'opérateur)
      //   • OU la destination est externe (connexion admin vers l'extérieur = normal)
      if (ADMIN_PORTS.has(port)) {
        if (localIPs.has(src)) continue        // opérateur se connecte en SSH/RDP/SMB → pas une alerte
        if (!isPrivate(dst) && !isEmpty(dst)) continue // connexion admin vers externe → pas une alerte
      }

      // Connexions vers des destinations vides / loopback → ignorer
      if (isEmpty(dst) || dst === '0.0.0.0') continue

      const a = emit(`sig:${rule.id}:${src}:${dst}`, makeAlert({
        type: rule.name, severity: rule.severity,
        description: `[${rule.id}] ${rule.description} — ${src} → ${dst}:${port}`,
        source: src, destination: dst, protocol: c.proto,
        mitre: rule.mitre, riskScore: rule.riskScore,
      }), rule.cooldown || 120000)
      if (a) alerts.push(a)
    }
  }
  return alerts
}

// ── Volume anomaly (high throughput spike) ────────────────────────────────────
function checkVolumeAnomaly(inMbps) {
  if (inMbps > 800) {
    return emit('vol:spike', makeAlert({
      type: 'Pic de trafic anormal',
      severity: 'high',
      description: `Pic de trafic entrant : ${inMbps.toFixed(1)} Mbps — possible DDoS/exfiltration`,
      source: 'Réseau', destination: 'Local', protocol: '*',
      mitre: 'T1498', riskScore: 74,
    }), 120000)
  }
  return null
}

// ── Session tracking ──────────────────────────────────────────────────────────
const sessionStore = new Map() // key -> { first, last, count }

function trackSessions(connections) {
  const now = Date.now()
  for (const c of connections) {
    if (c.state !== 'ESTABLISHED') continue
    const key = `${srcOf(c)}:${portOf(c) > 0 ? portOf(c) : c.proto}`
    const s = sessionStore.get(key) || { first: now, count: 0 }
    s.last = now
    s.count++
    sessionStore.set(key, s)
  }
  // Prune old sessions (> 1h)
  for (const [k, s] of sessionStore) {
    if (now - s.last > 3600000) sessionStore.delete(k)
  }
  return sessionStore.size
}

function getSessionCount() { return sessionStore.size }

// ── Main analysis entry point ─────────────────────────────────────────────────
function analyze(connections, inMbps = 0, opts = {}) {
  // opts.excludeLocal=false pour le trafic OBSERVÉ par un agent (sonde distante) ;
  // opts.tag = { probe, segment, domain } injecté dans chaque alerte émise.
  _ctx = opts.tag || {}
  _excludeLocal = opts.excludeLocal !== false
  const results = []
  try { results.push(...checkBeaconing(connections)) } catch {}
  try { results.push(...checkLateral(connections)) } catch {}
  try { results.push(...checkPortScan(connections)) } catch {}
  try { results.push(...checkIoC(connections)) } catch {}
  try { results.push(...checkSignatures(connections)) } catch {}
  try { const v = checkVolumeAnomaly(inMbps); if (v) results.push(v) } catch {}
  _ctx = {}; _excludeLocal = true
  return results
}

// ── NTP check (multi-OS, délégué à la couche plateforme) ──────────────────────
const platform = require('./platform')
function checkNtp() {
  return platform.checkNtp()
}

// ── Rule management API ───────────────────────────────────────────────────────
module.exports = {
  analyze,
  trackSessions,
  getSessionCount,
  checkNtp,
  bus,
  getRules: () => rules,
  addRule(rule) {
    const r = {
      id: `SIG-${Date.now()}`,
      enabled: true,
      source: 'custom',
      updated: new Date().toISOString().slice(0, 10),
      cooldown: 120000,
      match: {},
      ...rule,
    }
    rules.push(r)
    return r
  },
  updateRule(id, data) {
    const r = rules.find(x => x.id === id)
    if (!r) throw new Error(`Règle ${id} introuvable`)
    Object.assign(r, data, { updated: new Date().toISOString().slice(0, 10) })
    return r
  },
  deleteRule(id) {
    const before = rules.length
    rules = rules.filter(r => r.id !== id)
    if (rules.length === before) throw new Error(`Règle ${id} introuvable`)
  },
  KNOWN_BAD_IPS,
  FEED_BAD_IPS,
  addIoC(ip) { KNOWN_BAD_IPS.add(ip) },              // IoC curé → critique
  addFeedIoC(ip) { FEED_BAD_IPS.add(ip) },           // IoC flux public → moyen
  isMalicious(ip) { return KNOWN_BAD_IPS.has(ip) || FEED_BAD_IPS.has(ip) },
}
