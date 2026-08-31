#!/usr/bin/env node
'use strict'

// ═════════════════════════════════════════════════════════════════════════════
//  SentiNet — Agent-sonde distant (capteur réseau est-ouest)
//  Sniffe le trafic de l'interface (via tcpdump), agrège les flux observés sur
//  le réseau / domaine où il est installé, et les remonte au serveur central
//  qui exécute le moteur de détection et affiche les alertes par domaine/réseau.
//
//  Aucune dépendance npm (Node 18+ : fetch natif). Nécessite tcpdump + root
//  (repli automatique sur `ss` si tcpdump est indisponible).
//
//  Configuration par variables d'environnement :
//     SENTINET_URL     URL du serveur (ex. https://sentinet.devantiq.com)   [requis]
//     AGENT_KEY        clé partagée (= AGENT_KEY du serveur)                 [requis]
//     AGENT_ID         identifiant unique de l'agent (défaut : hostname)
//     AGENT_DOMAIN     domaine supervisé (ex. devantiq.com)
//     AGENT_NETWORK    libellé du réseau/segment (ex. "LAN Siège")
//     AGENT_SUBNET     sous-réseau surveillé (ex. 10.0.0.0/24)
//     IFACE            interface de capture (défaut : any)
//     WINDOW           fenêtre d'agrégation en secondes (défaut : 5)
//
//  Exemple :
//     sudo SENTINET_URL=https://sentinet.devantiq.com AGENT_KEY=xxxx \
//          AGENT_DOMAIN=devantiq.com AGENT_NETWORK="LAN Siège" \
//          AGENT_SUBNET=10.0.0.0/24 IFACE=eth0 node sentinet-agent.js
// ═════════════════════════════════════════════════════════════════════════════

const { spawn, execSync } = require('child_process')
const os = require('os')

const URL_BASE = (process.env.SENTINET_URL || '').replace(/\/$/, '')
const AGENT_KEY = process.env.AGENT_KEY || ''
const AGENT_ID = process.env.AGENT_ID || os.hostname()
const DOMAIN = process.env.AGENT_DOMAIN || '—'
const NETWORK = process.env.AGENT_NETWORK || 'Segment agent'
const SUBNET = process.env.AGENT_SUBNET || ''
const IFACE = process.env.IFACE || 'any'
const WINDOW = Math.max(2, parseInt(process.env.WINDOW || '5')) * 1000

if (!URL_BASE || !AGENT_KEY) {
  console.error('❌ SENTINET_URL et AGENT_KEY sont requis. Voir l\'en-tête du script.')
  process.exit(1)
}

const INGEST = `${URL_BASE}/api/agent/ingest`
let flows = new Map()   // clé -> { proto, local, remote }
let bytes = 0

function have(cmd) {
  try { execSync(`command -v ${cmd}`, { stdio: 'ignore' }); return true } catch { return false }
}

// ── Parsing d'une ligne tcpdump (-nn -q) ──────────────────────────────────────
// Ex. : 12:00:00.1 IP 10.0.0.5.51000 > 93.184.216.34.443: tcp 120
const LINE = / IP6? (\S+?)\.(\d+) > (\S+?)\.(\d+): (tcp|udp|UDP)\b(?:.*?\b(?:length )?(\d+))?/

function onLine(line) {
  const m = LINE.exec(line)
  if (!m) return
  const [, src, sport, dst, dport, protoRaw, len] = m
  const proto = protoRaw.toUpperCase()
  const key = `${proto}|${src}:${sport}|${dst}:${dport}`
  if (!flows.has(key)) flows.set(key, { proto, local: `${src}:${sport}`, remote: `${dst}:${dport}`, state: 'ESTABLISHED' })
  if (len) bytes += parseInt(len) || 0
  if (flows.size > 5000) flush() // garde-fou anti-explosion mémoire
}

// ── Capture ───────────────────────────────────────────────────────────────────
function startTcpdump() {
  console.log(`[agent] capture tcpdump sur ${IFACE} (fenêtre ${WINDOW / 1000}s)`)
  const td = spawn('tcpdump', ['-nn', '-q', '-l', '-i', IFACE, 'ip', 'and', '(tcp', 'or', 'udp)'], { stdio: ['ignore', 'pipe', 'pipe'] })
  let buf = ''
  let errBuf = ''
  td.stdout.on('data', d => {
    buf += d.toString()
    const lines = buf.split('\n'); buf = lines.pop()
    for (const l of lines) onLine(l)
  })
  td.stderr.on('data', d => { errBuf += d.toString() })
  td.on('error', (e) => console.error('[agent] tcpdump introuvable ?', e.message))
  td.on('exit', (code) => {
    if (code !== 0) {
      const msg = errBuf.trim().split('\n').filter(Boolean).slice(-2).join(' | ')
      if (msg) console.error(`[agent] tcpdump: ${msg}`)
      if (/no such device|SIOCGIFINDEX/i.test(errBuf)) console.error(`[agent] → l'interface « ${IFACE} » n'existe pas. Liste : ip -o link show`)
    }
    console.error(`[agent] tcpdump arrêté (code ${code}) — nouvelle tentative dans 5s`)
    setTimeout(startTcpdump, 5000)
  })
}

// Repli : snapshot des connexions via ss (socket-level, pas de vrai sniffing)
function pollSs() {
  console.log('[agent] tcpdump indisponible → repli sur ss (connexions locales)')
  setInterval(() => {
    try {
      const out = execSync('ss -tuan', { encoding: 'utf8' })
      for (const line of out.split('\n')) {
        const p = line.trim().split(/\s+/)
        if (p.length < 6) continue
        const proto = p[0].toUpperCase()
        if (proto !== 'TCP' && proto !== 'UDP') continue
        let state = p[1].toUpperCase(); if (state === 'ESTAB') state = 'ESTABLISHED'
        const key = `${proto}|${p[4]}|${p[5]}`
        flows.set(key, { proto, local: p[4], remote: p[5], state })
      }
    } catch {}
  }, 2000)
}

// ── Envoi périodique au serveur ───────────────────────────────────────────────
async function flush() {
  const connections = [...flows.values()]
  const throughputMbps = +(bytes * 8 / (WINDOW / 1000) / 1e6).toFixed(3)
  flows = new Map(); bytes = 0
  if (connections.length === 0) return
  try {
    const res = await fetch(INGEST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Key': AGENT_KEY },
      body: JSON.stringify({
        agentId: AGENT_ID, host: os.hostname(),
        domain: DOMAIN, network: NETWORK, subnet: SUBNET, iface: IFACE,
        interfaces: Object.values(os.networkInterfaces()).flat().filter(a => a && !a.internal).length,
        cpu: Math.round(os.loadavg()[0] / os.cpus().length * 100),
        throughputMbps, connections,
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) console.error(`[agent] envoi refusé : HTTP ${res.status}`)
    else console.log(`[agent] ${connections.length} flux remontés (${throughputMbps} Mbps)`)
  } catch (e) { console.error('[agent] envoi échoué :', e.message) }
}

// ── Démarrage ─────────────────────────────────────────────────────────────────
console.log(`[agent] SentiNet agent « ${AGENT_ID} » — domaine=${DOMAIN} réseau=${NETWORK} → ${URL_BASE}`)
if (have('tcpdump')) startTcpdump()
else pollSs()
setInterval(flush, WINDOW)
process.on('SIGINT', () => { console.log('\n[agent] arrêt'); process.exit(0) })
