import React, { useState, useEffect, useCallback } from 'react'
import {
  Zap, Shield, Clock, CheckCircle, XCircle, AlertTriangle,
  Play, Pause, RotateCcw, Ban, Lock, Server, ChevronRight, Eye, Loader2
} from 'lucide-react'
import { playbooks } from '../data/mockData'
import { api } from '../services/api'
import { useToast } from '../components/UI/Toast'


function PlaybookCard({ pb, onDetails, onSuspend }) {
  const modeColor = pb.mode === 'automatique'
    ? 'text-cyber-400 bg-cyber-500/10 border-cyber-500/25'
    : 'text-yellow-400 bg-yellow-500/10 border-yellow-500/25'

  const successRate = pb.executions > 0 ? Math.round((pb.success / pb.executions) * 100) : 0
  const isActive = pb.status === 'active'

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono text-slate-500">{pb.id}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${modeColor}`}>
              {pb.mode === 'automatique' ? 'AUTO' : 'SEMI-AUTO'}
            </span>
          </div>
          <h3 className="text-xs font-semibold text-white">{pb.name}</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">Déclencheur : {pb.trigger}</p>
        </div>
        <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-cyber-500 animate-pulse' : 'bg-slate-600'}`} />
      </div>

      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-dark-600">
        <div className="text-center">
          <p className="text-[10px] text-slate-500">Exéc.</p>
          <p className="text-sm font-bold font-mono text-slate-200">{pb.executions}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-slate-500">Succès</p>
          <p className="text-sm font-bold font-mono text-cyber-400">{pb.success}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-slate-500">Taux</p>
          <p className={`text-sm font-bold font-mono ${successRate >= 90 ? 'text-cyber-400' : successRate >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
            {pb.executions > 0 ? `${successRate}%` : '—'}
          </p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onDetails(pb)}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-dark-700 hover:bg-dark-600 border border-dark-600 text-xs text-slate-400 transition-colors"
        >
          <Eye className="w-3 h-3" />
          Détails
        </button>
        <button
          onClick={() => onSuspend(pb.id)}
          className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded border text-xs transition-colors ${
            isActive
              ? 'bg-red-500/10 hover:bg-red-500/20 border-red-500/20 text-red-400'
              : 'bg-cyber-500/10 hover:bg-cyber-500/20 border-cyber-500/20 text-cyber-400'
          }`}
        >
          {isActive ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          {isActive ? 'Suspendre' : 'Activer'}
        </button>
      </div>
    </div>
  )
}

export default function Response() {
  const [activeTab, setActiveTab] = useState('playbooks')
  const [pbList, setPbList] = useState(playbooks)
  const [detailsPb, setDetailsPb] = useState(null)
  const [blockedHosts, setBlockedHosts] = useState([])
  const [actionLog, setActionLog] = useState([])
  const [loadingLog, setLoadingLog] = useState(true)
  const [loadingIp, setLoadingIp] = useState(null)
  const { toast } = useToast()

  const handleSuspend = useCallback((id) => {
    setPbList(prev => prev.map(p => {
      if (p.id !== id) return p
      const next = p.status === 'active' ? 'suspended' : 'active'
      toast(next === 'suspended' ? `Playbook ${id} suspendu` : `Playbook ${id} activé`, next === 'suspended' ? 'warning' : 'success')
      return { ...p, status: next }
    }))
  }, [toast])

  useEffect(() => {
    api.getBlocks().then(d => setBlockedHosts(d.blocks || [])).catch(() => {})
    api.getAuditLog().then(d => {
      const entries = (d.entries || []).map(e => ({
        id: e.id || e.ts,
        time: new Date(e.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        action: e.action?.replace(/_/g, ' ') || e.action,
        target: e.target || '—',
        playbook: '—',
        mode: 'système',
        status: 'success',
        analyst: e.actor || 'Système',
      }))
      setActionLog(entries)
      setLoadingLog(false)
    }).catch(() => setLoadingLog(false))
  }, [])

  const handleUnblock = useCallback(async (ip) => {
    setLoadingIp(ip)
    try {
      await api.unblockHost(ip)
      setBlockedHosts(prev => prev.filter(h => h.ip !== ip))
      setActionLog(prev => [{ id: Date.now(), time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), action: 'Rollback blocage', target: ip, playbook: '—', mode: 'manuel', status: 'success', analyst: 'Utilisateur' }, ...prev])
      toast(`Blocage annulé : ${ip}`, 'success')
    } catch (e) {
      toast(e.message || 'Erreur lors du déblocage', 'error')
    } finally {
      setLoadingIp(null)
    }
  }, [toast])

  const handlePermanent = useCallback(async (ip) => {
    try {
      await api.updateBlock(ip, { permanent: true, expires: 'Manuel' })
      setBlockedHosts(prev => prev.map(h => h.ip === ip ? { ...h, permanent: true, expires: 'Manuel' } : h))
      toast(`Blocage permanent : ${ip}`, 'warning')
    } catch (e) {
      toast(e.message || 'Erreur', 'error')
    }
  }, [toast])

  const handleApprove = useCallback((id) => {
    setActionLog(prev => prev.map(a => a.id === id ? { ...a, status: 'success' } : a))
    toast('Action approuvée', 'success')
  }, [toast])

  const handleReject = useCallback((id) => {
    setActionLog(prev => prev.map(a => a.id === id ? { ...a, status: 'failed' } : a))
    toast('Action rejetée', 'warning')
  }, [toast])

  const pendingActions = actionLog.filter(a => a.status === 'pending')

  return (
    <div className="p-6 space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Playbooks actifs', value: pbList.filter(p => p.status === 'active').length, icon: Zap, color: 'text-cyber-400' },
          { label: 'Hôtes bloqués', value: blockedHosts.length, icon: Ban, color: 'text-red-400' },
          { label: 'Actions en attente', value: pendingActions.length, icon: Clock, color: 'text-yellow-400', alert: pendingActions.length > 0 },
          { label: 'MTTR moyen', value: '1m 48s', icon: Shield, color: 'text-blue-400', sub: 'Cible : < 2min ✓' },
        ].map(({ label, value, icon: Icon, color, sub, alert }) => (
          <div key={label} className={`card p-5 ${alert ? 'border-yellow-500/30' : ''}`}>
            {alert && <div className="absolute top-0 left-0 right-0 h-0.5 bg-yellow-500 rounded-t-xl" />}
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

      {/* Pending Approval Banner */}
      {pendingActions.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
          <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          <span className="text-sm text-yellow-300">
            <strong>{pendingActions.length} action(s)</strong> requièrent une validation humaine
          </span>
          <div className="ml-auto flex gap-2">
            {pendingActions.map(a => (
              <div key={a.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-800 border border-dark-600">
                <span className="text-xs text-slate-300">{a.action} — {a.target}</span>
                <button onClick={() => handleApprove(a.id)} className="p-1 rounded bg-cyber-500/20 border border-cyber-500/30 text-cyber-400 hover:bg-cyber-500/30 transition-colors">
                  <CheckCircle className="w-3 h-3" />
                </button>
                <button onClick={() => handleReject(a.id)} className="p-1 rounded bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-colors">
                  <XCircle className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-800 border border-dark-600 rounded-xl p-1 w-fit">
        {[
          { id: 'playbooks', label: 'Playbooks SOAR' },
          { id: 'blocked', label: 'Hôtes bloqués' },
          { id: 'log', label: 'Journal des actions' },
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

      {activeTab === 'playbooks' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pbList.map(pb => <PlaybookCard key={pb.id} pb={pb} onDetails={setDetailsPb} onSuspend={handleSuspend} />)}
        </div>
      )}

      {activeTab === 'blocked' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-dark-600 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Hôtes & IP bloqués ({blockedHosts.length})</h2>
            <span className="text-xs text-slate-500">Anti-emballement actif — liste blanche protégée</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-600">
                  {['Adresse IP', 'Motif', 'Bloqué depuis', 'Expiration', 'Mode', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-600/50">
                {blockedHosts.map((host) => (
                  <tr key={host.ip} className="hover:bg-dark-750 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Ban className="w-3 h-3 text-red-400" />
                        <span className="text-xs font-mono font-semibold text-slate-200">{host.ip}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-400">{host.reason}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-slate-500">{host.since}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-mono ${host.expires === 'Manuel' ? 'text-orange-400' : 'text-slate-500'}`}>
                        {host.expires}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                        host.auto ? 'bg-cyber-500/15 text-cyber-400 border-cyber-500/25' : 'bg-purple-500/15 text-purple-400 border-purple-500/25'
                      }`}>
                        {host.auto ? 'Auto' : 'Manuel'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => handleUnblock(host.ip)} disabled={loadingIp === host.ip} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 hover:bg-yellow-500/20 transition-colors disabled:opacity-50">
                          {loadingIp === host.ip ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                          Annuler
                        </button>
                        <button onClick={() => handlePermanent(host.ip)} disabled={host.permanent || loadingIp === host.ip} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-dark-700 border border-dark-600 text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                          <Lock className="w-3 h-3" />
                          Perm.
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'log' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-dark-600">
            <h2 className="text-sm font-semibold text-white">Journal des actions — Piste d'audit inaltérable</h2>
          </div>
          <div className="divide-y divide-dark-600/50">
            {loadingLog && <div className="px-5 py-6 text-center text-slate-500 text-xs">Chargement du journal…</div>}
            {!loadingLog && actionLog.length === 0 && <div className="px-5 py-6 text-center text-slate-500 text-xs">Aucune action enregistrée</div>}
            {actionLog.map((entry) => (
              <div key={entry.id} className="px-5 py-3 flex items-center gap-4 hover:bg-dark-750 transition-colors">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  entry.status === 'success' ? 'bg-cyber-500' :
                  entry.status === 'pending' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
                }`} />
                <span className="text-xs font-mono text-slate-500 w-16 flex-shrink-0">{entry.time}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-200">{entry.action}</span>
                    <span className="text-xs font-mono text-slate-500">→ {entry.target}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-slate-600">Playbook : {entry.playbook}</span>
                    <span className="text-[10px] text-slate-600">·</span>
                    <span className="text-[10px] text-slate-600">Par : {entry.analyst}</span>
                  </div>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                  entry.mode === 'auto' ? 'bg-cyber-500/10 text-cyber-400 border-cyber-500/20' :
                  entry.mode === 'semi-auto' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                  'bg-purple-500/10 text-purple-400 border-purple-500/20'
                }`}>{entry.mode}</span>
                <span className={`text-[10px] font-semibold ${
                  entry.status === 'success' ? 'text-cyber-400' :
                  entry.status === 'pending' ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {entry.status === 'success' ? '✓ Succès' : entry.status === 'pending' ? '⏳ En attente' : '✕ Échec'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Détails Playbook */}
      {detailsPb && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setDetailsPb(null)}
        >
          <div
            className="card max-w-sm w-full mx-4 p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-[10px] font-mono text-slate-500">{detailsPb.id}</span>
                <h2 className="text-sm font-bold text-white mt-0.5">{detailsPb.name}</h2>
              </div>
              <button
                onClick={() => setDetailsPb(null)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
                aria-label="Fermer"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2.5 text-xs border-t border-dark-600 pt-4">
              {[
                ['Mode', detailsPb.mode === 'automatique' ? 'Automatique' : 'Semi-automatique'],
                ['Déclencheur', detailsPb.trigger],
                ['Exécutions totales', detailsPb.executions],
                ['Succès', detailsPb.success],
                ['Taux de réussite', detailsPb.executions > 0 ? `${Math.round((detailsPb.success / detailsPb.executions) * 100)}%` : '—'],
                ['Dernière exécution', detailsPb.lastRun === 'Jamais' ? 'Jamais' : new Date(detailsPb.lastRun).toLocaleString('fr-FR')],
                ['Statut', detailsPb.status === 'active' ? 'Actif' : 'Suspendu'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4">
                  <span className="text-slate-500 shrink-0">{label}</span>
                  <span className="font-mono text-slate-300 text-right">{value}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setDetailsPb(null)}
              className="mt-5 w-full py-2 rounded bg-dark-700 hover:bg-dark-600 border border-dark-600 text-xs text-slate-400 transition-colors"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
