'use strict'

// ─────────────────────────────────────────────────────────────────────────────
//  Threat Intelligence — ingestion de VRAIS flux d'IoC publics (EF-801/802)
//  Récupère des blocklists d'IP publiques gratuites et sans authentification,
//  alimente le moteur de détection (KNOWN_BAD_IPS) et expose les métadonnées
//  réelles des flux (nombre d'IoC, dernière mise à jour, statut, correspondances).
// ─────────────────────────────────────────────────────────────────────────────

const FEEDS = [
  { key: 'feodo',     name: 'Feodo Tracker (abuse.ch)', type: 'IP / C2 botnet',   url: 'https://feodotracker.abuse.ch/downloads/ipblocklist.txt' },
  { key: 'sslbl',     name: 'SSLBL Botnet C2 (abuse.ch)', type: 'IP / TLS C2',    url: 'https://sslbl.abuse.ch/blacklist/sslipblacklist.txt' },
  { key: 'blocklist', name: 'Blocklist.de',            type: 'IP / attaques',     url: 'https://lists.blocklist.de/lists/all.txt' },
]

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/

// État courant des flux (métadonnées réelles)
const state = new Map(FEEDS.map(f => [f.key, {
  ...f, iocs: 0, ips: new Set(), lastUpdate: null, status: 'pending', error: null,
}]))

// IoC internes ajoutés manuellement (EF-804)
const customIocs = new Set()

async function fetchFeed(feed) {
  const entry = state.get(feed.key)
  try {
    const res = await fetch(feed.url, {
      signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'SentiNet-NDR/3.2 (+threat-intel)' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    const ips = new Set()
    for (const raw of text.split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('#') || line.startsWith(';')) continue
      const ip = line.split(/[\s,;]/)[0]
      if (IPV4.test(ip)) ips.add(ip)
    }
    entry.ips = ips
    entry.iocs = ips.size
    entry.lastUpdate = new Date().toISOString()
    entry.status = ips.size > 0 ? 'active' : 'empty'
    entry.error = null
  } catch (e) {
    entry.status = 'error'
    entry.error = e.message
    entry.lastUpdate = entry.lastUpdate || null
  }
}

// Rafraîchit tous les flux et pousse les IP vers le moteur de détection
async function refresh(detection) {
  await Promise.all(FEEDS.map(fetchFeed))
  if (detection && detection.KNOWN_BAD_IPS) {
    for (const entry of state.values()) {
      for (const ip of entry.ips) detection.KNOWN_BAD_IPS.add(ip)
    }
    for (const ip of customIocs) detection.KNOWN_BAD_IPS.add(ip)
  }
  return getSummary()
}

// Toutes les IP malveillantes connues (flux + custom)
function allIps() {
  const s = new Set(customIocs)
  for (const entry of state.values()) for (const ip of entry.ips) s.add(ip)
  return s
}

function addCustom(ip) { if (IPV4.test(ip)) { customIocs.add(ip); return true } return false }
function getCustom() { return [...customIocs] }

// Métadonnées des flux ; matches = IoC réellement observés dans le trafic/alertes
function getFeeds(observedIps = new Set()) {
  const feeds = [...state.values()].map(e => ({
    name: e.name, type: e.type, url: e.url,
    iocs: e.iocs,
    lastUpdate: e.lastUpdate,
    status: e.status,
    error: e.error,
    matches: observedIps.size ? [...e.ips].filter(ip => observedIps.has(ip)).length : 0,
  }))
  // Flux interne (IoC ajoutés par les analystes)
  feeds.push({
    name: 'Feed interne SentiNet', type: 'IoC internes', url: null,
    iocs: customIocs.size, lastUpdate: null, status: 'active',
    matches: observedIps.size ? [...customIocs].filter(ip => observedIps.has(ip)).length : 0,
  })
  return feeds
}

function getSummary() {
  return {
    totalIocs: allIps().size,
    feeds: [...state.values()].map(e => ({ name: e.name, iocs: e.iocs, status: e.status })),
  }
}

module.exports = { FEEDS, refresh, getFeeds, allIps, addCustom, getCustom, getSummary }
