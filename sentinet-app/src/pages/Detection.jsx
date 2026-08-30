import React, { useState, useEffect, useRef } from 'react'
import { Shield, CheckCircle, XCircle, ChevronDown, ChevronRight, Target, Zap, Brain, Search, Plus, Trash2, ToggleLeft, ToggleRight, Activity, Loader2, RefreshCw, AlertTriangle, Ban, ArrowUpRight } from 'lucide-react'
import { mitreAttackData } from '../data/mockData'
import { api } from '../services/api'
import { useToast } from '../components/UI/Toast'
import { useWebSocket } from '../hooks/useWebSocket'

const tacticColors = {
  'Reconnaissance': '#3b82f6',
  'Initial Access': '#8b5cf6',
  'Execution': '#f59e0b',
  'Persistence': '#06b6d4',
  'Lateral Movement': '#ef4444',
  'Command & Control': '#f97316',
  'Exfiltration': '#ec4899',
  'Impact': '#dc2626',
}

function TechniqueCell({ technique }) {
  const color = technique.covered ? '#00c98d' : '#374151'
  const bg = technique.covered ? 'bg-cyber-500/10 border-cyber-500/20 hover:bg-cyber-500/20' : 'bg-dark-700/30 border-dark-600/30'

  return (
    <div
      title={`${technique.id} — ${technique.name}${technique.detections ? ` · ${technique.detections} détections` : ''}`}
      className={`relative px-2 py-1.5 rounded border text-[10px] font-mono cursor-pointer transition-colors ${bg}`}
    >
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="truncate text-slate-400">{technique.id}</span>
      </div>
      <p className="text-slate-600 truncate mt-0.5">{technique.name}</p>
      {technique.detections > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-cyber-500 text-[9px] font-bold text-white flex items-center justify-center">
          {technique.detections > 9 ? '9+' : technique.detections}
        </span>
      )}
    </div>
  )
}

const SEVERITY_STYLE = {
  critical: 'bg-red-500/15 text-red-400 border-red-500/25',
  high: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  medium: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  low: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
}
const SEVERITY_DOT = {
  critical: 'bg-red-500 animate-pulse',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-500',
}

function RuleModal({ rule, onSave, onClose }) {
  const [form, setForm] = useState(rule || {
    name: '', description: '', severity: 'medium', enabled: true,
    mitre: '', riskScore: 50, match: { proto: 'TCP', port: '' },
  })
  const { toast } = useToast()
  const isNew = !rule?.id

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const payload = { ...form, match: { ...form.match, port: form.match.port ? parseInt(form.match.port) : undefined } }
      if (!payload.match.port) delete payload.match.port
      let saved
      if (isNew) {
        const d = await api.createDetectionRule(payload)
        saved = d.rule
      } else {
        const d = await api.updateDetectionRule(rule.id, payload)
        saved = d.rule
      }
      onSave(saved, isNew)
      toast(isNew ? 'Règle créée' : 'Règle mise à jour', 'success')
    } catch (err) {
      toast(err.message || 'Erreur', 'error')
    }
  }

  const f = (field, val) => {
    if (field.startsWith('match.')) {
      const k = field.slice(6)
      setForm(p => ({ ...p, match: { ...p.match, [k]: val } }))
    } else {
      setForm(p => ({ ...p, [field]: val }))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-lg p-6 space-y-4">
        <h2 className="text-sm font-semibold text-white">{isNew ? 'Nouvelle règle de détection' : 'Modifier la règle'}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Nom *</label>
              <input value={form.name} onChange={e => f('name', e.target.value)} required
                className="mt-1 w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyber-500/50" />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Description</label>
              <input value={form.description} onChange={e => f('description', e.target.value)}
                className="mt-1 w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyber-500/50" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Sévérité</label>
              <select value={form.severity} onChange={e => f('severity', e.target.value)}
                className="mt-1 w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyber-500/50">
                {['critical', 'high', 'medium', 'low'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Score de risque</label>
              <input type="number" min="0" max="100" value={form.riskScore} onChange={e => f('riskScore', parseInt(e.target.value))}
                className="mt-1 w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyber-500/50" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Protocole (match)</label>
              <select value={form.match.proto || ''} onChange={e => f('match.proto', e.target.value)}
                className="mt-1 w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyber-500/50">
                <option value="">Tous</option>
                <option value="TCP">TCP</option>
                <option value="UDP">UDP</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Port (match)</label>
              <input type="number" value={form.match.port || ''} onChange={e => f('match.port', e.target.value)} placeholder="Ex : 4444"
                className="mt-1 w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyber-500/50" />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Technique MITRE ATT&CK</label>
              <input value={form.mitre} onChange={e => f('mitre', e.target.value)} placeholder="Ex : T1071.001"
                className="mt-1 w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyber-500/50" />
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2 border-t border-dark-600">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg bg-dark-700 border border-dark-600 text-xs text-slate-400 hover:text-slate-200 transition-colors">Annuler</button>
            <button type="submit" className="flex-1 py-2 rounded-lg bg-cyber-600/20 border border-cyber-500/30 text-cyber-400 text-xs font-medium hover:bg-cyber-600/30 transition-colors">
              {isNew ? 'Créer' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Detection() {
  const { toast } = useToast()
  const { metrics } = useWebSocket()
  const [activeTab, setActiveTab] = useState('rules')
  const [expandedTactic, setExpandedTactic] = useState(null)
  const [rules, setRules] = useState([])
  const [liveAlerts, setLiveAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [editingRule, setEditingRule] = useState(null)
  const [showNewRule, setShowNewRule] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [togglingId, setTogglingId] = useState(null)
  const [blockingId, setBlockingId] = useState(null)
  const [ackingId, setAckingId] = useState(null)
  const [escalatingId, setEscalatingId] = useState(null)
  const liveRef = useRef(null)

  const loadRules = async () => {
    setLoading(true)
    try {
      const d = await api.getDetectionRules()
      setRules(d.rules || [])
    } catch { toast('Erreur chargement des règles', 'error') }
    finally { setLoading(false) }
  }

  const loadLiveAlerts = async () => {
    try {
      const d = await api.getDynamicAlerts()
      setLiveAlerts(d.alerts || [])
    } catch {}
  }

  useEffect(() => { loadRules(); loadLiveAlerts() }, [])

  useEffect(() => {
    const id = setInterval(loadLiveAlerts, 5000)
    return () => clearInterval(id)
  }, [])

  const handleToggleRule = async (rule) => {
    setTogglingId(rule.id)
    try {
      const d = await api.updateDetectionRule(rule.id, { enabled: !rule.enabled })
      setRules(prev => prev.map(r => r.id === rule.id ? d.rule : r))
      toast(`Règle ${d.rule.enabled ? 'activée' : 'désactivée'}`, 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setTogglingId(null) }
  }

  const handleDeleteRule = async (id) => {
    if (!window.confirm('Supprimer cette règle ?')) return
    setDeletingId(id)
    try {
      await api.deleteDetectionRule(id)
      setRules(prev => prev.filter(r => r.id !== id))
      toast('Règle supprimée', 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setDeletingId(null) }
  }

  const isLocalSrc = (src) => /^\[?::1\]?$|^127\.|^0\.0\.0\.0$|^\*$|^\[::\]$/.test(src)

  const handleBlock = async (alert) => {
    const ip = alert.source.replace(/^\[|\]$/g, '')
    setBlockingId(alert.id)
    try {
      await api.blockHost(ip, `${alert.type} — Score ${alert.riskScore}`, alert.id)
      toast(`Source bloquée : ${ip}`, 'success')
    } catch (e) { toast(e.message || 'Erreur blocage', 'error') }
    finally { setBlockingId(null) }
  }

  const handleAck = async (id) => {
    setAckingId(id)
    try { await api.acknowledgeDynamicAlert(id) } catch {}
    finally {
      setLiveAlerts(prev => prev.filter(a => a.id !== id))
      toast('Alerte acquittée', 'success')
      setAckingId(null)
    }
  }

  const handleEscalate = async (alert) => {
    setEscalatingId(alert.id)
    try {
      await api.updateAlert(alert.id, { status: 'open' })
    } catch {}
    finally {
      setEscalatingId(null)
      toast('Escaladée → Alertes & Incidents', 'success')
    }
  }

  const handleClearAll = async () => {
    try { await api.clearDynamicAlerts() } catch {}
    setLiveAlerts([])
    toast('Toutes les alertes acquittées', 'success')
  }

  const handleSaveRule = (saved, isNew) => {
    if (isNew) setRules(prev => [...prev, saved])
    else setRules(prev => prev.map(r => r.id === saved.id ? saved : r))
    setEditingRule(null)
    setShowNewRule(false)
  }

  const filteredRules = rules.filter(r =>
    !filter || r.name?.toLowerCase().includes(filter.toLowerCase()) ||
    r.id?.toLowerCase().includes(filter.toLowerCase()) ||
    r.mitre?.toLowerCase().includes(filter.toLowerCase())
  )

  const totalTechs = mitreAttackData.reduce((sum, t) => sum + t.techniques.length, 0)
  const coveredTechs = mitreAttackData.reduce((sum, t) => sum + t.techniques.filter(tt => tt.covered).length, 0)
  const coverage = Math.round((coveredTechs / totalTechs) * 100)
  const totalDetections = mitreAttackData.reduce((sum, t) => sum + t.techniques.reduce((s, tt) => s + tt.detections, 0), 0)

  return (
    <div className="p-6 space-y-5">
      {(showNewRule || editingRule) && (
        <RuleModal rule={editingRule} onSave={handleSaveRule} onClose={() => { setShowNewRule(false); setEditingRule(null) }} />
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Règles actives', value: rules.filter(r => r.enabled).length, icon: Shield, color: 'text-cyber-400' },
          { label: 'Couverture ATT&CK', value: `${coverage}%`, icon: Target, color: 'text-purple-400', sub: `${coveredTechs}/${totalTechs} techniques` },
          { label: 'Alertes live', value: liveAlerts.length, icon: Activity, color: liveAlerts.some(a => a.severity === 'critical') ? 'text-red-400' : 'text-orange-400', sub: 'Moteur de détection' },
          { label: 'Connexions suivies', value: metrics?.sessions ?? '—', icon: Brain, color: 'text-blue-400', sub: 'Sessions TCP actives' },
        ].map(({ label, value, icon: Icon, color, sub }) => (
          <div key={label} className="card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 mb-1">{label}</p>
                <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
                {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
              </div>
              <Icon className={`w-5 h-5 ${color} opacity-60`} />
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-800 border border-dark-600 rounded-xl p-1 w-fit">
        {[
          { id: 'rules', label: 'Règles de détection' },
          { id: 'live', label: `Alertes live ${liveAlerts.length > 0 ? `(${liveAlerts.length})` : ''}` },
          { id: 'mitre', label: 'Couverture MITRE ATT&CK' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-cyber-500/15 text-cyber-300 border border-cyber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'rules' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-dark-600 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Règles de détection ({filteredRules.length}/{rules.length})</h2>
            <div className="flex items-center gap-2">
              <button onClick={loadRules} className="p-1.5 rounded-lg hover:bg-dark-700 text-slate-500 hover:text-slate-300 transition-colors">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-700 border border-dark-600">
                <Search className="w-3.5 h-3.5 text-slate-500" />
                <input value={filter} onChange={e => setFilter(e.target.value)}
                  className="bg-transparent text-xs text-slate-300 outline-none placeholder-slate-600 w-32" placeholder="Filtrer..." />
              </div>
              <button onClick={() => setShowNewRule(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyber-600/20 border border-cyber-500/30 text-cyber-400 text-xs font-medium hover:bg-cyber-600/30 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Nouvelle règle
              </button>
            </div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /><span className="text-xs">Chargement…</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-600">
                    {['ID', 'Nom', 'MITRE', 'Proto/Port', 'Sévérité', 'Score', 'Statut', 'Mis à jour', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-600/50">
                  {filteredRules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-dark-750 transition-colors">
                      <td className="px-4 py-3"><span className="text-xs font-mono text-slate-500">{rule.id}</span></td>
                      <td className="px-4 py-3 max-w-xs">
                        <div>
                          <span className="text-xs font-medium text-slate-200 block truncate">{rule.name}</span>
                          <span className="text-[10px] text-slate-500 truncate">{rule.description}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">{rule.mitre || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono text-slate-400">
                          {rule.match?.proto || '*'}{rule.match?.port ? `/${rule.match.port}` : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${SEVERITY_STYLE[rule.severity] || SEVERITY_STYLE.low}`}>
                          {rule.severity?.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-mono font-bold ${rule.riskScore >= 80 ? 'text-red-400' : rule.riskScore >= 60 ? 'text-orange-400' : 'text-cyber-400'}`}>
                          {rule.riskScore}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleToggleRule(rule)} disabled={togglingId === rule.id}
                          className={`flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                            rule.enabled ? 'bg-cyber-500/15 text-cyber-400 border-cyber-500/25 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/25'
                              : 'bg-dark-700 text-slate-500 border-dark-600 hover:bg-cyber-500/10 hover:text-cyber-400 hover:border-cyber-500/25'
                          }`}>
                          {togglingId === rule.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <div className={`w-1.5 h-1.5 rounded-full ${rule.enabled ? 'bg-cyber-500' : 'bg-slate-600'}`} />}
                          {rule.enabled ? 'Actif' : 'Désactivé'}
                        </button>
                      </td>
                      <td className="px-4 py-3"><span className="text-[10px] font-mono text-slate-500">{rule.updated}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setEditingRule(rule)} className="text-xs text-slate-500 hover:text-cyber-400 transition-colors">Éditer</button>
                          <button onClick={() => handleDeleteRule(rule.id)} disabled={deletingId === rule.id}
                            className="p-1 text-slate-600 hover:text-red-400 transition-colors">
                            {deletingId === rule.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'live' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-dark-600 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <h2 className="text-sm font-semibold text-white">Détections temps réel</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{liveAlerts.length} événement(s) — moteur interne</span>
              {liveAlerts.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-dark-700 hover:bg-dark-600 border border-dark-600 text-xs text-slate-400 transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Tout acquitter
                </button>
              )}
              <button onClick={loadLiveAlerts} className="p-1.5 rounded-lg hover:bg-dark-700 text-slate-500 hover:text-slate-300 transition-colors">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {liveAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-600">
              <Shield className="w-8 h-8" />
              <p className="text-sm">Aucune détection live — le moteur analyse le trafic en temps réel</p>
            </div>
          ) : (
            <div className="divide-y divide-dark-600/50">
              {liveAlerts.map(a => (
                <div key={a.id} className="px-5 py-3.5 hover:bg-dark-750 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_DOT[a.severity] || 'bg-slate-500'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${SEVERITY_STYLE[a.severity] || SEVERITY_STYLE.low}`}>{a.severity?.toUpperCase()}</span>
                        <span className="text-xs font-medium text-slate-200">{a.type}</span>
                        {a.mitre && <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">{a.mitre}</span>}
                        <span className="text-[10px] font-mono font-semibold text-orange-400">Score {a.riskScore}</span>
                        <span className="ml-auto text-[10px] font-mono text-slate-600 flex-shrink-0">
                          {new Date(a.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 truncate">{a.description}</p>
                      <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-slate-500">
                        <span className="truncate max-w-[200px]">{a.source}</span>
                        <span>→</span>
                        <span className="truncate max-w-[200px]">{a.destination}</span>
                        <span>·</span>
                        <span>{a.protocol}</span>
                      </div>
                      {/* Actions */}
                      <div className="flex items-center gap-1.5 mt-2">
                        <button
                          onClick={() => handleBlock(a)}
                          disabled={blockingId === a.id || isLocalSrc(a.source)}
                          title={isLocalSrc(a.source) ? 'IP locale — blocage non applicable' : 'Bloquer la source dans le pare-feu'}
                          className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-[10px] text-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {blockingId === a.id
                            ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            : <Ban className="w-2.5 h-2.5" />}
                          Bloquer
                        </button>
                        <button
                          onClick={() => handleEscalate(a)}
                          disabled={escalatingId === a.id}
                          title="Escalader vers Alertes & Incidents"
                          className="flex items-center gap-1 px-2 py-0.5 rounded bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 text-[10px] text-orange-400 transition-colors disabled:opacity-40"
                        >
                          {escalatingId === a.id
                            ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            : <ArrowUpRight className="w-2.5 h-2.5" />}
                          Escalader
                        </button>
                        <button
                          onClick={() => handleAck(a.id)}
                          disabled={ackingId === a.id}
                          title="Acquitter — retirer de la vue live"
                          className="flex items-center gap-1 px-2 py-0.5 rounded bg-dark-700 hover:bg-dark-600 border border-dark-600 text-[10px] text-slate-400 transition-colors disabled:opacity-40"
                        >
                          {ackingId === a.id
                            ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            : <CheckCircle className="w-2.5 h-2.5" />}
                          Acquitter
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'mitre' && (
        <div className="space-y-4">
          {/* Coverage Summary */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white">Matrice de couverture MITRE ATT&CK Enterprise</h2>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-cyber-500/30 border border-cyber-500/50" />
                  <span className="text-slate-400">Couverte</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-dark-700 border border-dark-600" />
                  <span className="text-slate-400">Non couverte</span>
                </div>
                <span className="text-cyber-400 font-bold font-mono">{coverage}% de couverture</span>
              </div>
            </div>
            <div className="h-2 rounded-full bg-dark-600 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyber-600 to-cyber-400 transition-all duration-500"
                style={{ width: `${coverage}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 mt-1">
              <span>{coveredTechs} techniques couvertes</span>
              <span>{totalTechs - coveredTechs} non couvertes</span>
            </div>
          </div>

          {/* Tactic Accordion */}
          <div className="space-y-2">
            {mitreAttackData.map((tactic) => {
              const isOpen = expandedTactic === tactic.id
              const tacticCoverage = Math.round((tactic.techniques.filter(t => t.covered).length / tactic.techniques.length) * 100)
              const color = tacticColors[tactic.tactic] || '#64748b'

              return (
                <div key={tactic.id} className="card overflow-hidden">
                  <button
                    onClick={() => setExpandedTactic(isOpen ? null : tactic.id)}
                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-dark-750 transition-colors text-left"
                  >
                    <div className="w-2 h-6 rounded-full flex-shrink-0" style={{ background: color }} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{tactic.tactic}</span>
                        <span className="text-[10px] font-mono text-slate-500">{tactic.id}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <div className="flex items-center gap-1 text-[10px] text-cyber-400">
                          <CheckCircle className="w-3 h-3" />
                          {tactic.techniques.filter(t => t.covered).length}/{tactic.techniques.length} techniques
                        </div>
                        <div className="w-24 h-1 rounded-full bg-dark-600 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${tacticCoverage}%`, background: color }} />
                        </div>
                        <span className="text-[10px] font-mono" style={{ color }}>{tacticCoverage}%</span>
                      </div>
                    </div>
                    {isOpen ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-4 border-t border-dark-600 pt-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                        {tactic.techniques.map(tech => (
                          <TechniqueCell key={tech.id} technique={tech} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
