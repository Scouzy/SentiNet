import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api, setToken, getToken } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Vérifie le jeton existant au démarrage
  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!getToken()) { setLoading(false); return }
      try {
        const { user } = await api.me()
        if (alive) setUser(user)
      } catch {
        setToken(null)
        if (alive) setUser(null)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  // Déconnexion forcée si le backend renvoie 401 (jeton expiré/invalide)
  useEffect(() => {
    const onUnauth = () => setUser(null)
    window.addEventListener('sentinet-unauthorized', onUnauth)
    return () => window.removeEventListener('sentinet-unauthorized', onUnauth)
  }, [])

  // Étape 1 : email + mot de passe. Renvoie { mfaRequired, tempToken } si MFA.
  const login = useCallback(async (email, password) => {
    const res = await api.login(email, password)
    if (res.mfaRequired) return { mfaRequired: true, tempToken: res.tempToken }
    setToken(res.token)
    setUser(res.user)
    return { mfaRequired: false }
  }, [])

  // Étape 2 : validation du code TOTP
  const verifyMfa = useCallback(async (tempToken, code) => {
    const res = await api.mfaLogin(tempToken, code)
    setToken(res.token)
    setUser(res.user)
    return res.user
  }, [])

  const logout = useCallback(async () => {
    try { await api.logout() } catch {}
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyMfa, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans un AuthProvider')
  return ctx
}
