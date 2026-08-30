'use strict'

// ─────────────────────────────────────────────────────────────────────────────
//  Couche d'abstraction OS — SentiNet
//  Fournit une API unique de collecte réseau / actions pare-feu, avec des
//  implémentations dédiées Windows (netstat/arp/PowerShell/netsh/w32tm) et
//  Linux (ss/ip neigh/ping -c//proc/net/dev/iptables/timedatectl).
//  Le format de retour est identique quel que soit l'OS, afin que le reste
//  du serveur et le moteur de détection restent inchangés.
// ─────────────────────────────────────────────────────────────────────────────

const { exec } = require('child_process')
const fs = require('fs')

const isWin = process.platform === 'win32'

// Application effective des blocages pare-feu sous Linux (iptables).
// Désactivé par défaut : sur un serveur partagé/en prod, SentiNet ne modifie pas
// les règles iptables de l'hôte (géré par ufw/Docker/etc.) tant que
// FIREWALL_ENFORCE n'est pas explicitement mis à "true". Les blocages restent
// alors journalisés et suivis (fwStatus: "tracked") sans effet réseau.
const FW_ENFORCE = process.env.FIREWALL_ENFORCE === 'true'

const run = (cmd) => new Promise((resolve) =>
  exec(cmd, { timeout: 15000, maxBuffer: 4 * 1024 * 1024 }, (err, out) =>
    resolve({ ok: !err, raw: out || '', err: err ? err.message : null })
  )
)

// ── Connexions actives ────────────────────────────────────────────────────────
// Retour normalisé : [{ proto:'TCP'|'UDP', local:'ip:port', remote:'ip:port', state:'ESTABLISHED'|... }]

function parseWinNetstat(raw) {
  return raw.split('\n')
    .map(l => l.trim().split(/\s+/))
    .filter(p => p[0] === 'TCP' || p[0] === 'UDP')
    .map(p => ({ proto: p[0], local: p[1], remote: p[2], state: p[3] || '' }))
}

function parseSs(raw) {
  // ss -tuan : Netid State Recv-Q Send-Q Local:Port Peer:Port
  const out = []
  for (const line of raw.split('\n')) {
    const p = line.trim().split(/\s+/)
    if (p.length < 6) continue
    const proto = p[0].toUpperCase()
    if (proto !== 'TCP' && proto !== 'UDP') continue
    let state = p[1].toUpperCase()
    if (state === 'ESTAB') state = 'ESTABLISHED' // aligne le vocabulaire Windows attendu par la détection
    out.push({ proto, local: p[4], remote: p[5], state })
  }
  return out
}

function parseLinuxNetstat(raw) {
  // netstat -tuan : Proto Recv-Q Send-Q Local Foreign State
  const out = []
  for (const line of raw.split('\n')) {
    const p = line.trim().split(/\s+/)
    if (!/^(tcp|udp)/i.test(p[0] || '')) continue
    out.push({
      proto: p[0].slice(0, 3).toUpperCase(), // tcp6/udp6 -> TCP/UDP
      local: p[3],
      remote: p[4],
      state: (p[5] || '').toUpperCase(),
    })
  }
  return out
}

async function getConnections() {
  if (isWin) {
    const { raw } = await run('netstat -an')
    return parseWinNetstat(raw)
  }
  // Linux : ss est préféré (rapide, présent par défaut) ; repli sur netstat
  const ss = await run('ss -tuan')
  if (ss.ok && ss.raw.trim()) return parseSs(ss.raw)
  const ns = await run('netstat -tuan')
  return parseLinuxNetstat(ns.raw)
}

// ── Hôtes voisins (table ARP) ─────────────────────────────────────────────────
// Retour : [{ ip, mac, type }]

function parseWinArp(raw) {
  return raw.split('\n')
    .map(l => l.match(/^\s+([\d.]+)\s+([\w-]+)\s+(\w+)/))
    .filter(Boolean)
    .map(m => ({ ip: m[1], mac: m[2], type: m[3] }))
}

function parseIpNeigh(raw) {
  // ip neigh : "192.168.1.1 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE"
  return raw.split('\n')
    .map(l => l.trim().match(/^(\S+)\s+dev\s+\S+\s+lladdr\s+([0-9a-fA-F:]+)\s+(\w+)/))
    .filter(Boolean)
    .map(m => ({ ip: m[1], mac: m[2], type: m[3].toLowerCase() }))
}

async function getHosts() {
  if (isWin) {
    const { raw } = await run('arp -a')
    return parseWinArp(raw)
  }
  const { raw, ok } = await run('ip neigh')
  if (ok && raw.trim()) return parseIpNeigh(raw)
  // repli : arp -a (net-tools) — "host (ip) at mac [ether] on iface"
  const arp = await run('arp -an')
  return arp.raw.split('\n')
    .map(l => l.match(/\(([\d.]+)\)\s+at\s+([0-9a-fA-F:]+)/))
    .filter(Boolean)
    .map(m => ({ ip: m[1], mac: m[2], type: 'dynamic' }))
}

// ── Ping (latence moyenne en ms) ──────────────────────────────────────────────

async function ping(host) {
  if (isWin) {
    const { raw } = await run(`ping -n 4 ${host}`)
    const m = raw.match(/Average = (\d+)ms/)
    return m ? +m[1] : null
  }
  const { raw } = await run(`ping -c 4 -w 8 ${host}`)
  // rtt min/avg/max/mdev = 0.1/0.2/0.3/0.4 ms
  const m = raw.match(/=\s*[\d.]+\/([\d.]+)\//)
  return m ? +parseFloat(m[1]).toFixed(1) : null
}

// ── Statistiques d'interfaces (octets RX/TX cumulés) ──────────────────────────
// Retour : [{ Name, ReceivedBytes, SentBytes }] — noms alignés Windows pour
// réutiliser calcThroughput() côté serveur sans modification.

async function fetchAdapterStats() {
  if (isWin) {
    const ps = [
      'powershell -NoProfile -NonInteractive -Command "',
      'Get-NetAdapterStatistics |',
      ' Where-Object {$_.ReceivedBytes -gt 0} |',
      ' Select-Object Name,ReceivedBytes,SentBytes |',
      ' ConvertTo-Json -Compress"',
    ].join('')
    const { raw, ok } = await run(ps)
    if (!ok || !raw.trim()) return null
    try {
      const p = JSON.parse(raw.trim())
      return Array.isArray(p) ? p : [p]
    } catch { return null }
  }
  // Linux : /proc/net/dev
  try {
    const data = fs.readFileSync('/proc/net/dev', 'utf8')
    const out = []
    for (const line of data.split('\n').slice(2)) {
      if (!line.includes(':')) continue
      const [name, rest] = line.split(':')
      const n = name.trim()
      if (!n || n === 'lo') continue
      const cols = rest.trim().split(/\s+/)
      const rx = +cols[0] || 0   // bytes reçus
      const tx = +cols[8] || 0   // bytes émis
      if (rx > 0 || tx > 0) out.push({ Name: n, ReceivedBytes: rx, SentBytes: tx })
    }
    return out.length ? out : null
  } catch { return null }
}

// ── Pare-feu : blocage / déblocage d'une IP ───────────────────────────────────
// Windows : netsh advfirewall ; Linux : iptables/ip6tables (nécessite root/CAP_NET_ADMIN)
// Retour : booléen "règle appliquée avec succès"

async function addFirewallBlock(ip, rule) {
  if (isWin) {
    const { ok: okIn } = await run(`netsh advfirewall firewall add rule name="${rule}_in" dir=in action=block remoteip=${ip} enable=yes`)
    const { ok: okOut } = await run(`netsh advfirewall firewall add rule name="${rule}_out" dir=out action=block remoteip=${ip} enable=yes`)
    return okIn && okOut
  }
  // Linux : n'applique iptables que si explicitement autorisé (voir FW_ENFORCE)
  if (!FW_ENFORCE) return false
  const ipt = ip.includes(':') ? 'ip6tables' : 'iptables'
  // -C teste l'existence de la règle ; on n'ajoute (-I) que si absente (idempotent)
  const inExists = await run(`${ipt} -C INPUT -s ${ip} -j DROP`)
  const outExists = await run(`${ipt} -C OUTPUT -d ${ip} -j DROP`)
  const { ok: okIn } = inExists.ok ? { ok: true } : await run(`${ipt} -I INPUT -s ${ip} -j DROP`)
  const { ok: okOut } = outExists.ok ? { ok: true } : await run(`${ipt} -I OUTPUT -d ${ip} -j DROP`)
  return okIn && okOut
}

async function removeFirewallBlock(ip, rule) {
  if (isWin) {
    await run(`netsh advfirewall firewall delete rule name="${rule}_in"`)
    await run(`netsh advfirewall firewall delete rule name="${rule}_out"`)
    return true
  }
  if (!FW_ENFORCE) return true
  const ipt = ip.includes(':') ? 'ip6tables' : 'iptables'
  await run(`${ipt} -D INPUT -s ${ip} -j DROP`)
  await run(`${ipt} -D OUTPUT -d ${ip} -j DROP`)
  return true
}

// ── Synchronisation temporelle (NTP) ──────────────────────────────────────────

async function checkNtp() {
  if (isWin) {
    const { raw, ok } = await run('w32tm /query /status')
    if (!ok) return { synced: false, source: 'unknown', error: 'w32tm indisponible' }
    const lines = raw.split('\n').map(l => l.trim())
    const sourceL = lines.find(l => l.startsWith('Source:'))
    const strataL = lines.find(l => l.startsWith('Stratum:'))
    return {
      synced: true,
      source: sourceL ? sourceL.replace('Source:', '').trim() : 'unknown',
      stratum: strataL ? strataL.replace('Stratum:', '').trim() : 'unknown',
      raw: raw.slice(0, 300),
    }
  }
  // Linux : timedatectl
  const { raw, ok } = await run('timedatectl show')
  if (!ok || !raw.trim()) {
    const st = await run('timedatectl status')
    const synced = /NTP service:\s*active|System clock synchronized:\s*yes/i.test(st.raw)
    return { synced, source: 'systemd-timesyncd', stratum: 'n/a', raw: st.raw.slice(0, 300) }
  }
  const synced = /NTPSynchronized=yes/.test(raw)
  const tz = (raw.match(/Timezone=(\S+)/) || [])[1] || 'unknown'
  return { synced, source: `systemd-timesyncd (${tz})`, stratum: 'n/a', raw: raw.slice(0, 300) }
}

module.exports = {
  isWin,
  run,
  getConnections,
  getHosts,
  ping,
  fetchAdapterStats,
  addFirewallBlock,
  removeFirewallBlock,
  checkNtp,
}
