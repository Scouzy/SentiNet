import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Mail, Lock, KeyRound, LoaderCircle, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login, verifyMfa } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState('creds') // 'creds' | 'mfa'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [tempToken, setTempToken] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submitCreds = async (e) => {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      const res = await login(email.trim(), password)
      if (res.mfaRequired) { setTempToken(res.tempToken); setStep('mfa') }
      else navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Échec de la connexion')
    } finally { setBusy(false) }
  }

  const submitMfa = async (e) => {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      await verifyMfa(tempToken, code.trim())
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Code incorrect')
    } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-900 bg-grid-pattern px-4">
      <div className="w-full max-w-sm">
        {/* Marque */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-11 h-11 rounded-xl bg-cyber-500/10 border border-cyber-500/30 flex items-center justify-center">
              <Shield className="w-6 h-6 text-cyber-400" />
            </div>
            <div>
              <div className="text-xl font-bold text-white leading-none">
                Senti<span className="text-cyber-400">Net</span>
              </div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 mt-1">Network Detection &amp; Response</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-dark-600 bg-dark-850/80 backdrop-blur-sm p-6 shadow-xl">
          <h1 className="text-base font-semibold text-white mb-1">
            {step === 'creds' ? 'Connexion' : 'Vérification en deux étapes'}
          </h1>
          <p className="text-xs text-slate-500 mb-5">
            {step === 'creds'
              ? 'Accès réservé au personnel autorisé.'
              : 'Saisissez le code à 6 chiffres de votre application d\'authentification.'}
          </p>

          {error && (
            <div className="flex items-start gap-2 mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {step === 'creds' ? (
            <form onSubmit={submitCreds} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Adresse e-mail</label>
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-dark-700 border border-dark-600 focus-within:border-cyber-500/40 transition-colors">
                  <Mail className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <input
                    type="email" required autoFocus autoComplete="username"
                    value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="prenom.nom@exemple.fr"
                    className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Mot de passe</label>
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-dark-700 border border-dark-600 focus-within:border-cyber-500/40 transition-colors">
                  <Lock className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <input
                    type="password" required autoComplete="current-password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 outline-none"
                  />
                </div>
              </div>
              <button
                type="submit" disabled={busy}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-cyber-600 hover:bg-cyber-500 disabled:opacity-60 text-white text-sm font-medium transition-colors"
              >
                {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                Se connecter
              </button>
            </form>
          ) : (
            <form onSubmit={submitMfa} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Code d'authentification (TOTP)</label>
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-dark-700 border border-dark-600 focus-within:border-cyber-500/40 transition-colors">
                  <KeyRound className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <input
                    type="text" required autoFocus inputMode="numeric" maxLength={6}
                    value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="flex-1 bg-transparent text-lg tracking-[0.3em] font-mono text-slate-200 placeholder-slate-600 outline-none"
                  />
                </div>
              </div>
              <button
                type="submit" disabled={busy || code.length !== 6}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-cyber-600 hover:bg-cyber-500 disabled:opacity-60 text-white text-sm font-medium transition-colors"
              >
                {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                Vérifier
              </button>
              <button
                type="button" onClick={() => { setStep('creds'); setCode(''); setError('') }}
                className="w-full text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                ← Revenir à la connexion
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-[10px] text-slate-600 mt-6">
          SentiNet · Accès surveillé et journalisé (piste d'audit inaltérable)
        </p>
      </div>
    </div>
  )
}
