import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Search, RefreshCw, Wifi, Clock, Menu, LogOut } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../services/api'

const SEV = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#3b82f6' }
const timeAgo = (ts) => {
  const diff = Math.round((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}j`
}

export default function Header({ title, subtitle, onMenuToggle }) {
  const { user, logout } = useAuth()
  const [time, setTime] = useState(new Date())
  const [sensors, setSensors] = useState({ online: 0, total: 0 })
  const [isLive, setIsLive] = useState(true)
  const [searchVal, setSearchVal] = useState('')
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifs, setNotifs] = useState([])
  const searchRef = useRef(null)
  const notifRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const load = () => api.getSensors()
      .then(d => setSensors({ online: d.online || 0, total: d.total || 0 }))
      .catch(() => {})
    load()
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [])

  // Notifications : dernières alertes
  useEffect(() => {
    const load = () => api.getAlerts().then(d => setNotifs((d.alerts || []).slice(0, 8))).catch(() => {})
    load()
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [])

  // Fermeture du panneau au clic extérieur
  useEffect(() => {
    const onClick = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
      if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setSearchVal('')
        searchRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleSearch = (e) => {
    e.preventDefault()
    const q = searchVal.trim()
    if (!q) return
    navigate(`/alerts?q=${encodeURIComponent(q)}`)
    setSearchVal('')
    searchRef.current?.blur()
  }

  const fmt = (d) => d.toString().padStart(2, '0')
  const timeStr = `${fmt(time.getHours())}:${fmt(time.getMinutes())}:${fmt(time.getSeconds())}`
  const dateStr = time.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <header className="h-14 flex items-center gap-3 px-4 md:px-6 border-b border-dark-600 bg-dark-850/80 backdrop-blur-sm sticky top-0 z-20">
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuToggle}
        className="md:hidden flex-shrink-0 p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-700 transition-colors"
        aria-label="Menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Title */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <h1 className="text-base font-semibold text-white truncate">{title}</h1>
          {subtitle && <span className="text-xs text-slate-500 hidden md:block">{subtitle}</span>}
        </div>
      </div>

      {/* Search */}
      <form
        onSubmit={handleSearch}
        className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-700 border border-dark-600 w-56 focus-within:border-cyber-500/40 transition-colors"
      >
        <Search className="w-3.5 h-3.5 flex-shrink-0 text-slate-500" />
        <input
          ref={searchRef}
          type="text"
          value={searchVal}
          onChange={e => setSearchVal(e.target.value)}
          placeholder="Rechercher..."
          className="flex-1 bg-transparent text-xs text-slate-200 placeholder-slate-600 outline-none min-w-0"
        />
        {searchVal ? (
          <button type="submit" className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-cyber-600/20 text-cyber-400 font-mono hover:bg-cyber-600/30 transition-colors">↵</button>
        ) : (
          <kbd className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-dark-600 text-slate-500 font-mono">⌘K</kbd>
        )}
      </form>

      {/* Live Toggle */}
      <button
        onClick={() => setIsLive(p => !p)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
          isLive
            ? 'bg-cyber-500/10 border-cyber-500/30 text-cyber-400'
            : 'bg-dark-700 border-dark-600 text-slate-400'
        }`}
      >
        {isLive ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-cyber-400 animate-pulse" />
            LIVE
          </>
        ) : (
          <>
            <RefreshCw className="w-3 h-3" />
            PAUSE
          </>
        )}
      </button>

      {/* Network Status */}
      <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-700 border border-dark-600">
        <Wifi className={`w-3.5 h-3.5 ${sensors.online === sensors.total && sensors.total > 0 ? 'text-cyber-400' : 'text-yellow-400'}`} />
        <span className="text-xs text-slate-400 font-mono">{sensors.online}/{sensors.total} sondes</span>
      </div>

      {/* Clock */}
      <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400">
        <Clock className="w-3 h-3" />
        <span className="font-mono">{timeStr}</span>
      </div>

      {/* Notifications */}
      <div className="relative" ref={notifRef}>
        <button
          onClick={() => setNotifOpen(o => !o)}
          aria-label="Notifications"
          className="relative p-2 rounded-lg hover:bg-dark-700 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <Bell className="w-4 h-4" />
          {notifs.some(a => a.status === 'open') && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 border border-dark-850" />
          )}
        </button>
        {notifOpen && (
          <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-dark-600 bg-dark-800 shadow-xl z-50">
            <div className="px-4 py-2.5 border-b border-dark-600 flex items-center justify-between sticky top-0 bg-dark-800">
              <span className="text-xs font-semibold text-white">Notifications</span>
              <span className="text-[10px] text-slate-500">{notifs.length} récente(s)</span>
            </div>
            {notifs.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-500">Aucune alerte récente</div>
            ) : (
              <div className="divide-y divide-dark-600/50">
                {notifs.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => { setNotifOpen(false); navigate('/alerts') }}
                    className="w-full text-left px-4 py-2.5 hover:bg-dark-750 transition-colors flex items-start gap-2"
                  >
                    <span className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: SEV[a.severity] || '#475569' }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-200 truncate">{a.type}</p>
                      <p className="text-[10px] text-slate-500 truncate font-mono">{a.source} · {a.segment || 'LOCAL'}</p>
                    </div>
                    <span className="text-[10px] text-slate-600 flex-shrink-0">{timeAgo(a.timestamp)}</span>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => { setNotifOpen(false); navigate('/alerts') }}
              className="w-full px-4 py-2.5 text-xs text-cyber-400 hover:text-cyber-300 hover:bg-dark-750 border-t border-dark-600 transition-colors sticky bottom-0 bg-dark-800"
            >
              Voir toutes les alertes →
            </button>
          </div>
        )}
      </div>

      {/* Utilisateur connecté + déconnexion */}
      {user && (
        <div className="flex items-center gap-2 pl-2 ml-1 border-l border-dark-600">
          <div className="hidden md:block text-right leading-tight">
            <div className="text-xs font-medium text-slate-200 truncate max-w-[140px]">{user.name}</div>
            <div className="text-[10px] text-slate-500 truncate max-w-[140px]">{user.role}</div>
          </div>
          <div className="w-8 h-8 rounded-full bg-cyber-500/15 border border-cyber-500/30 flex items-center justify-center text-[11px] font-semibold text-cyber-300">
            {(user.name || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <button
            onClick={logout}
            title="Se déconnecter"
            aria-label="Se déconnecter"
            className="p-2 rounded-lg hover:bg-dark-700 text-slate-400 hover:text-red-300 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      )}
    </header>
  )
}
