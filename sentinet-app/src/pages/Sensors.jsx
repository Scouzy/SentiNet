import React, { useState, useEffect } from 'react'
import { Server, Radar, Wifi, WifiOff, Globe, Network as NetIcon, ShieldAlert, Ban, Copy, CheckCircle, Loader2, ChevronRight, ArrowLeft } from 'lucide-react'
import { api } from '../services/api'
import { useToast } from '../components/UI/Toast'

const SEV = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#3b82f6' }

// ── Carte d'une sonde (vue détaillée) ─────────────────────────────────────────
function SensorCard({ s, alertsFor, onBlock, blockingIp }) {
  const sa = alertsFor(s).slice(0, 5)
  const online = s.status === 'online'
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {s.kind === 'agent' ? <Radar className="w-4 h-4 text-cyber-400" /> : <Server className="w-4 h-4 text-blue-400" />}
          <div>
            <h3 className="text-xs font-semibold text-white flex items-center gap-1.5 flex-wrap">
              {s.host} <span className="text-slate-500 font-normal">· {s.segment}</span>
            </h3>
            <p className="text-[10px] text-slate-500 font-mono">
              {s.kind === 'agent' ? 'Agent' : 'Sonde locale'}{s.subnet ? ` · ${s.subnet}` : ''}{s.iface ? ` · ${s.iface}` : ''}
            </p>
          </div>
        </div>
        <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border ${online ? 'text-cyber-400 bg-cyber-500/10 border-cyber-500/25' : 'text-slate-400 bg-dark-700 border-dark-600'}`}>
          {online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}{online ? 'En ligne' : 'Hors ligne'}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3 pt-2 border-t border-dark-600">
        <div className="text-center"><p className="text-[10px] text-slate-500">Charge</p><p className="text-sm font-bold font-mono text-slate-200">{s.load}%</p></div>
        <div className="text-center"><p className="text-[10px] text-slate-500">Flux</p><p className="text-sm font-bold font-mono text-slate-200">{s.connections}</p></div>
        <div className="text-center"><p className="text-[10px] text-slate-500">Alertes</p><p className={`text-sm font-bold font-mono ${sa.length ? 'text-red-400' : 'text-slate-200'}`}>{alertsFor(s).length}</p></div>
      </div>
      {sa.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Intrusions récentes</p>
          {sa.map((a, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px] p-1.5 rounded bg-dark-700/50">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: SEV[a.severity] || '#475569' }} />
              <span className="text-slate-300 truncate flex-1">{a.type} <span className="text-slate-600 font-mono">{a.source}→{a.destination}</span></span>
              <button
                onClick={() => onBlock(a.source)}
                disabled={blockingIp}
                className="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors text-[10px]"
              >
                {blockingIp ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />} Bloquer
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-slate-600 text-center py-2">Aucune intrusion détectée sur ce segment</p>
      )}
    </div>
  )
}

export default function Sensors() {
  const { toast } = useToast()
  const [sensors, setSensors] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [blockingIp, setBlockingIp] = useState(null)
  const [copiedKey, setCopiedKey] = useState('')
  const [selectedDomain, setSelectedDomain] = useState('all')

  useEffect(() => {
    const load = () => {
      api.getSensors().then(d => { setSensors(d.sensors || []); setLoading(false) }).catch(() => setLoading(false))
      api.getAlerts().then(d => setAlerts(d.alerts || [])).catch(() => {})
    }
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [])

  const alertsFor = (s) => alerts.filter(a =>
    a.probe === s.id || (s.kind === 'local' && (a.probe === 'LOCAL' || a.probe === 'SENSOR-LOCAL'))
  )

  const handleBlock = async (ip) => {
    const clean = (ip || '').replace(/^\[|\]$/g, '').split(':').slice(0, -1).join(':') || ip
    setBlockingIp(clean)
    try { await api.blockHost(clean, 'Blocage depuis la console Sondes'); toast(`Source bloquée : ${clean}`, 'success') }
    catch (e) { toast(e.message || 'Erreur', 'error') }
    finally { setBlockingIp(null) }
  }

  // Regroupement par domaine + synthèse
  const byDomain = {}
  for (const s of sensors) { const d = s.domain || '—'; (byDomain[d] = byDomain[d] || []).push(s) }
  const domainNames = Object.keys(byDomain).sort()

  const summaries = domainNames.map(domain => {
    const list = byDomain[domain]
    const domAlerts = list.flatMap(s => alertsFor(s))
    const bySev = { critical: 0, high: 0, medium: 0, low: 0 }
    domAlerts.forEach(a => { if (bySev[a.severity] !== undefined) bySev[a.severity]++ })
    return {
      domain, list,
      online: list.filter(s => s.status === 'online').length,
      total: list.length,
      segments: new Set(list.map(s => s.segment)).size,
      alerts: domAlerts.length,
      bySev,
    }
  })

  const online = sensors.filter(s => s.status === 'online').length
  const eastWest = alerts.filter(a => a.probe && a.probe !== 'LOCAL' && a.probe !== 'SENSOR-LOCAL').length

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://sentinet.devantiq.com'
  const steps = [
    { key: 'prereq', label: 'Prérequis sur la machine à superviser (Linux, accès root)',
      cmd: 'apt update && apt install -y nodejs tcpdump' },
    { key: 'copy', label: 'Télécharger l\'agent (aucun scp — directement depuis le serveur)',
      cmd: `mkdir -p /opt/sentinet-agent\ncurl -fsSL ${origin}/api/agent/download -o /opt/sentinet-agent/sentinet-agent.js\nip -o link show   # repérer l'interface à écouter` },
    { key: 'run', label: 'Lancer l\'agent (AGENT_ID unique · AGENT_DOMAIN = domaine réel · AGENT_NETWORK = libellé)',
      cmd: `AGENT_ID=<id-unique> AGENT_DOMAIN=<domaine> AGENT_NETWORK="<libellé>" \\\n  SENTINET_URL=${origin} AGENT_KEY=<votre_clef> \\\n  AGENT_SUBNET=<sous-réseau> IFACE=<interface> \\\n  node /opt/sentinet-agent/sentinet-agent.js` },
  ]
  const copy = (text, key) => {
    try { navigator.clipboard.writeText(text); setCopiedKey(key); setTimeout(() => setCopiedKey(''), 1500) } catch {}
  }

  const focus = selectedDomain !== 'all' ? summaries.find(s => s.domain === selectedDomain) : null

  return (
    <div className="p-6 space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Sondes en ligne', value: `${online}/${sensors.length}`, icon: Wifi, color: 'text-cyber-400' },
          { label: 'Domaines supervisés', value: domainNames.filter(d => d !== '—').length, icon: Globe, color: 'text-blue-400' },
          { label: 'Segments réseau', value: new Set(sensors.map(s => s.segment)).size, icon: NetIcon, color: 'text-purple-400' },
          { label: 'Alertes est-ouest', value: eastWest, icon: ShieldAlert, color: eastWest ? 'text-red-400' : 'text-slate-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-5">
            <div className="flex items-start justify-between">
              <div><p className="text-xs text-slate-500 mb-1">{label}</p><p className={`text-2xl font-bold font-mono ${color}`}>{loading ? '—' : value}</p></div>
              <Icon className={`w-5 h-5 ${color} opacity-60`} />
            </div>
          </div>
        ))}
      </div>

      {/* Barre de sélection de domaine */}
      <div className="card px-4 py-3 flex items-center gap-3 flex-wrap">
        <Globe className="w-4 h-4 text-cyber-400 flex-shrink-0" />
        <span className="text-xs text-slate-400">Domaine :</span>
        <select
          value={selectedDomain}
          onChange={e => setSelectedDomain(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-dark-700 border border-dark-600 text-xs text-slate-200 outline-none cursor-pointer min-w-[180px]"
        >
          <option value="all">Tous les domaines ({domainNames.length})</option>
          {domainNames.map(d => (
            <option key={d} value={d}>{d === '—' ? 'Non renseigné' : d} — {byDomain[d].length} sonde{byDomain[d].length > 1 ? 's' : ''}</option>
          ))}
        </select>
        <span className="text-[10px] text-slate-600 ml-auto hidden sm:block">
          {selectedDomain === 'all' ? 'Vue d\'ensemble — cliquez un domaine pour le détail' : 'Vue détaillée du domaine'}
        </span>
      </div>

      {/* ── Vue d'ensemble (tous les domaines) — compacte ─────────────────────── */}
      {selectedDomain === 'all' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {summaries.map(sm => (
            <button
              key={sm.domain}
              onClick={() => setSelectedDomain(sm.domain)}
              className="card p-4 text-left hover:border-cyber-500/40 transition-colors group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Globe className="w-4 h-4 text-cyber-400 flex-shrink-0" />
                  <span className="text-sm font-semibold text-white truncate">{sm.domain === '—' ? 'Non renseigné' : sm.domain}</span>
                </div>
                <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border ${sm.online === sm.total ? 'text-cyber-400 bg-cyber-500/10 border-cyber-500/25' : 'text-yellow-400 bg-yellow-500/10 border-yellow-500/25'}`}>
                  <Wifi className="w-3 h-3" />{sm.online}/{sm.total}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div><p className="text-[10px] text-slate-500">Sondes</p><p className="text-sm font-bold font-mono text-slate-200">{sm.total}</p></div>
                <div><p className="text-[10px] text-slate-500">Segments</p><p className="text-sm font-bold font-mono text-slate-200">{sm.segments}</p></div>
                <div><p className="text-[10px] text-slate-500">Alertes</p><p className={`text-sm font-bold font-mono ${sm.alerts ? 'text-red-400' : 'text-slate-200'}`}>{sm.alerts}</p></div>
              </div>
              {/* Répartition sévérité */}
              <div className="flex items-center gap-3 text-[10px] font-mono pt-2 border-t border-dark-600">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: SEV.critical }} />{sm.bySev.critical}</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: SEV.high }} />{sm.bySev.high}</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: SEV.medium }} />{sm.bySev.medium}</span>
                <span className="ml-auto flex items-center gap-1 text-cyber-400 group-hover:text-cyber-300">Détail <ChevronRight className="w-3 h-3" /></span>
              </div>
            </button>
          ))}
          {summaries.length === 0 && !loading && (
            <p className="text-xs text-slate-500 col-span-full py-6 text-center">Aucune sonde. Déployez un agent ci-dessous.</p>
          )}
        </div>
      )}

      {/* ── Vue détaillée (un domaine) ────────────────────────────────────────── */}
      {focus && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setSelectedDomain('all')} className="flex items-center gap-1 text-xs text-slate-400 hover:text-cyber-400 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> Tous les domaines
            </button>
            <span className="text-slate-600">/</span>
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyber-400" />
              <h2 className="text-sm font-semibold text-white">{focus.domain === '—' ? 'Non renseigné' : focus.domain}</h2>
              <span className="text-[10px] text-slate-500">· {focus.online}/{focus.total} en ligne · {focus.alerts} alerte(s)</span>
            </div>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {focus.list.map(s => (
              <SensorCard key={s.id} s={s} alertsFor={alertsFor} onBlock={handleBlock} blockingIp={blockingIp} />
            ))}
          </div>
        </div>
      )}

      {/* Déployer un agent — procédure pas-à-pas */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-1">
          <Radar className="w-4 h-4 text-cyber-400" />
          <h2 className="text-sm font-semibold text-white">Déployer une nouvelle sonde (agent)</h2>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Un agent capture le trafic du segment où il est installé et remonte les intrusions ici, sous son domaine.
          La <span className="text-slate-300 font-medium">clé d'agent</span> doit être identique à <span className="font-mono text-slate-300">AGENT_KEY</span> du serveur ; l'<span className="font-mono text-slate-300">AGENT_ID</span> doit être unique par machine.
        </p>
        <ol className="space-y-4">
          {steps.map((s, i) => (
            <li key={s.key} className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyber-500/15 border border-cyber-500/30 flex items-center justify-center text-[11px] font-bold text-cyber-300">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-300 mb-1.5">{s.label}</p>
                <div className="relative">
                  <pre className="text-[11px] font-mono text-slate-300 bg-dark-900 border border-dark-600 rounded-lg p-3 pr-16 overflow-x-auto whitespace-pre">{s.cmd}</pre>
                  <button onClick={() => copy(s.cmd, s.key)} className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded bg-dark-700 border border-dark-600 text-[10px] text-slate-400 hover:text-cyber-400">
                    {copiedKey === s.key ? <CheckCircle className="w-3 h-3 text-cyber-400" /> : <Copy className="w-3 h-3" />}{copiedKey === s.key ? 'Copié' : 'Copier'}
                  </button>
                </div>
              </div>
            </li>
          ))}
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyber-500/15 border border-cyber-500/30 flex items-center justify-center text-[11px] font-bold text-cyber-300">4</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-300">Faire tourner l'agent en permanence (redémarrage auto)</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Service <span className="font-mono text-slate-400">systemd</span> prêt à copier dans <span className="font-mono text-slate-400">agent/README.md</span> (section « Exécution permanente »).
              </p>
            </div>
          </li>
        </ol>
      </div>
    </div>
  )
}
