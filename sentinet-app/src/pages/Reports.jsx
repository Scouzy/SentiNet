import React, { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { FileBarChart, Download, FileText, Shield, Clock, Target, Activity, Server, AlertTriangle } from 'lucide-react'
import { api } from '../services/api'

const reportTemplates = [
  { name: 'Rapport opérationnel quotidien', desc: 'Alertes, incidents, métriques — Dernières 24h', format: 'PDF + CSV', schedule: 'Quotidien 08:00', icon: '📊' },
  { name: 'Rapport exécutif hebdomadaire', desc: 'Synthèse RSSI, KPI, tendances, top menaces', format: 'PDF', schedule: 'Lundi 09:00', icon: '📋' },
  { name: 'Rapport de conformité RGPD', desc: 'Registre traitements, accès aux données, rétention', format: 'PDF', schedule: 'Mensuel', icon: '⚖️' },
  { name: 'Matrice de couverture ATT&CK', desc: 'Techniques couvertes, lacunes identifiées, recommandations', format: 'PDF + Excel', schedule: 'À la demande', icon: '🎯' },
  { name: 'Rapport de recette / PV de tests', desc: 'Résultats des tests de charge et simulation d\'attaques', format: 'PDF', schedule: 'À la demande', icon: '✅' },
  { name: 'Audit trail — Piste d\'audit', desc: 'Journal complet des actions administratives et de réponse', format: 'CSV + JSON', schedule: 'À la demande', icon: '🔍' },
]

export default function Reports() {
  const [trends, setTrends] = useState([])
  const [alertStats, setAlertStats] = useState(null)
  const [sysInfo, setSysInfo] = useState(null)
  const [blocks, setBlocks] = useState([])

  useEffect(() => {
    const load = () => Promise.allSettled([
      api.getAlertTrends(),
      api.getAlertStats(),
      api.getSystemInfo(),
      api.getBlocks(),
    ]).then(([t, s, sys, b]) => {
      if (t.status === 'fulfilled') setTrends(t.value.trends || [])
      if (s.status === 'fulfilled') setAlertStats(s.value)
      if (sys.status === 'fulfilled') setSysInfo(sys.value)
      if (b.status === 'fulfilled') setBlocks(b.value.blocks || [])
    })
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [])

  const totalAlerts = alertStats?.total || 0
  const openAlerts = alertStats?.open || 0
  const resolvedAlerts = totalAlerts - openAlerts
  const resolutionRate = totalAlerts > 0 ? Math.round(resolvedAlerts / totalAlerts * 100) : 0
  const uptimeDays = sysInfo ? Math.floor(sysInfo.uptime / 86400) : null
  const uptimeHours = sysInfo ? Math.floor((sysInfo.uptime % 86400) / 3600) : null
  const uptimeStr = sysInfo ? (uptimeDays > 0 ? `${uptimeDays}j ${uptimeHours}h` : `${uptimeHours}h`) : '—'

  const kpiData = [
    { label: 'Alertes totales', value: totalAlerts, target: '—', status: 'ok', trend: `${openAlerts} ouvertes`, icon: AlertTriangle },
    { label: 'Alertes résolues', value: resolvedAlerts, target: '—', status: 'ok', trend: `${resolvedAlerts} fermées`, icon: Shield },
    { label: 'Taux de résolution', value: totalAlerts > 0 ? `${resolutionRate}%` : '—', target: '≥ 80%', status: resolutionRate >= 80 ? 'ok' : 'warning', trend: `${openAlerts} en cours`, icon: Target },
    { label: 'Blocages actifs', value: blocks.length, target: '—', status: 'ok', trend: `règles pare-feu`, icon: Shield },
    { label: 'CPU système', value: sysInfo ? `${sysInfo.cpu}%` : '—', target: '< 80%', status: sysInfo?.cpu < 80 ? 'ok' : 'warning', trend: sysInfo ? `RAM ${sysInfo.mem}%` : '—', icon: Activity },
    { label: 'Uptime plateforme', value: uptimeStr, target: '≥ 99.9%', status: 'ok', trend: sysInfo?.hostname || '—', icon: Server },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* KPI Cards */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-4">Indicateurs clés (KPI) — Période en cours</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {kpiData.map(({ label, value, target, status, trend, icon: Icon }) => (
            <div key={label} className={`card p-4 ${status === 'warning' ? 'border-yellow-500/30' : ''}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="p-2 rounded-lg bg-dark-700 border border-dark-600">
                  <Icon className="w-4 h-4 text-slate-400" />
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                  status === 'ok'
                    ? 'bg-cyber-500/15 text-cyber-400 border-cyber-500/25'
                    : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25'
                }`}>
                  {status === 'ok' ? '✓ CIBLE' : '⚠ ATTENTION'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-2 mb-1">{label}</p>
              <p className={`text-xl font-bold font-mono ${status === 'ok' ? 'text-cyber-400' : 'text-yellow-400'}`}>{value}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-slate-600">Cible : {target}</span>
                <span className={`text-[10px] font-mono ${status === 'ok' ? 'text-cyber-500' : 'text-yellow-500'}`}>{trend}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trend Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Volume d’alertes par jour (7j)</h2>
          <p className="text-xs text-slate-500 mb-4">
            {trends.length === 0 ? 'En attente de données' : `${trends.reduce((s, d) => s + (d.critical || 0) + (d.high || 0) + (d.medium || 0) + (d.low || 0), 0)} alertes sur 7 jours`}
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trends} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2d4e" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#0a1628', border: '1px solid #1a2d4e', borderRadius: '8px', fontSize: '11px' }} />
              <Bar dataKey="critical" name="Critique" fill="#ef4444" stackId="a" />
              <Bar dataKey="high" name="Élevée" fill="#f97316" stackId="a" />
              <Bar dataKey="medium" name="Moyenne" fill="#eab308" stackId="a" />
              <Bar dataKey="low" name="Faible" fill="#3b82f6" stackId="a" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-white mb-1">État du système en temps réel</h2>
          <p className="text-xs text-slate-500 mb-5">{sysInfo ? `${sysInfo.hostname} · ${sysInfo.platform} · ${sysInfo.cpuCores} cœurs` : 'Chargement…'}</p>
          <div className="space-y-4">
            {[
              { label: 'CPU', value: sysInfo?.cpu ?? 0, color: (sysInfo?.cpu ?? 0) > 80 ? '#ef4444' : '#00c98d' },
              { label: 'RAM', value: sysInfo?.mem ?? 0, color: (sysInfo?.mem ?? 0) > 80 ? '#ef4444' : '#3b82f6' },
              { label: 'Alertes ouvertes', value: totalAlerts > 0 ? Math.round(openAlerts / totalAlerts * 100) : 0, color: '#f97316', raw: openAlerts },
              { label: 'Résolution', value: resolutionRate, color: '#8b5cf6', raw: `${resolutionRate}%` },
            ].map(({ label, value, color, raw }) => (
              <div key={label}>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-slate-400">{label}</span>
                  <span className="font-mono font-semibold" style={{ color }}>{raw ?? `${value}%`}</span>
                </div>
                <div className="h-2 rounded-full bg-dark-600 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(value, 100)}%`, background: color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Report Templates */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Modèles de rapports</h2>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyber-600/20 border border-cyber-500/30 text-cyber-400 text-xs font-medium hover:bg-cyber-600/30 transition-colors">
            <FileText className="w-3 h-3" />
            Nouveau modèle
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {reportTemplates.map((report) => (
            <div key={report.name} className="card p-4 hover:border-dark-500 transition-colors group">
              <div className="flex items-start gap-3 mb-3">
                <span className="text-2xl">{report.icon}</span>
                <div>
                  <h3 className="text-xs font-semibold text-white">{report.name}</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">{report.desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-600 mb-3">
                <span className="px-1.5 py-0.5 rounded bg-dark-700 border border-dark-600 text-slate-400">{report.format}</span>
                <span>{report.schedule}</span>
              </div>
              <div className="flex gap-2">
                <button className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-cyber-500/10 border border-cyber-500/25 text-cyber-400 text-[10px] font-medium hover:bg-cyber-500/20 transition-colors group-hover:border-cyber-500/40">
                  <Download className="w-3 h-3" />
                  Générer
                </button>
                <button className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-dark-700 border border-dark-600 text-slate-400 text-[10px] font-medium hover:text-slate-200 transition-colors">
                  <FileText className="w-3 h-3" />
                  Configurer
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Compliance */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-white mb-4">État de conformité réglementaire</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'RGPD', coverage: 92, color: '#00c98d' },
            { label: 'NIS2', coverage: 85, color: '#3b82f6' },
            { label: 'ANSSI', coverage: 88, color: '#8b5cf6' },
            { label: 'ISO 27001', coverage: 79, color: '#f59e0b' },
            { label: 'ATT&CK', coverage: 85, color: '#ec4899' },
          ].map(({ label, coverage, color }) => (
            <div key={label} className="text-center p-4 rounded-xl bg-dark-700/50 border border-dark-600">
              <div className="relative w-16 h-16 mx-auto mb-2">
                <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                  <circle cx="18" cy="18" r="14" fill="none" stroke="#1a2d4e" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="14" fill="none"
                    stroke={color} strokeWidth="3"
                    strokeDasharray={`${(coverage / 100) * 88} 88`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-bold font-mono" style={{ color }}>{coverage}%</span>
                </div>
              </div>
              <p className="text-xs font-semibold text-slate-300">{label}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{coverage >= 90 ? 'Conforme' : coverage >= 80 ? 'En cours' : 'À améliorer'}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
