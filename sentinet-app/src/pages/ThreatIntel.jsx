import React, { useState, useEffect } from 'react'
import { Globe, RefreshCw, CheckCircle, AlertTriangle, Database, Search, MapPin, Clock, ShieldAlert } from 'lucide-react'
import { api } from '../services/api'

const IOC_FEEDS_CONFIG = [
  { name: 'ThreatFox (abuse.ch)', type: 'STIX/TAXII', url: 'https://threatfox.abuse.ch', status: 'active', lastUpdate: new Date().toISOString() },
  { name: 'EmergingThreats', type: 'IP blocklist', url: 'https://rules.emergingthreats.net', status: 'active', lastUpdate: new Date().toISOString() },
  { name: 'URLhaus', type: 'URL malveillantes', url: 'https://urlhaus.abuse.ch', status: 'active', lastUpdate: new Date().toISOString() },
  { name: 'MISP Community', type: 'STIX/TAXII', url: 'https://misp-project.org', status: 'active', lastUpdate: new Date().toISOString() },
  { name: 'Feodo Tracker', type: 'C2 IPs', url: 'https://feodotracker.abuse.ch', status: 'active', lastUpdate: new Date().toISOString() },
]

const typeColors = { IP: '#3b82f6', Domain: '#8b5cf6', Hash: '#f59e0b', URL: '#ef4444' }

const MITRE_COLORS = ['#f97316', '#ec4899', '#8b5cf6', '#ef4444', '#3b82f6', '#06b6d4', '#10b981']

function FeedCard({ feed }) {
  const statusColor = feed.status === 'active' ? 'text-cyber-400 bg-cyber-500/10 border-cyber-500/25' : 'text-slate-400 bg-dark-700 border-dark-600'

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-xs font-semibold text-white">{feed.name}</h3>
          <span className="text-[10px] text-slate-500">{feed.type}</span>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${statusColor}`}>
          {feed.status === 'active' ? 'Actif' : 'Inactif'}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center p-2 rounded-lg bg-dark-700/50">
          <p className="text-[10px] text-slate-500">IoCs</p>
          <p className="text-sm font-bold font-mono text-slate-200">{feed.iocs.toLocaleString('fr-FR')}</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-dark-700/50">
          <p className="text-[10px] text-slate-500">Matchs</p>
          <p className="text-sm font-bold font-mono text-orange-400">{feed.matches}</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-dark-700/50">
          <p className="text-[10px] text-slate-500">Taux</p>
          <p className="text-xs font-bold font-mono text-cyber-400">
            {((feed.matches / feed.iocs) * 100).toFixed(2)}%
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 pt-2 border-t border-dark-600">
        <Clock className="w-3 h-3" />
        <span>Mis à jour : {new Date(feed.lastUpdate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
        <button className="ml-auto flex items-center gap-1 text-cyber-400 hover:text-cyber-300">
          <RefreshCw className="w-3 h-3" />
          Sync
        </button>
      </div>
    </div>
  )
}

export default function ThreatIntel() {
  const [searchIoc, setSearchIoc] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = () => api.getAlerts()
      .then(d => { setAlerts(d.alerts || []); setLoading(false) })
      .catch(() => setLoading(false))
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [])

  // Dériver IoCs depuis les vraies alertes
  const iocAlerts = alerts.filter(a => a.type?.includes('IoC') || a.type?.includes('C2') || a.type?.includes('Port C2'))
  const iocRows = iocAlerts.map(a => ({
    type: 'IP',
    value: a.destination || a.source,
    threat: a.type,
    confidence: a.riskScore || 80,
    source: 'Détection locale',
    country: '—',
    matched: true,
    timestamp: a.timestamp,
  }))

  // Déduplication par valeur
  const seen = new Set()
  const uniqueIocs = iocRows.filter(r => { if (seen.has(r.value)) return false; seen.add(r.value); return true })

  // Stats dérivées
  const totalMatches = iocAlerts.length
  const mitreCount = alerts.reduce((acc, a) => {
    if (a.mitre) acc[a.mitre] = (acc[a.mitre] || 0) + 1
    return acc
  }, {})
  const mitreEntries = Object.entries(mitreCount).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const maxMitre = mitreEntries[0]?.[1] || 1

  const filteredIocs = uniqueIocs.filter(ioc => {
    if (filterType !== 'all' && ioc.type !== filterType) return false
    if (searchIoc && !ioc.value.toLowerCase().includes(searchIoc.toLowerCase())) return false
    return true
  })

  return (
    <div className="p-6 space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Flux configurés', value: IOC_FEEDS_CONFIG.filter(f => f.status === 'active').length, icon: Database, color: 'text-cyber-400' },
          { label: 'Alertes IoC / C2', value: iocAlerts.length, icon: ShieldAlert, color: 'text-red-400' },
          { label: 'IoCs uniques détectés', value: uniqueIocs.length, icon: AlertTriangle, color: 'text-orange-400' },
          { label: 'Total alertes', value: alerts.length, icon: Globe, color: 'text-blue-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 mb-1">{label}</p>
                <p className={`text-2xl font-bold font-mono ${color}`}>{loading ? '—' : value}</p>
              </div>
              <Icon className={`w-5 h-5 ${color} opacity-60`} />
            </div>
          </div>
        ))}
      </div>

      {/* Feeds */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Flux de renseignement (STIX/TAXII)</h2>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyber-600/20 border border-cyber-500/30 text-cyber-400 text-xs font-medium hover:bg-cyber-600/30 transition-colors">
            <RefreshCw className="w-3 h-3" />
            Synchroniser tout
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {IOC_FEEDS_CONFIG.map(feed => <FeedCard key={feed.name} feed={{
            ...feed,
            iocs: 0,
            matches: 0,
          }} />)}
        </div>
      </div>

      {/* IoC Table + Geo */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* IoC Table */}
        <div className="card xl:col-span-2">
          <div className="px-5 py-4 border-b border-dark-600 flex items-center gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-white flex-1">Indicateurs de compromission</h2>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-700 border border-dark-600">
              <Search className="w-3.5 h-3.5 text-slate-500" />
              <input
                value={searchIoc}
                onChange={e => setSearchIoc(e.target.value)}
                placeholder="Rechercher un IoC..."
                className="bg-transparent text-xs text-slate-300 outline-none placeholder-slate-600 w-36"
              />
            </div>
            <div className="flex gap-1">
              {['all', 'IP', 'Domain', 'Hash', 'URL'].map(type => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
                    filterType === type
                      ? 'bg-cyber-500/20 text-cyber-300 border border-cyber-500/30'
                      : 'bg-dark-700 text-slate-400 border border-dark-600 hover:text-slate-200'
                  }`}
                >
                  {type === 'all' ? 'Tous' : type}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-600">
                  {['Type', 'Valeur', 'Menace', 'Confiance', 'Source', 'Pays', 'Match'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-600/50">
                {filteredIocs.length === 0 && !loading && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500 text-xs">Aucun IoC détecté — en attente d’activité réseau</td></tr>
              )}
              {filteredIocs.map((ioc, i) => (
                  <tr key={i} className="hover:bg-dark-750 transition-colors">
                    <td className="px-4 py-2.5">
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded border"
                        style={{
                          color: typeColors[ioc.type],
                          background: `${typeColors[ioc.type]}20`,
                          borderColor: `${typeColors[ioc.type]}40`
                        }}
                      >
                        {ioc.type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-mono text-slate-200">{ioc.value}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-slate-400">{ioc.threat}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1 rounded-full bg-dark-600 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${ioc.confidence}%`,
                              background: ioc.confidence >= 90 ? '#ef4444' : ioc.confidence >= 70 ? '#f97316' : '#eab308'
                            }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">{ioc.confidence}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-[10px] text-slate-500">{ioc.source}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-600" />
                        <span className="text-[10px] text-slate-400">{ioc.country}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {ioc.matched ? (
                        <span className="text-[10px] font-bold text-red-400 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Matchée
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Géo */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-white mb-4">IoCs détectés — Résumé</h2>
          <p className="text-xs text-slate-500 mb-4">
            {loading ? 'Chargement…' : totalMatches > 0 ? `${totalMatches} alerte(s) IoC/C2 active(s)` : 'Aucune menace IoC détectée'}
          </p>
          <div className="space-y-3">
            {uniqueIocs.slice(0, 7).map((ioc, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0 bg-red-500" />
                    <span className="text-[10px] font-mono text-slate-300 truncate max-w-[140px]">{ioc.value}</span>
                  </div>
                  <span className="text-[10px] font-mono text-red-400">{ioc.confidence}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-dark-600 overflow-hidden">
                  <div className="h-full rounded-full bg-red-500" style={{ width: `${ioc.confidence}%` }} />
                </div>
                <p className="text-[9px] text-slate-600 mt-0.5">{ioc.threat}</p>
              </div>
            ))}
            {uniqueIocs.length === 0 && !loading && (
              <p className="text-[10px] text-slate-600 text-center py-4">En attente d’alertes IoC</p>
            )}
          </div>

          <div className="mt-5 pt-4 border-t border-dark-600">
            <h3 className="text-xs font-semibold text-slate-400 mb-3">MITRE ATT&CK — Techniques détectées</h3>
            {mitreEntries.length === 0 ? (
              <p className="text-[10px] text-slate-500">Aucune technique détectée</p>
            ) : (
              <div className="space-y-2">
                {mitreEntries.map(([tactic, count], idx) => (
                  <div key={tactic} className="flex items-center gap-2 text-[10px]">
                    <span className="text-slate-500 w-28 truncate font-mono">{tactic}</span>
                    <div className="flex-1 h-1 rounded-full bg-dark-600 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(count / maxMitre) * 100}%`, background: MITRE_COLORS[idx % MITRE_COLORS.length] }} />
                    </div>
                    <span className="font-mono text-slate-400 w-6 text-right">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
