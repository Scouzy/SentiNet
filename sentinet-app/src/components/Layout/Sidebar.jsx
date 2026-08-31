import React, { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import {
  LayoutDashboard, ShieldAlert, Network, Radar, Zap,
  Globe, FileBarChart, Settings, ChevronRight, Activity, BarChart2, Server
} from 'lucide-react'
import clsx from 'clsx'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/alerts', icon: ShieldAlert, label: 'Alertes & Incidents' },
  { to: '/network', icon: Network, label: 'Supervision réseau' },
  { to: '/sensors', icon: Server, label: 'Sondes & Agents' },
  { to: '/traffic', icon: BarChart2, label: 'Traffic Monitor' },
  { to: '/detection', icon: Radar, label: 'Détection & Menaces' },
  { to: '/response', icon: Zap, label: 'Réponse & Remédiation' },
  { to: '/threat-intel', icon: Globe, label: 'Threat Intelligence' },
  { to: '/reports', icon: FileBarChart, label: 'Rapports' },
  { to: '/admin', icon: Settings, label: 'Administration' },
]

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }) {
  const location = useLocation()
  const { user: currentUser } = useAuth() // utilisateur réellement connecté
  const [sysInfo, setSysInfo] = useState(null)

  useEffect(() => {
    const loadSys = () => api.getSystemInfo().then(setSysInfo).catch(() => {})
    loadSys()
    const id = setInterval(loadSys, 15000)
    return () => clearInterval(id)
  }, [])

  // Score de santé : 100% = système au repos, diminue si CPU ou RAM sous stress
  const healthScore = sysInfo ? Math.max(0, Math.min(100, Math.round(
    100
    - (sysInfo.cpu > 90 ? 40 : sysInfo.cpu > 80 ? 25 : sysInfo.cpu > 60 ? 10 : 0)
    - (sysInfo.mem > 90 ? 35 : sysInfo.mem > 80 ? 20 : sysInfo.mem > 70 ? 8 : 0)
  ))) : null
  const healthColor = healthScore === null ? 'bg-cyber-500' : healthScore >= 80 ? 'bg-cyber-500' : healthScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'
  const healthLabel = healthScore === null ? '—' : `${healthScore}%`

  // Sur mobile, toujours expanded. Sur desktop, respecter collapsed.
  const isExpanded = mobileOpen || !collapsed

  return (
    <aside
      className={clsx(
        'fixed top-0 left-0 h-screen flex flex-col border-r border-dark-600 transition-all duration-300 z-30 overflow-hidden',
        // Largeur : mobile = 288px, desktop selon collapsed
        'w-72',
        collapsed ? 'md:w-16' : 'md:w-60',
        // Position : masqué à gauche sur mobile si fermé
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}
      style={{ background: 'linear-gradient(180deg, #080f1f 0%, #050914 100%)' }}
    >
      {/* Logo */}
      <div className={clsx(
        'flex items-center border-b border-dark-600 py-4',
        isExpanded ? 'px-4 gap-2' : 'px-3 justify-center'
      )}>
        {isExpanded ? (
          <>
            <img
              src="/sentinet-logo-primary.svg"
              alt="SentiNet"
              className="h-9 flex-1 min-w-0"
              style={{ objectFit: 'contain', objectPosition: 'left center' }}
              draggable={false}
            />
            {/* Desktop : bouton collapse / Mobile : bouton fermeture */}
            <button
              onClick={mobileOpen ? onMobileClose : onToggle}
              className="flex-shrink-0 p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-dark-700 transition-colors"
              aria-label={mobileOpen ? 'Fermer le menu' : 'Réduire'}
            >
              <ChevronRight className={clsx(
                'w-4 h-4 transition-transform',
                mobileOpen ? 'rotate-180' : ''
              )} />
            </button>
          </>
        ) : (
          <button onClick={onToggle} title="Ouvrir le menu" className="relative flex-shrink-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-dark-700 to-dark-800 border border-cyber-500/30 overflow-hidden flex items-center justify-center">
              <img
                src="/sentinet-icon.svg"
                alt=""
                aria-hidden="true"
                className="w-7 h-7"
                draggable={false}
              />
            </div>
            <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-cyber-500 border-2 border-dark-850 animate-pulse" />
          </button>
        )}
      </div>

      {/* System Status */}
      {isExpanded && (
        <div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-dark-700/50 border border-dark-600">
          <div className="flex items-center gap-2">
            <Activity className="w-3 h-3 text-cyber-400" />
            <span className="text-[11px] text-slate-400">Système</span>
            <span className="ml-auto text-[11px] font-medium text-cyber-400">Opérationnel</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1 rounded-full bg-dark-600 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${healthColor}`} style={{ width: `${healthScore ?? 0}%` }} />
            </div>
            <span className="text-[10px] text-slate-500 font-mono">{healthLabel}</span>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label, end }) => {
          const isActive = end
            ? location.pathname === to
            : location.pathname.startsWith(to)

          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={!isExpanded ? label : undefined}
              className={clsx(
                'flex items-center rounded-lg text-sm font-medium transition-all duration-150 group',
                isExpanded ? 'px-3 py-2.5 gap-3' : 'px-2 py-2.5 justify-center',
                isActive
                  ? 'text-cyber-400 bg-cyber-500/10 border border-cyber-500/20'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-dark-700 border border-transparent'
              )}
            >
              <Icon className={clsx('flex-shrink-0', isExpanded ? 'w-4 h-4' : 'w-5 h-5')} />
              {isExpanded && <span className="truncate">{label}</span>}
              {isExpanded && isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-cyber-400" />
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* Footer — utilisateur connecté */}
      <div className={clsx('px-3 py-3 border-t border-dark-600', !isExpanded && 'flex justify-center')}>
        {(() => {
          const initials = currentUser
            ? currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
            : '??'
          return isExpanded ? (
            <div className="flex items-center gap-3">
              <div className="relative flex-shrink-0 w-7 h-7 rounded-full bg-cyber-600/20 border border-cyber-500/30 flex items-center justify-center text-xs font-bold text-cyber-400">
                {initials}
                {currentUser?.mfa && (
                  <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cyber-500 border border-dark-850" title="MFA actif" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-200 truncate">
                  {currentUser ? currentUser.name : '—'}
                </p>
                <p className="text-[10px] text-slate-500 truncate">
                  {currentUser ? currentUser.role : ''}
                </p>
              </div>
            </div>
          ) : (
            <div className="relative w-7 h-7 rounded-full bg-cyber-600/20 border border-cyber-500/30 flex items-center justify-center text-xs font-bold text-cyber-400">
              {initials}
              {currentUser?.mfa && (
                <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cyber-500 border border-dark-850" />
              )}
            </div>
          )
        })()}
      </div>
    </aside>
  )
}
