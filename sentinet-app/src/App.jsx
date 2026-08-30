import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { ToastProvider } from './components/UI/Toast'
import Sidebar from './components/Layout/Sidebar'
import Header from './components/Layout/Header'
import Dashboard from './pages/Dashboard'
import Alerts from './pages/Alerts'
import Network from './pages/Network'
import Traffic from './pages/Traffic'
import Detection from './pages/Detection'
import Response from './pages/Response'
import ThreatIntel from './pages/ThreatIntel'
import Reports from './pages/Reports'
import Admin from './pages/Admin'

const routes = [
  { path: '/', element: <Dashboard />, title: 'Dashboard', subtitle: 'Vue d\'ensemble temps réel' },
  { path: '/alerts', element: <Alerts />, title: 'Alertes & Incidents', subtitle: 'Gestion et investigation des alertes' },
  { path: '/network', element: <Network />, title: 'Supervision réseau', subtitle: 'Observabilité et métriques de trafic' },
  { path: '/traffic', element: <Traffic />, title: 'Traffic Monitor', subtitle: 'Trafic entrant / sortant par protocole — temps réel' },
  { path: '/detection', element: <Detection />, title: 'Détection & Menaces', subtitle: 'Règles, anomalies et couverture MITRE ATT&CK' },
  { path: '/response', element: <Response />, title: 'Réponse & Remédiation', subtitle: 'Playbooks SOAR et actions de confinement' },
  { path: '/threat-intel', element: <ThreatIntel />, title: 'Threat Intelligence', subtitle: 'Renseignement et indicateurs de compromission' },
  { path: '/reports', element: <Reports />, title: 'Rapports', subtitle: 'KPI, conformité et exports' },
  { path: '/admin', element: <Admin />, title: 'Administration', subtitle: 'Utilisateurs, sondes et paramètres système' },
]

function AppContent() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  const location = useLocation()

  useEffect(() => {
    const handler = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (!mobile) setMobileOpen(false)
    }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  const currentRoute = routes.find(r =>
    r.path === '/' ? location.pathname === '/' : location.pathname.startsWith(r.path)
  ) || routes[0]

  const marginLeft = isMobile ? 0 : (sidebarCollapsed ? 64 : 240)

  return (
    <div className="flex min-h-screen bg-dark-900 bg-grid-pattern">
      {/* Backdrop mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-dark-900/75 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(p => !p)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div
        className="flex-1 flex flex-col min-h-screen transition-all duration-300"
        style={{ marginLeft }}
      >
        <Header
          title={currentRoute.title}
          subtitle={currentRoute.subtitle}
          onMenuToggle={() => setMobileOpen(p => !p)}
        />
        <main className="flex-1 overflow-auto">
          <Routes>
            {routes.map(({ path, element }) => (
              <Route key={path} path={path} element={element} />
            ))}
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ToastProvider>
  )
}
