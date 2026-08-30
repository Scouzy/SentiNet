import React, { useState, useEffect } from 'react'
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  ArrowDownToLine, ArrowUpFromLine, Wifi, Activity,
  Search, Circle,
} from 'lucide-react'
import { api } from '../services/api'
import { useWebSocket } from '../hooks/useWebSocket'

const STATE_COLORS = {
  ESTABLISHED: 'text-cyber-400',
  LISTENING:   'text-blue-400',
  TIME_WAIT:   'text-yellow-400',
  CLOSE_WAIT:  'text-orange-400',
  SYN_SENT:    'text-purple-400',
  FIN_WAIT:    'text-slate-400',
}

function KpiCard({ label, value, unit, icon: Icon, colorClass, bgClass, live }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg border ${bgClass}`}>
          <Icon className={`w-4 h-4 ${colorClass}`} />
        </div>
        <div className={`w-1.5 h-1.5 rounded-full mt-1 ${live ? 'bg-cyber-500 animate-pulse' : 'bg-slate-600'}`} />
      </div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold font-mono ${colorClass}`}>{value}</span>
        {unit && <span className="text-xs text-slate-500">{unit}</span>}
      </div>
    </div>
  )
}

export default function Traffic() {
  const { metrics, trafficHistory, connected } = useWebSocket()
  const [protoStats, setProtoStats]   = useState([])
  const [topTalkers, setTopTalkers]   = useState([])
  const [connections, setConnections] = useState([])
  const [searchConn, setSearchConn]   = useState('')
  const [filterProto, setFilterProto] = useState('all')
  const [filterState, setFilterState] = useState('all')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const load = () => Promise.allSettled([
      api.getProtoStats(),
      api.getTopTalkers(),
      api.getConnections(),
    ]).then(([p, t, c]) => {
      if (p.status === 'fulfilled') setProtoStats(p.value.stats || [])
      if (t.status === 'fulfilled') setTopTalkers(t.value.talkers || [])
      if (c.status === 'fulfilled') setConnections(c.value.connections || [])
      setTick(n => n + 1)
    })
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [])

  const inMbps   = +(metrics?.net?.inMbps  ?? 0).toFixed(3)
  const outMbps  = +(metrics?.net?.outMbps ?? 0).toFixed(3)
  const totalMbps = inMbps + outMbps
  const activeConns = metrics?.conns ?? connections.length
  const sessions    = metrics?.sessions ?? '—'

  const totalProtoConns = protoStats.reduce((s, p) => s + p.total, 0) || 1

  const protoWithBw = protoStats.map(p => ({
    ...p,
    bwEst: totalMbps > 0
      ? +((totalMbps * p.total / totalProtoConns).toFixed(3))
      : 0,
  }))

  const states = [...new Set(connections.map(c => c.state).filter(Boolean))].sort()

  const filteredConns = connections.filter(c => {
    if (filterProto !== 'all' && c.proto !== filterProto) return false
    if (filterState !== 'all' && c.state !== filterState) return false
    if (searchConn) {
      const q = searchConn.toLowerCase()
      if (!c.remote?.toLowerCase().includes(q) && !c.local?.toLowerCase().includes(q)) return false
    }
    return true
  })

  const byState = connections.reduce((acc, c) => {
    acc[c.state || 'INCONNU'] = (acc[c.state || 'INCONNU'] || 0) + 1
    return acc
  }, {})

  return (
    <div className="p-6 space-y-6">

      {/* Live indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-cyber-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-xs text-slate-400">
            {connected ? 'Flux en direct — bande passante mise à jour toutes les 3 s · connexions toutes les 5 s' : 'Reconnexion au serveur…'}
          </span>
        </div>
        <span className="text-[10px] text-slate-600 font-mono">
          {new Date().toLocaleTimeString('fr-FR')}
        </span>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Débit entrant"      value={inMbps}      unit="Mbps" icon={ArrowDownToLine}  colorClass="text-cyber-400"   bgClass="bg-cyber-500/10 border-cyber-500/20"   live={connected} />
        <KpiCard label="Débit sortant"      value={outMbps}     unit="Mbps" icon={ArrowUpFromLine}  colorClass="text-blue-400"    bgClass="bg-blue-500/10 border-blue-500/20"     live={connected} />
        <KpiCard label="Connexions actives" value={activeConns} unit=""     icon={Wifi}             colorClass="text-orange-400"  bgClass="bg-orange-500/10 border-orange-500/20" live={connected} />
        <KpiCard label="Sessions suivies"   value={sessions}    unit=""     icon={Activity}         colorClass="text-purple-400"  bgClass="bg-purple-500/10 border-purple-500/20" live={connected} />
      </div>

      {/* ── Bandwidth Area Chart + Protocol Bars ──────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Area Chart */}
        <div className="card p-5 xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Trafic entrant / sortant — Temps réel</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {trafficHistory.length} points · fenêtre ≈ {Math.round(trafficHistory.length * 3 / 60)} min
              </p>
            </div>
            <div className="flex items-center gap-4 text-[10px] text-slate-500">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 rounded bg-cyber-400" /> Entrant
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 rounded bg-blue-400" /> Sortant
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={trafficHistory} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#00c98d" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00c98d" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2d4e" />
              <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} unit=" M" width={40} />
              <Tooltip
                contentStyle={{ background: '#0a1628', border: '1px solid #1a2d4e', borderRadius: '8px', fontSize: '11px' }}
                formatter={(v, n) => [`${v} Mbps`, n === 'in' ? '↓ Entrant' : '↑ Sortant']}
              />
              <Area type="monotone" dataKey="in"  stroke="#00c98d" strokeWidth={2} fill="url(#gIn)"  dot={false} activeDot={{ r: 3 }} />
              <Area type="monotone" dataKey="out" stroke="#3b82f6" strokeWidth={2} fill="url(#gOut)" dot={false} activeDot={{ r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Protocol Distribution */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Protocoles actifs</h2>
          <p className="text-xs text-slate-500 mb-4">
            {protoStats.length > 0
              ? `${totalProtoConns} connexions réparties sur ${protoStats.length} protocoles`
              : 'En attente de données réseau…'}
          </p>
          <div className="space-y-3">
            {protoWithBw.slice(0, 9).map(p => {
              const pct = Math.round(p.total / totalProtoConns * 100)
              return (
                <div key={p.name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
                      <span className="text-xs font-semibold text-slate-200">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono">
                      <span className="text-cyber-400" title="Entrant">↓{p.inbound}</span>
                      <span className="text-blue-400"  title="Sortant">↑{p.outbound}</span>
                      <span className="text-slate-500">{pct}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-dark-600 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: p.color }} />
                  </div>
                </div>
              )
            })}
            {protoStats.length === 0 && (
              <p className="text-[10px] text-slate-600 text-center py-6">
                En attente de connexions réseau…
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Connexions Actives par état + Connexions Chart ─────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Répartition par état */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-white mb-1">État des connexions TCP</h2>
          <p className="text-xs text-slate-500 mb-4">{connections.length} connexions total</p>
          <div className="space-y-2.5">
            {Object.entries(byState)
              .sort((a, b) => b[1] - a[1])
              .map(([state, count]) => {
                const pct = Math.round(count / (connections.length || 1) * 100)
                const col = STATE_COLORS[state] || 'text-slate-400'
                const bg = {
                  ESTABLISHED: '#00c98d', LISTENING: '#3b82f6', TIME_WAIT: '#eab308',
                  CLOSE_WAIT: '#f97316', SYN_SENT: '#8b5cf6',
                }[state] || '#475569'
                return (
                  <div key={state}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-mono font-semibold ${col}`}>{state}</span>
                      <div className="flex items-center gap-2 text-[10px] font-mono">
                        <span className="text-slate-300">{count}</span>
                        <span className="text-slate-600">{pct}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-dark-600 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: bg }} />
                    </div>
                  </div>
                )
              })}
            {connections.length === 0 && (
              <p className="text-[10px] text-slate-600 text-center py-6">En attente…</p>
            )}
          </div>
        </div>

        {/* Top Talkers */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-dark-600">
            <h2 className="text-sm font-semibold text-white">Top IP communicantes</h2>
            <p className="text-xs text-slate-500 mt-0.5">Classement par volume de connexions actives</p>
          </div>
          <div className="divide-y divide-dark-600/50">
            {topTalkers.length === 0 && (
              <div className="px-5 py-6 text-center text-slate-500 text-xs">En attente de données…</div>
            )}
            {topTalkers.map((t, i) => {
              const maxC = topTalkers[0]?.conns || 1
              const pct  = Math.round(t.conns / maxC * 100)
              const hue  = 190 + i * 22
              return (
                <div key={t.ip} className="px-5 py-3 hover:bg-dark-750 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-slate-600 w-4 flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-mono text-slate-200 truncate">{t.ip}</span>
                        <span className="text-[10px] font-mono text-slate-400 ml-2 flex-shrink-0">
                          {t.conns} conn.
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-dark-600 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: `hsl(${hue}, 65%, 55%)` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Tableau Détaillé par Protocole ────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-dark-600">
          <h2 className="text-sm font-semibold text-white">Répartition détaillée par protocole</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Entrant = la machine reçoit les connexions · Sortant = connexions initiées par la machine
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-600">
                {['Protocole', '↓ Entrant', '↑ Sortant', 'Total', 'Bande passante est.', 'Part'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-600/50">
              {protoWithBw.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-xs">
                    En attente de données réseau…
                  </td>
                </tr>
              )}
              {protoWithBw.map(p => {
                const pct = Math.round(p.total / totalProtoConns * 100)
                return (
                  <tr key={p.name} className="hover:bg-dark-750 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.color }} />
                        <span className="text-xs font-semibold text-slate-200">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-cyber-400">{p.inbound}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-blue-400">{p.outbound}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-slate-300 font-semibold">{p.total}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-slate-400">
                      {totalMbps > 0 ? `≈ ${p.bwEst} Mbps` : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-dark-600 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: p.color }} />
                        </div>
                        <span className="text-[10px] font-mono text-slate-500">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Table des connexions actives (netstat) ────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-dark-600 flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-white flex-1">
            Connexions actives — netstat live
          </h2>
          <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">
            {filteredConns.length} / {connections.length}
          </span>

          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-700 border border-dark-600">
            <Search className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
            <input
              value={searchConn}
              onChange={e => setSearchConn(e.target.value)}
              placeholder="Filtrer IP / port…"
              className="bg-transparent text-xs text-slate-300 outline-none placeholder-slate-600 w-36"
            />
          </div>

          {/* Proto filter */}
          <select
            value={filterProto}
            onChange={e => setFilterProto(e.target.value)}
            className="px-2 py-1.5 rounded-lg bg-dark-700 border border-dark-600 text-xs text-slate-300 outline-none cursor-pointer"
          >
            <option value="all">TCP + UDP</option>
            <option value="TCP">TCP</option>
            <option value="UDP">UDP</option>
          </select>

          {/* State filter */}
          <select
            value={filterState}
            onChange={e => setFilterState(e.target.value)}
            className="px-2 py-1.5 rounded-lg bg-dark-700 border border-dark-600 text-xs text-slate-300 outline-none cursor-pointer"
          >
            <option value="all">Tous états</option>
            {states.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-600">
                {['Proto', 'Adresse locale', 'Adresse distante', 'État'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-600/50 text-[11px]">
              {filteredConns.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    Aucune connexion correspondant aux filtres
                  </td>
                </tr>
              )}
              {filteredConns.slice(0, 150).map((c, i) => (
                <tr key={i} className="hover:bg-dark-750 transition-colors">
                  <td className="px-4 py-2">
                    <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                      c.proto === 'TCP'
                        ? 'text-cyber-400 bg-cyber-500/10'
                        : 'text-purple-400 bg-purple-500/10'
                    }`}>{c.proto}</span>
                  </td>
                  <td className="px-4 py-2 font-mono text-slate-400">{c.local}</td>
                  <td className="px-4 py-2 font-mono text-slate-200">{c.remote}</td>
                  <td className="px-4 py-2">
                    <span className={`font-mono ${STATE_COLORS[c.state] || 'text-slate-500'}`}>
                      {c.state || '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredConns.length > 150 && (
            <div className="px-4 py-2 text-[10px] text-slate-600 border-t border-dark-600">
              Affichage limité à 150 entrées · {filteredConns.length - 150} lignes masquées — utilisez le filtre pour affiner
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
