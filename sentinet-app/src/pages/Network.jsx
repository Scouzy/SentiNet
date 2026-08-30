import React, { useState, useEffect } from 'react'
import {
  LineChart, Line, AreaChart, Area, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'
import {
  Activity, Cpu, HardDrive, Wifi, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Server, Eye, CheckCircle, RefreshCw
} from 'lucide-react'
import { api } from '../services/api'
import { useWebSocket } from '../hooks/useWebSocket'
import { useToast } from '../components/UI/Toast'

const segmentHealth = [
  { subject: 'Latence', A: 92 },
  { subject: 'Débit', A: 78 },
  { subject: 'Perte paquets', A: 99 },
  { subject: 'Disponibilité', A: 99 },
  { subject: 'Sécurité', A: 85 },
  { subject: 'QoS', A: 76 },
]

const linkStats = [
  { name: 'DMZ → Internet', in: '3.2 Gbps', out: '1.8 Gbps', usage: 82, status: 'warning' },
  { name: 'LAN → DMZ', in: '1.4 Gbps', out: '0.9 Gbps', usage: 45, status: 'ok' },
  { name: 'LAN → DC', in: '2.1 Gbps', out: '1.7 Gbps', usage: 58, status: 'ok' },
  { name: 'VLAN Finance', in: '0.8 Gbps', out: '0.4 Gbps', usage: 32, status: 'ok' },
  { name: 'Interconnexion WAN', in: '5.6 Gbps', out: '3.9 Gbps', usage: 91, status: 'critical' },
]

function ProbeCard({ probe }) {
  const statusMap = {
    online: { dot: 'bg-cyber-500', text: 'text-cyber-400', label: 'En ligne' },
    warning: { dot: 'bg-yellow-500 animate-pulse', text: 'text-yellow-400', label: 'Avertissement' },
    offline: { dot: 'bg-red-500', text: 'text-red-400', label: 'Hors ligne' },
  }
  const s = statusMap[probe.status]
  const modeColor = probe.mode === 'IPS' ? 'text-orange-400 bg-orange-500/10 border-orange-500/25' : 'text-blue-400 bg-blue-500/10 border-blue-500/25'

  return (
    <div className={`card p-4 ${probe.status === 'offline' ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <div className={`w-2 h-2 rounded-full ${s.dot}`} />
            <span className={`text-xs font-semibold ${s.text}`}>{s.label}</span>
          </div>
          <h3 className="text-sm font-semibold text-white font-mono">{probe.id}</h3>
          <p className="text-xs text-slate-500">{probe.segment}</p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded border ${modeColor}`}>
          {probe.mode}
        </span>
      </div>

      <div className="space-y-2">
        <div>
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-slate-500">Charge CPU</span>
            <span className={`font-mono font-semibold ${probe.load > 85 ? 'text-red-400' : probe.load > 70 ? 'text-yellow-400' : 'text-cyber-400'}`}>
              {probe.load}%
            </span>
          </div>
          <div className="h-1 rounded-full bg-dark-600 overflow-hidden">
            <div
              className={`h-full rounded-full ${probe.load > 85 ? 'bg-red-500' : probe.load > 70 ? 'bg-yellow-500' : 'bg-cyber-500'}`}
              style={{ width: `${probe.load}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <div>
            <p className="text-[10px] text-slate-500">Paquets/s</p>
            <p className="text-xs font-mono font-semibold text-slate-200">
              {probe.packetsPerSec > 0 ? (probe.packetsPerSec / 1000).toFixed(0) + 'k' : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500">Perte paquets</p>
            <p className={`text-xs font-mono font-semibold ${probe.droppedPct > 0.01 ? 'text-yellow-400' : 'text-cyber-400'}`}>
              {probe.droppedPct.toFixed(3)}%
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-dark-600">
          <span className="text-[10px] text-slate-500">Version {probe.version}</span>
          {probe.status !== 'offline' && probe.version !== '3.2.1' && (
            <span className="text-[10px] text-yellow-400">Mise à jour dispo</span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Network() {
  const { metrics, connected, trafficHistory } = useWebSocket()
  const { toast } = useToast()
  const [ifaces, setIfaces] = useState([])
  const [arpHosts, setArpHosts] = useState([])
  const [topTalkersData, setTopTalkersData] = useState([])
  const [protocols, setProtocols] = useState([])
  const [loadingRefresh, setLoadingRefresh] = useState(false)

  const refresh = async () => {
    setLoadingRefresh(true)
    try {
      const [ifData, hostData, talkersData, protsData] = await Promise.all([
        api.getInterfaces(), api.getHosts(), api.getTopTalkers(), api.getProtocols()
      ])
      setIfaces(ifData.ifaces || [])
      setArpHosts(hostData.hosts || [])
      setTopTalkersData(talkersData.talkers || [])
      if (protsData.protocols?.length > 0) setProtocols(protsData.protocols)
      toast(`${(ifData.ifaces || []).length} interfaces · ${(hostData.hosts || []).length} hôtes ARP · ${(talkersData.talkers || []).length} top talkers`, 'success')
    } catch {
      toast('Erreur lors de la synchronisation', 'error')
    } finally {
      setLoadingRefresh(false)
    }
  }

  useEffect(() => { refresh() }, [])

  // Auto-refresh top-talkers & protocols every 10s
  useEffect(() => {
    const id = setInterval(async () => {
      const [talkersData, protsData] = await Promise.allSettled([api.getTopTalkers(), api.getProtocols()])
      if (talkersData.status === 'fulfilled') setTopTalkersData(talkersData.value.talkers || [])
      if (protsData.status === 'fulfilled' && protsData.value.protocols?.length > 0) setProtocols(protsData.value.protocols)
    }, 10000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="p-6 space-y-6">
      {/* Status bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-dark-800 border border-dark-600">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${connected ? 'bg-cyber-500 animate-pulse' : 'bg-red-500'}`} />
        <span className={`text-xs font-medium ${connected ? 'text-cyber-400' : 'text-red-400'}`}>
          {connected ? 'Flux temps réel actif — métriques du système local' : 'WebSocket déconnecté — reconnexion…'}
        </span>
        <button onClick={refresh} disabled={loadingRefresh} className="ml-auto flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loadingRefresh ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Débit entrant (live)', value: metrics ? `${metrics.net.inMbps} Mbps` : '—', sub: 'Interface principale', icon: ArrowDownRight, color: 'text-cyber-400' },
          { label: 'Débit sortant (live)', value: metrics ? `${metrics.net.outMbps} Mbps` : '—', sub: 'Interface principale', icon: ArrowUpRight, color: 'text-blue-400' },
          { label: 'Connexions actives', value: metrics ? metrics.conns.toLocaleString('fr-FR') : '—', sub: 'netstat TCP+UDP', icon: Activity, color: 'text-purple-400' },
          { label: 'CPU système', value: metrics ? `${metrics.cpu}%` : '—', sub: metrics ? `RAM : ${metrics.mem.toFixed(0)}%` : 'En attente…', icon: Cpu, color: metrics?.cpu > 80 ? 'text-red-400' : 'text-cyber-400' },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 mb-1">{label}</p>
                <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
                <p className="text-xs text-slate-500 mt-1">{sub}</p>
              </div>
              <Icon className={`w-5 h-5 ${color} opacity-60`} />
            </div>
          </div>
        ))}
      </div>

      {/* Live Traffic + Radar */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="card p-5 xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Trafic en temps réel</h2>
              <p className="text-xs text-slate-500 mt-0.5">Débit réel via Get-NetAdapterStatistics · Mbps</p>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-cyber-500 animate-pulse' : 'bg-slate-600'}`} />
              <span className={`text-xs ${connected ? 'text-cyber-400' : 'text-slate-500'}`}>{connected ? 'LIVE' : 'OFFLINE'}</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trafficHistory} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="liveIn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00c98d" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00c98d" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="liveOut" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2d4e" />
              <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#0a1628', border: '1px solid #1a2d4e', borderRadius: '8px', fontSize: '12px' }} />
              <Area type="monotone" dataKey="in" name="Entrant (Gbps)" stroke="#00c98d" fill="url(#liveIn)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="out" name="Sortant (Gbps)" stroke="#3b82f6" fill="url(#liveOut)" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Santé réseau globale</h2>
          <p className="text-xs text-slate-500 mb-4">Score par dimension</p>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={segmentHealth}>
              <PolarGrid stroke="#1a2d4e" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#475569', fontSize: 9 }} />
              <Radar name="Score" dataKey="A" stroke="#00c98d" fill="#00c98d" fillOpacity={0.15} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
          <div className="mt-2 pt-3 border-t border-dark-600 flex items-center justify-between">
            <span className="text-xs text-slate-500">Score global</span>
            <span className="text-lg font-bold font-mono text-cyber-400">88/100</span>
          </div>
        </div>
      </div>

      {/* Links + Protocols */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Liens réseau */}
        <div className="card">
          <div className="px-5 py-4 border-b border-dark-600">
            <h2 className="text-sm font-semibold text-white">Charge des liaisons</h2>
          </div>
          <div className="divide-y divide-dark-600/50">
            {linkStats.map((link) => (
              <div key={link.name} className="px-5 py-3.5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      link.status === 'critical' ? 'bg-red-500 animate-pulse' :
                      link.status === 'warning' ? 'bg-yellow-500' : 'bg-cyber-500'
                    }`} />
                    <span className="text-xs font-medium text-slate-200">{link.name}</span>
                  </div>
                  <span className={`text-xs font-mono font-bold ${
                    link.usage > 85 ? 'text-red-400' : link.usage > 70 ? 'text-yellow-400' : 'text-cyber-400'
                  }`}>{link.usage}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-dark-600 overflow-hidden mb-1.5">
                  <div
                    className={`h-full rounded-full transition-all ${
                      link.usage > 85 ? 'bg-red-500' : link.usage > 70 ? 'bg-yellow-500' : 'bg-cyber-500'
                    }`}
                    style={{ width: `${link.usage}%` }}
                  />
                </div>
                <div className="flex gap-4 text-[10px] font-mono text-slate-500">
                  <span className="flex items-center gap-1"><ArrowDownRight className="w-3 h-3 text-cyber-600" />{link.in}</span>
                  <span className="flex items-center gap-1"><ArrowUpRight className="w-3 h-3 text-blue-600" />{link.out}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Talkers - données réelles netstat */}
        <div className="card">
          <div className="px-5 py-4 border-b border-dark-600 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Top Talkers</h2>
            <span className="text-xs text-slate-500">Connexions actives — netstat</span>
          </div>
          <div className="divide-y divide-dark-600/50">
            {topTalkersData.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-slate-500">Aucune connexion externe active</div>
            ) : topTalkersData.map((host, i) => (
              <div key={host.ip} className="px-5 py-3.5 flex items-center gap-4">
                <span className="text-sm font-mono text-slate-600 w-5 flex-shrink-0 text-center">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Server className="w-3 h-3 text-slate-500 flex-shrink-0" />
                    <span className="text-xs font-mono font-medium text-slate-200">{host.ip}</span>
                  </div>
                  <span className="text-[10px] text-slate-500">{host.conns} connexion(s)</span>
                </div>
                <div className="text-right text-[10px] font-mono text-slate-500">
                  {(host.bytes / 1024).toFixed(1)} KB
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Real network interfaces */}
      {ifaces.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-dark-600 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Interfaces réseau — machine locale</h2>
            <span className="text-xs text-slate-500">{ifaces.length} interface(s) détectée(s)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-600">
                  {['Interface', 'Adresse IP', 'Masque', 'MAC', 'Type'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-600/50">
                {ifaces.map((iface, i) => (
                  <tr key={i} className="hover:bg-dark-750 transition-colors">
                    <td className="px-4 py-3 text-xs font-medium text-slate-200">{iface.name}</td>
                    <td className="px-4 py-3 text-xs font-mono text-cyber-400">{iface.ip}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-400">{iface.netmask}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-500">{iface.mac}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${
                        iface.internal ? 'bg-slate-500/15 text-slate-400 border-slate-500/25' : 'bg-cyber-500/15 text-cyber-400 border-cyber-500/25'
                      }`}>{iface.internal ? 'Loopback' : 'Physique'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ARP Hosts */}
      {arpHosts.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-dark-600 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Table ARP — hôtes détectés</h2>
            <span className="text-xs text-slate-500">{arpHosts.length} entrée(s)</span>
          </div>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-dark-800">
                <tr className="border-b border-dark-600">
                  {['Adresse IP', 'MAC', 'Type'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-600/50">
                {arpHosts.map((h, i) => (
                  <tr key={i} className="hover:bg-dark-750 transition-colors">
                    <td className="px-4 py-3 text-xs font-mono text-cyber-400">{h.ip}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-400">{h.mac}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${
                        h.type === 'static' ? 'bg-purple-500/15 text-purple-400 border-purple-500/25' : 'bg-blue-500/15 text-blue-400 border-blue-500/25'
                      }`}>{h.type}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Interfaces réseau réelles */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-4">Interfaces réseau actives</h2>
        {ifaces.length === 0 ? (
          <div className="card px-5 py-10 text-center text-slate-500 text-sm">Aucune interface détectée — cliquez sur Actualiser</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ifaces.map((iface, i) => (
              <div key={i} className={`card p-4 ${iface.internal ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className={`w-2 h-2 rounded-full ${iface.internal ? 'bg-slate-500' : 'bg-cyber-500'}`} />
                      <span className={`text-xs font-semibold ${iface.internal ? 'text-slate-500' : 'text-cyber-400'}`}>
                        {iface.internal ? 'Loopback' : 'Active'}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-white font-mono truncate max-w-[160px]">{iface.name}</h3>
                  </div>
                  <Wifi className="w-4 h-4 text-slate-500" />
                </div>
                <div className="space-y-1.5 text-[10px] font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-500">IPv4</span>
                    <span className="text-slate-200">{iface.ip}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Masque</span>
                    <span className="text-slate-400">{iface.netmask}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">MAC</span>
                    <span className="text-slate-400">{iface.mac}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
