'use strict'

// ─────────────────────────────────────────────────────────────────────────────
//  Historique du trafic — séries temporelles multi-résolution (EF-406)
//  · minute : 1 point/min, ~48 h   → vues « 24 h »
//  · heure  : 1 point/h,   ~90 j   → vues « 1 semaine », « 1 mois »
//  · jour   : 1 point/j,   ~2 ans  → vues « 6 mois », « 1 an »
//  Agrégation par moyenne au changement d'heure / de jour. Persisté sur disque.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')

const FILE = path.join(__dirname, '..', 'data', 'traffic-history.json')
const CAPS = { minute: 2880, hour: 2160, day: 800 }

let series = { minute: [], hour: [], day: [] }
try {
  const s = JSON.parse(fs.readFileSync(FILE, 'utf8'))
  series = { minute: s.minute || [], hour: s.hour || [], day: s.day || [] }
} catch { /* première exécution : historique vide */ }

let hourAcc = null // { key, t, in, out, conns, threats, n }
let dayAcc = null

let saveTimer = null
function save() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(FILE, JSON.stringify(series)) } catch (e) { console.warn('[HIST] écriture:', e.message) }
  }, 3000)
}

function cap(arr, n) { if (arr.length > n) arr.splice(0, arr.length - n) }

function avgPoint(acc) {
  return {
    t: acc.t,
    in: +(acc.in / acc.n).toFixed(3),
    out: +(acc.out / acc.n).toFixed(3),
    conns: Math.round(acc.conns / acc.n),
    threats: Math.round(acc.threats / acc.n),
  }
}

function record({ inMbps = 0, outMbps = 0, conns = 0, threats = 0 }) {
  const now = Date.now()
  const d = new Date(now)

  series.minute.push({ t: now, in: +(+inMbps).toFixed(3), out: +(+outMbps).toFixed(3), conns, threats })
  cap(series.minute, CAPS.minute)

  const hourKey = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}`
  if (!hourAcc || hourAcc.key !== hourKey) {
    if (hourAcc && hourAcc.n) { series.hour.push(avgPoint(hourAcc)); cap(series.hour, CAPS.hour) }
    hourAcc = { key: hourKey, t: now, in: 0, out: 0, conns: 0, threats: 0, n: 0 }
  }
  hourAcc.in += +inMbps; hourAcc.out += +outMbps; hourAcc.conns += conns; hourAcc.threats += threats; hourAcc.n++

  const dayKey = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
  if (!dayAcc || dayAcc.key !== dayKey) {
    if (dayAcc && dayAcc.n) { series.day.push(avgPoint(dayAcc)); cap(series.day, CAPS.day) }
    dayAcc = { key: dayKey, t: now, in: 0, out: 0, conns: 0, threats: 0, n: 0 }
  }
  dayAcc.in += +inMbps; dayAcc.out += +outMbps; dayAcc.conns += conns; dayAcc.threats += threats; dayAcc.n++

  save()
}

// Ré-échantillonne un tableau à ~target points (moyenne par seau) pour la lisibilité
function downsample(pts, target) {
  if (pts.length <= target) return pts
  const bucket = Math.ceil(pts.length / target)
  const out = []
  for (let i = 0; i < pts.length; i += bucket) {
    const slice = pts.slice(i, i + bucket)
    const n = slice.length
    out.push({
      t: slice[Math.floor(n / 2)].t,
      in: +(slice.reduce((s, p) => s + p.in, 0) / n).toFixed(3),
      out: +(slice.reduce((s, p) => s + p.out, 0) / n).toFixed(3),
      conns: Math.round(slice.reduce((s, p) => s + p.conns, 0) / n),
      threats: Math.round(slice.reduce((s, p) => s + p.threats, 0) / n),
    })
  }
  return out
}

const H = 3600e3, D = 86400e3
const RANGES = {
  '24h':  { key: 'minute', span: 24 * H,   target: 144, acc: () => hourAcc },
  '7d':   { key: 'hour',   span: 7 * D,    target: 168, acc: () => hourAcc },
  '30d':  { key: 'hour',   span: 30 * D,   target: 180, acc: () => hourAcc },
  '180d': { key: 'day',    span: 180 * D,  target: 180, acc: () => dayAcc },
  '365d': { key: 'day',    span: 365 * D,  target: 180, acc: () => dayAcc },
}

function query(period) {
  const cfg = RANGES[period] || RANGES['24h']
  const now = Date.now()
  let pts = series[cfg.key].filter(p => p.t >= now - cfg.span)
  // inclut le seau partiel courant (heure/jour en cours) comme dernier point
  if (cfg.key !== 'minute') {
    const acc = cfg.acc()
    if (acc && acc.n) pts = [...pts, avgPoint({ ...acc, t: now })]
  }
  return downsample(pts, cfg.target)
}

module.exports = { record, query }
