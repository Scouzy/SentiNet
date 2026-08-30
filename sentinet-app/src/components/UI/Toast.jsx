import React, { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev.slice(-4), { id, message, type }])
    if (duration > 0) setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
    return id
  }, [])

  const dismiss = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), [])

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => <ToastItem key={t.id} {...t} onDismiss={() => dismiss(t.id)} />)}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast doit être utilisé dans ToastProvider')
  return ctx
}

const CONFIG = {
  success: { icon: CheckCircle, color: 'text-cyber-400', border: 'border-cyber-500/30', bar: 'bg-cyber-500' },
  error:   { icon: XCircle,     color: 'text-red-400',   border: 'border-red-500/30',   bar: 'bg-red-500'   },
  warning: { icon: AlertTriangle, color: 'text-yellow-400', border: 'border-yellow-500/30', bar: 'bg-yellow-500' },
  info:    { icon: Info,         color: 'text-blue-400',  border: 'border-blue-500/30',  bar: 'bg-blue-500'  },
}

function ToastItem({ message, type = 'info', onDismiss }) {
  const { icon: Icon, color, border, bar } = CONFIG[type] || CONFIG.info
  return (
    <div className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border bg-dark-800 shadow-2xl max-w-sm min-w-64 relative overflow-hidden ${border}`}>
      <div className={`absolute bottom-0 left-0 h-0.5 w-full ${bar} opacity-50`} />
      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${color}`} />
      <span className="text-sm text-slate-200 flex-1 leading-snug">{message}</span>
      <button onClick={onDismiss} className="text-slate-500 hover:text-slate-300 flex-shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
