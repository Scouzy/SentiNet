import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Search, RefreshCw, Wifi, Clock, Menu } from 'lucide-react'

export default function Header({ title, subtitle, onMenuToggle }) {
  const [time, setTime] = useState(new Date())
  const [isLive, setIsLive] = useState(true)
  const [searchVal, setSearchVal] = useState('')
  const searchRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
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
        <Wifi className="w-3.5 h-3.5 text-cyber-400" />
        <span className="text-xs text-slate-400 font-mono">6/6 sondes</span>
      </div>

      {/* Clock */}
      <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400">
        <Clock className="w-3 h-3" />
        <span className="font-mono">{timeStr}</span>
      </div>

      {/* Notifications */}
      <button className="relative p-2 rounded-lg hover:bg-dark-700 text-slate-400 hover:text-slate-200 transition-colors">
        <Bell className="w-4 h-4" />
        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 border border-dark-850" />
      </button>
    </header>
  )
}
