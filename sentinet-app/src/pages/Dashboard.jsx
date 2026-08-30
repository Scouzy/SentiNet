import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import {
  ShieldAlert, ShieldCheck, Activity, Clock, TrendingUp,
  TrendingDown, AlertTriangle, Eye, Zap, Server, ArrowUpRight,
  ArrowDownRight, Wifi, Target
} from 'lucide-react'
import { api } from '../services/api'
import { useWebSocket } from '../hooks/useWebSocket'

function SeverityBadge({ severity }) {
  const map = {
    critical: 'bg-red-500/20 text-red-400 border-red-500/30',
    high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  }
  const labels = { critical: 'CRITIQUE', high: 'ÉLEVÉE', medium: 'MOYENNE', low: 'FAIBLE' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${map[severity]}`}>
      {labels[severity]}
    </span>
  )
}

function MetricCard({ title, value, unit, sub, icon: Icon, trend, trendVal, color = 'cyber', alert = false }) {
  const colorMap = {
    cyber: { bg: 'bg-cyber-500/10', border: 'border-cyber-500/20', text: 'text-cyber-400', icon: 'text-cyber-500' },
    red: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', icon: 'text-red-500' },
    orange: { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400', icon: 'text-orange-500' },
    blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', icon: 'text-blue-500' },
    purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400', icon: 'text-purple-500' },
  }
  const c = colorMap[color]

  return (
    <div className={`card p-5 relative overflow-hidden ${alert ? 'border-red-500/40' : ''}`}>
      {alert && <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-red-500 via-red-400 to-transparent" />}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-500 font-medium mb-1">{title}</p>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-2xl font-bold font-mono ${c.text}`}>{value}</span>
            {unit && <span className="text-sm text-slate-500">{unit}</span>}
          </div>
          {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
          {trend && (
            <div className={`flex items-center gap-1 mt-2 text-xs ${trend === 'up' ? 'text-red-400' : 'text-cyber-400'}`}>
              {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span>{trendVal}</span>
            </div>
          )}
        </div>
        <div className={`p-2.5 rounded-xl ${c.bg} border ${c.border}`}>
          <Icon className={`w-5 h-5 ${c.icon}`} />
        </div>
      </div>
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="card px-3 py-2 text-xs shadow-xl">
        <p className="text-slate-400 mb-1 font-mono">{label}</p>
        {payload.map((p) => (
          <div key={p.name} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-slate-400">{p.name}:</span>
            <span className="text-slate-200 font-medium font-mono">
              {typeof p.value === 'number' && p.name !== 'Menaces' ? `${p.value.toFixed(1)} Gbps` : p.value}
            </span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { metrics, connected, trafficHistory } = useWebSocket()
  const [recentAlerts, setRecentAlerts] = useState([])
  const [alertStats, setAlertStats] = useState({ total: 0, open: 0, bySeverity: [] })
  const [alertTrends, setAlertTrends] = useState([])
  const [protocols, setProtocols] = useState([])
  const [topTalkers, setTopTalkers] = useState([])
  const [ifaceCount, setIfaceCount] = useState(null)

  const loadData = async () => {
    const [alertsRes, statsRes, trendsRes, protsRes, talkersRes] = await Promise.allSettled([
      api.getAlerts(),
      api.getAlertStats(),
      api.getAlertTrends(),
      api.getProtocols(),
      api.getTopTalkers(),
    ])
    if (alertsRes.status === 'fulfilled') setRecentAlerts(alertsRes.value.alerts?.slice(0, 5) || [])
    if (statsRes.status === 'fulfilled') setAlertStats(statsRes.value)
    if (trendsRes.status === 'fulfilled') setAlertTrends(trendsRes.value.trends || [])
    if (protsRes.status === 'fulfilled') setProtocols(protsRes.value.protocols || [])
    if (talkersRes.status === 'fulfilled') setTopTalkers(talkersRes.value.talkers || [])
  }

  useEffect(() => {
    api.getInterfaces().then(d => setIfaceCount((d.ifaces || []).filter(i => !i.internal).length)).catch(() => {})
  }, [])

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    const id = setInterval(loadData, 10000)
    return () => clearInterval(id)
  }, [])

  const criticalAlerts = recentAlerts.filter(a => a.severity === 'critical')
  const SEV_COLORS = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#3b82f6' }
  const alertsBySeverity = alertStats.bySeverity?.map(s => ({ name: s.severity, value: s.count, color: SEV_COLORS[s.severity] || '#475569' })) || []

  const blockedCount = alertStats.bySeverity ? (alertStats.total - alertStats.open) : 0
  const highCount = alertStats.bySeverity?.find(s => s.severity === 'high')?.count || 0
  const criticalCount = alertStats.bySeverity?.find(s => s.severity === 'critical')?.count || 0

  const lastAlertAgo = (() => {
    if (!recentAlerts.length) return 'Aucune'
    const diff = Math.round((Date.now() - new Date(recentAlerts[0].timestamp).getTime()) / 1000)
    if (diff < 60) return `${diff}s`
    if (diff < 3600) return `${Math.floor(diff / 60)}min`
    return `${Math.floor(diff / 3600)}h`
  })()

  return (
    <div className="p-6 space-y-6">
      {/* Critical Banner */}
      {criticalAlerts.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="text-sm text-red-300 font-medium">
            {criticalAlerts.length} alertes critiques actives — Intervention immédiate requise
          </span>
          <button onClick={() => navigate('/alerts')} className="ml-auto text-xs text-red-400 hover:text-red-300 font-medium underline underline-offset-2">
            Voir les alertes →
          </button>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Alertes totales"
          value={alertStats.total || '—'}
          sub={`${alertStats.open || 0} ouvertes · ${alertStats.bySeverity?.find(s => s.severity === 'critical')?.count || 0} critiques`}
          icon={ShieldAlert}
          color={alertStats.bySeverity?.find(s => s.severity === 'critical')?.count > 0 ? 'red' : 'orange'}
          alert={alertStats.bySeverity?.find(s => s.severity === 'critical')?.count > 0}
        />
        <MetricCard
          title="Dernière détection"
          value={lastAlertAgo}
          sub={recentAlerts[0] ? recentAlerts[0].type : 'Aucune alerte'}
          icon={Clock}
          color="cyber"
        />
        <MetricCard
          title="Alertes élevées"
          value={highCount}
          sub={`${criticalCount} critique(s) · ${alertStats.open || 0} ouvertes`}
          icon={Zap}
          color={highCount > 0 ? 'orange' : 'blue'}
          alert={criticalCount > 0}
        />
        <MetricCard
          title="Alertes traitées"
          value={blockedCount}
          sub={alertStats.total > 0 ? `${Math.round(blockedCount / alertStats.total * 100)}% du total résolu` : 'Aucune alerte'}
          icon={Target}
          color="purple"
        />
      </div>

      {/* Second KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Débit entrant"
          value={metrics ? metrics.net.inMbps.toFixed(2) : '—'}
          unit={metrics ? 'Mbps' : ''}
          sub={connected ? 'Mesure temps réel' : 'En attente…'}
          icon={Activity}
          color="cyber"
        />
        <MetricCard
          title="Connexions actives"
          value={metrics ? metrics.conns.toLocaleString('fr-FR') : '—'}
          sub="netstat TCP+UDP"
          icon={Server}
          color="blue"
        />
        <MetricCard
          title="CPU système"
          value={metrics ? metrics.cpu.toFixed(1) : '—'}
          unit={metrics ? '%' : ''}
          sub={metrics ? `RAM : ${metrics.mem.toFixed(0)}%` : 'En attente…'}
          icon={Eye}
          color={metrics?.cpu > 80 ? 'red' : 'cyber'}
        />
        <MetricCard
          title="Interfaces réseau"
          value={ifaceCount ?? '—'}
          sub={ifaceCount !== null ? `Interface${ifaceCount > 1 ? 's' : ''} active${ifaceCount > 1 ? 's' : ''} détectée${ifaceCount > 1 ? 's' : ''}` : 'Chargement…'}
          icon={Wifi}
          color="cyber"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Traffic Chart */}
        <div className="card p-5 xl:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-white">Trafic réseau — 24h</h2>
              <p className="text-xs text-slate-500 mt-0.5">Débit entrant/sortant et menaces détectées</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 rounded bg-cyber-400" />
                Entrant
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 rounded bg-blue-400" />
                Sortant
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-1.5 rounded bg-red-400/60" />
                Menaces
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trafficHistory} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00c98d" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00c98d" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2d4e" />
              <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} interval={3} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="in" name="Entrant" stroke="#00c98d" fill="url(#colorIn)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="out" name="Sortant" stroke="#3b82f6" fill="url(#colorOut)" strokeWidth={1.5} dot={false} />
              <Bar dataKey="threats" name="Menaces" fill="#ef444460" radius={[2, 2, 0, 0]} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Protocol Distribution */}
        <div className="card p-5">
          <div className="mb-5">
            <h2 className="text-sm font-semibold text-white">Distribution protocoles</h2>
            <p className="text-xs text-slate-500 mt-0.5">Répartition du trafic analysé</p>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={protocols}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={75}
                paddingAngle={2}
                dataKey="value"
              >
                {protocols.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="none" />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#0a1628', border: '1px solid #1a2d4e', borderRadius: '8px', fontSize: '12px' }}
                itemStyle={{ color: '#cbd5e1' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {protocols.slice(0, 5).map((p) => (
              <div key={p.name} className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
                <span className="text-slate-400 flex-1">{p.name}</span>
                <span className="text-slate-200 font-mono font-medium">{p.value}%</span>
                <div className="w-16 h-1 rounded-full bg-dark-600 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${p.value * 2.3}%`, background: p.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Threat Timeline */}
        <div className="card p-5 xl:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-white">Évolution des alertes — 7 jours</h2>
              <p className="text-xs text-slate-500 mt-0.5">Distribution par niveau de sévérité</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={alertTrends} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2d4e" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#0a1628', border: '1px solid #1a2d4e', borderRadius: '8px', fontSize: '12px' }} />
              <Bar dataKey="critical" name="Critique" fill="#ef4444" stackId="a" radius={[0, 0, 0, 0]} />
              <Bar dataKey="high" name="Élevée" fill="#f97316" stackId="a" />
              <Bar dataKey="medium" name="Moyenne" fill="#eab308" stackId="a" />
              <Bar dataKey="low" name="Faible" fill="#3b82f6" stackId="a" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Alert Summary */}
        <div className="card p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-white">Alertes par sévérité</h2>
            <p className="text-xs text-slate-500 mt-0.5">Total alertes : {alertStats.total} · {alertStats.open} ouvertes</p>
          </div>
          <div className="space-y-3">
            {alertsBySeverity.map((item) => (
              <div key={item.name}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
                    <span className="text-xs text-slate-400">{item.name}</span>
                  </div>
                  <span className="text-xs font-mono font-semibold" style={{ color: item.color }}>
                    {item.value}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-dark-600 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: alertStats.total ? `${(item.value / alertStats.total) * 100}%` : '0%', background: item.color }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 pt-4 border-t border-dark-600">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Taux de résolution</span>
              <span className="text-cyber-400 font-mono font-semibold">
                {alertStats.total ? Math.round(((alertStats.total - alertStats.open) / alertStats.total) * 100) : 0}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-dark-600 overflow-hidden mt-1">
              <div className="h-full rounded-full bg-cyber-500"
                style={{ width: `${alertStats.total ? Math.round(((alertStats.total - alertStats.open) / alertStats.total) * 100) : 0}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Recent Alerts */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-dark-600">
            <h2 className="text-sm font-semibold text-white">Alertes récentes</h2>
            <button onClick={() => navigate('/alerts')} className="text-xs text-cyber-400 hover:text-cyber-300">Voir tout →</button>
          </div>
          <div className="divide-y divide-dark-600">
            {recentAlerts.map((alert) => (
              <div key={alert.id} onClick={() => navigate('/alerts')} className="px-5 py-3 hover:bg-dark-750 transition-colors cursor-pointer">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                    alert.severity === 'critical' ? 'bg-red-500 animate-pulse' :
                    alert.severity === 'high' ? 'bg-orange-500' :
                    alert.severity === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <SeverityBadge severity={alert.severity} />
                      <span className="text-xs font-medium text-slate-300 truncate">{alert.type}</span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{alert.description}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] font-mono text-slate-600">{alert.source}</span>
                      <span className="text-[10px] text-slate-600">→</span>
                      <span className="text-[10px] font-mono text-slate-600 truncate">{alert.destination}</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-600 flex-shrink-0 font-mono">
                    {new Date(alert.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Talkers */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-dark-600">
            <h2 className="text-sm font-semibold text-white">Top Talkers</h2>
            <span className="text-xs text-slate-500">Dernières 24h</span>
          </div>
          <div className="divide-y divide-dark-600">
            {topTalkers.length === 0 ? (
              <div className="px-5 py-6 text-center text-xs text-slate-500">Aucune connexion externe détectée</div>
            ) : topTalkers.map((host, i) => (
              <div key={host.ip} className="px-5 py-3 flex items-center gap-4 hover:bg-dark-750 transition-colors">
                <span className="text-xs text-slate-600 font-mono w-4 flex-shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-mono font-medium text-slate-200 block truncate">{host.ip}</span>
                  <span className="text-[10px] text-slate-500">{host.conns} connexion(s) actives</span>
                </div>
                <div className="text-right text-[10px] font-mono text-slate-500">
                  {(host.bytes / 1024).toFixed(1)} KB
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
