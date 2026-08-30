import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Search, Filter, ChevronDown, ChevronRight, Shield, X,
  AlertTriangle, Clock, Server, Globe, ArrowRight, ExternalLink,
  CheckCircle, Eye, Zap, Copy, Loader2
} from 'lucide-react'
import { api } from '../services/api'
import { useToast } from '../components/UI/Toast'

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

function StatusBadge({ status }) {
  const map = {
    open: 'bg-red-500/15 text-red-400 border-red-500/25',
    investigating: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
    blocked: 'bg-cyber-500/15 text-cyber-400 border-cyber-500/25',
    closed: 'bg-slate-500/15 text-slate-400 border-slate-500/25',
  }
  const labels = { open: 'Ouvert', investigating: 'En cours', blocked: 'Bloqué', closed: 'Fermé' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${map[status]}`}>
      {labels[status]}
    </span>
  )
}

function RiskGauge({ score }) {
  const color = score >= 80 ? '#ef4444' : score >= 60 ? '#f97316' : score >= 40 ? '#eab308' : '#3b82f6'
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-10 h-10">
        <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
          <circle cx="18" cy="18" r="14" fill="none" stroke="#1a2d4e" strokeWidth="3" />
          <circle
            cx="18" cy="18" r="14" fill="none"
            stroke={color} strokeWidth="3"
            strokeDasharray={`${(score / 100) * 88} 88`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold font-mono" style={{ color }}>
          {score}
        </span>
      </div>
    </div>
  )
}

function AlertDetail({ alert, onClose, onStatusChange }) {
  const { toast } = useToast()
  const [loading, setLoading] = useState('')
  const mitreUrl = `https://attack.mitre.org/techniques/${alert.mitre.replace('.', '/')}/`

  const act = async (label, fn) => {
    setLoading(label)
    try {
      await fn()
      toast(`✓ ${label}`, 'success')
      onClose()
    } catch (e) {
      toast(e.message || `Erreur : ${label}`, 'error')
    } finally {
      setLoading('')
    }
  }

  const handleBlock = () => act('Hôte bloqué', async () => {
    const ip = alert.source.replace(/^\[|\]$/g, '')
    await api.blockHost(ip, alert.type, alert.id)
    onStatusChange(alert.id, 'blocked')
  })

  const handleResolve = () => act('Alerte résolue', async () => {
    await api.updateAlert(alert.id, { status: 'closed' })
    onStatusChange(alert.id, 'closed')
  })

  const handleInvestigate = () => act('Mise en investigation', async () => {
    await api.updateAlert(alert.id, { status: 'investigating' })
    onStatusChange(alert.id, 'investigating')
  })

  const handleAnalyze = () => {
    toast(`Analyse flux lancée : ${alert.source} → ${alert.destination}`, 'info')
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-dark-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-2xl bg-dark-800 border-l border-dark-600 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-dark-600 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <SeverityBadge severity={alert.severity} />
              <StatusBadge status={alert.status} />
              <span className="text-xs font-mono text-slate-500">{alert.id}</span>
            </div>
            <h2 className="text-base font-semibold text-white">{alert.type}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-dark-700 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Risk Score */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-dark-700/50 border border-dark-600">
            <RiskGauge score={alert.riskScore} />
            <div>
              <p className="text-xs text-slate-500">Score de risque</p>
              <p className="text-lg font-bold font-mono text-white">{alert.riskScore}<span className="text-sm text-slate-500">/100</span></p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs text-slate-500">Horodatage</p>
              <p className="text-xs font-mono text-slate-200">
                {new Date(alert.timestamp).toLocaleString('fr-FR')}
              </p>
            </div>
          </div>

          {/* Description */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Description</h3>
            <p className="text-sm text-slate-300 leading-relaxed">{alert.description}</p>
          </div>

          {/* Network Info */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Informations réseau</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Source', value: alert.source, icon: Server },
                { label: 'Destination', value: alert.destination, icon: Globe },
                { label: 'Protocole', value: alert.protocol, icon: ArrowRight },
                { label: 'Segment', value: alert.segment, icon: Shield },
                { label: 'Sonde', value: alert.probe, icon: Eye },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="p-3 rounded-lg bg-dark-700/50 border border-dark-600">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className="w-3 h-3 text-slate-500" />
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
                  </div>
                  <span className="text-xs font-mono text-slate-200">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* MITRE ATT&CK */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">MITRE ATT&CK</h3>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
              <div className="p-2 rounded bg-purple-500/15">
                <Shield className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <p className="text-xs font-mono font-semibold text-purple-300">{alert.mitre}</p>
                <p className="text-xs text-slate-400">{alert.type}</p>
              </div>
              <a
                href={mitreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300"
              >
                <ExternalLink className="w-3 h-3" />
                ATT&CK
              </a>
            </div>
          </div>

          {/* Actions */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Actions de réponse</h3>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={handleBlock} disabled={!!loading || alert.status === 'blocked'} className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {loading === 'Hôte bloqué' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                Bloquer l'hôte
              </button>
              <button onClick={handleInvestigate} disabled={!!loading || alert.status === 'investigating'} className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-orange-500/10 border border-orange-500/25 text-orange-400 text-xs font-medium hover:bg-orange-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {loading === 'Mise en investigation' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
                Investiguer
              </button>
              <button onClick={handleAnalyze} disabled={!!loading} className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-blue-500/10 border border-blue-500/25 text-blue-400 text-xs font-medium hover:bg-blue-500/20 transition-colors disabled:opacity-50">
                <Eye className="w-3.5 h-3.5" />
                Analyser le flux
              </button>
              <button onClick={handleResolve} disabled={!!loading || alert.status === 'closed'} className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-cyber-500/10 border border-cyber-500/25 text-cyber-400 text-xs font-medium hover:bg-cyber-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {loading === 'Alerte résolue' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                Marquer résolu
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }

export default function Alerts() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [alerts, setAlerts] = useState([])
  const [search, setSearch] = useState(searchParams.get('q') || '')

  useEffect(() => {
    const q = searchParams.get('q')
    if (q !== null) {
      setSearch(q)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])
  const [filterSeverity, setFilterSeverity] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [selectedAlert, setSelectedAlert] = useState(null)

  useEffect(() => {
    api.getAlerts().then(d => d.alerts && setAlerts(d.alerts)).catch(() => {})
  }, [])

  const handleStatusChange = useCallback((id, status) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status } : a))
    setSelectedAlert(prev => prev?.id === id ? { ...prev, status } : prev)
  }, [])

  const filtered = alerts
    .filter(a => {
      if (filterSeverity !== 'all' && a.severity !== filterSeverity) return false
      if (filterStatus !== 'all' && a.status !== filterStatus) return false
      if (search) {
        const q = search.toLowerCase()
        return a.type.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.source.includes(q) ||
          a.destination.includes(q) ||
          a.id.toLowerCase().includes(q)
      }
      return true
    })
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])

  const counts = {
    total: alerts.length,
    critical: alerts.filter(a => a.severity === 'critical').length,
    open: alerts.filter(a => a.status === 'open').length,
    blocked: alerts.filter(a => a.status === 'blocked').length,
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {selectedAlert && <AlertDetail alert={selectedAlert} onClose={() => setSelectedAlert(null)} onStatusChange={handleStatusChange} />}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total alertes', val: counts.total, color: 'text-slate-200' },
          { label: 'Critiques', val: counts.critical, color: 'text-red-400' },
          { label: 'Ouvertes', val: counts.open, color: 'text-orange-400' },
          { label: 'Bloquées', val: counts.blocked, color: 'text-cyber-400' },
        ].map(({ label, val, color }) => (
          <div key={label} className="card px-4 py-3 md:px-5 md:py-4">
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className={`text-2xl font-bold font-mono ${color}`}>{val}</p>
          </div>
        ))}
      </div>

      {/* Filters — 2 rows */}
      <div className="card px-4 py-3 space-y-2">
        {/* Row 1: search + count */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 flex-1">
            <Search className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
            <input
              type="text"
              placeholder="Rechercher ID, type, IP..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')}>
                <X className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300" />
              </button>
            )}
          </div>
          <span className="text-xs text-slate-500 flex-shrink-0">{filtered.length} résultat(s)</span>
        </div>
        {/* Row 2: severity + status */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
          {['all', 'critical', 'high', 'medium', 'low'].map(s => (
            <button
              key={s}
              onClick={() => setFilterSeverity(s)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                filterSeverity === s
                  ? 'bg-cyber-500/20 text-cyber-300 border border-cyber-500/40'
                  : 'bg-dark-700 text-slate-400 border border-dark-600 hover:text-slate-200'
              }`}
            >
              {s === 'all' ? 'Toutes' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-500 hidden sm:inline">Statut :</span>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="px-2.5 py-1 rounded-lg bg-dark-700 border border-dark-600 text-xs text-slate-300 outline-none"
            >
              <option value="all">Tous statuts</option>
              <option value="open">Ouvert</option>
              <option value="investigating">En cours</option>
              <option value="blocked">Bloqué</option>
              <option value="closed">Fermé</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {/* ── Mobile card list (< md) ── */}
        <div className="md:hidden divide-y divide-dark-600/50">
          {filtered.map(alert => (
            <div
              key={alert.id}
              onClick={() => setSelectedAlert(alert)}
              className="px-4 py-3 hover:bg-dark-750 transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <SeverityBadge severity={alert.severity} />
                  <StatusBadge status={alert.status} />
                </div>
                <span className="text-[10px] font-mono text-slate-500 flex-shrink-0">
                  {new Date(alert.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-xs font-medium text-slate-200 mb-0.5">{alert.type}</p>
              <p className="text-[10px] text-slate-500 truncate mb-1.5">{alert.description}</p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono text-slate-500 truncate">{alert.source}</span>
                <span className={`text-xs font-bold font-mono flex-shrink-0 ${
                  alert.riskScore >= 80 ? 'text-red-400' :
                  alert.riskScore >= 60 ? 'text-orange-400' :
                  alert.riskScore >= 40 ? 'text-yellow-400' : 'text-blue-400'
                }`}>Score&nbsp;{alert.riskScore}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Desktop table (≥ md) ── */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-600">
                <th className="hidden xl:table-cell px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">ID</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Sévérité</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                <th className="hidden lg:table-cell px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Source → Destination</th>
                <th className="hidden xl:table-cell px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Proto</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Score</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Statut</th>
                <th className="hidden lg:table-cell px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Horodatage</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-600/50">
              {filtered.map((alert) => (
                <tr
                  key={alert.id}
                  onClick={() => setSelectedAlert(alert)}
                  className="hover:bg-dark-750 transition-colors cursor-pointer group"
                >
                  <td className="hidden xl:table-cell px-4 py-3">
                    <span className="text-xs font-mono text-slate-500">{alert.id}</span>
                  </td>
                  <td className="px-4 py-3">
                    <SeverityBadge severity={alert.severity} />
                  </td>
                  <td className="px-4 py-3 max-w-[220px]">
                    <span className="text-xs font-medium text-slate-200 block truncate">{alert.type}</span>
                    <p className="text-[10px] text-slate-500 mt-0.5 truncate">{alert.description}</p>
                  </td>
                  <td className="hidden lg:table-cell px-4 py-3 max-w-[260px]">
                    <div className="flex items-center gap-1 text-xs font-mono min-w-0">
                      <span className="text-slate-300 truncate max-w-[110px]">{alert.source}</span>
                      <ArrowRight className="w-3 h-3 text-slate-600 flex-shrink-0" />
                      <span className="text-slate-400 truncate max-w-[110px]">{alert.destination}</span>
                    </div>
                  </td>
                  <td className="hidden xl:table-cell px-4 py-3">
                    <span className="text-xs font-mono text-slate-400">{alert.protocol}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold font-mono ${
                      alert.riskScore >= 80 ? 'text-red-400' :
                      alert.riskScore >= 60 ? 'text-orange-400' :
                      alert.riskScore >= 40 ? 'text-yellow-400' : 'text-blue-400'
                    }`}>{alert.riskScore}</span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={alert.status} />
                  </td>
                  <td className="hidden lg:table-cell px-4 py-3">
                    <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap">
                      {new Date(alert.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="py-16 text-center text-slate-500 text-sm">
            Aucune alerte correspondant aux filtres
          </div>
        )}
      </div>
    </div>
  )
}
