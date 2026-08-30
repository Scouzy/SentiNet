import React, { useState, useEffect, useCallback } from 'react'
import {
  Users, Shield, Server, Settings, CheckCircle, XCircle,
  AlertTriangle, Key, Lock, RefreshCw, Plus, Edit, Trash2,
  Activity, Database, HardDrive, Cpu, Loader2, Smartphone, Copy, ShieldCheck, ShieldOff
} from 'lucide-react'
import { api } from '../services/api'
import { useToast } from '../components/UI/Toast'

const roleColors = {
  'Analyste SOC N1': 'text-blue-400 bg-blue-500/10 border-blue-500/25',
  'Analyste SOC N2': 'text-blue-400 bg-blue-500/10 border-blue-500/25',
  'Ingénieur Sécurité N3': 'text-purple-400 bg-purple-500/10 border-purple-500/25',
  'Admin Réseau': 'text-cyber-400 bg-cyber-500/10 border-cyber-500/25',
  'RSSI': 'text-orange-400 bg-orange-500/10 border-orange-500/25',
  'Admin Plateforme': 'text-red-400 bg-red-500/10 border-red-500/25',
}

// ── Modal d'enrôlement TOTP ───────────────────────────────────────────────────
function MfaModal({ user, onDone, onClose }) {
  const { toast } = useToast()
  const [step, setStep] = useState('loading')   // loading | scan | verify | done | disable
  const [qr, setQr] = useState(null)
  const [secret, setSecret] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  // Si l'utilisateur a déjà MFA actif → proposer de désactiver
  useEffect(() => {
    if (user.mfa) { setStep('disable'); return }
    setBusy(true)
    api.mfaSetup(String(user.id))
      .then(d => { setQr(d.qrDataUrl); setSecret(d.secret); setStep('scan') })
      .catch(e => { toast(e.message, 'error'); onClose() })
      .finally(() => setBusy(false))
  }, [])

  const handleVerify = async () => {
    if (token.length !== 6) { setError('Entrez les 6 chiffres affichés par votre application.'); return }
    setBusy(true); setError('')
    try {
      const d = await api.mfaVerify(String(user.id), token)
      onDone(d.user)
      setStep('done')
    } catch (e) {
      setError(e.message || 'Code invalide')
    } finally { setBusy(false) }
  }

  const handleDisable = async () => {
    setBusy(true)
    try {
      const d = await api.mfaDisable(String(user.id))
      onDone(d.user)
      toast('MFA désactivé', 'info')
      onClose()
    } catch (e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }

  const copySecret = () => {
    navigator.clipboard.writeText(secret).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-dark-900/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card p-6 w-full max-w-sm shadow-2xl space-y-4">

        {/* Loading */}
        {step === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="w-8 h-8 text-cyber-400 animate-spin" />
            <p className="text-sm text-slate-400">Génération du secret TOTP…</p>
          </div>
        )}

        {/* QR code scan */}
        {step === 'scan' && (
          <>
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-cyber-400" />
              <h2 className="text-sm font-semibold text-white">Configurer l'authentificateur</h2>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Scannez ce QR code avec <strong className="text-slate-200">Google Authenticator</strong>,{' '}
              <strong className="text-slate-200">Authy</strong> ou toute app TOTP compatible.
            </p>

            {qr && (
              <div className="flex justify-center">
                <img src={qr} alt="QR code MFA" className="rounded-lg border border-dark-600 bg-white p-1" width={200} />
              </div>
            )}

            {/* Clé manuelle */}
            <div className="rounded-lg bg-dark-700 border border-dark-600 px-3 py-2">
              <p className="text-[10px] text-slate-500 mb-1">Ou saisir la clé manuellement :</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono text-cyber-400 break-all">{secret}</code>
                <button onClick={copySecret} className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0">
                  {copied ? <CheckCircle className="w-3.5 h-3.5 text-cyber-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <button onClick={() => setStep('verify')}
              className="w-full py-2 rounded-lg bg-cyber-600/20 border border-cyber-500/30 text-cyber-400 text-sm font-medium hover:bg-cyber-600/30 transition-colors">
              J'ai scanné le QR code →
            </button>
          </>
        )}

        {/* Code verification */}
        {step === 'verify' && (
          <>
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-cyber-400" />
              <h2 className="text-sm font-semibold text-white">Vérification du code</h2>
            </div>
            <p className="text-xs text-slate-400">
              Entrez le code à 6 chiffres affiché dans votre application d'authentification.
            </p>
            <input
              type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoFocus
              value={token} onChange={e => { setToken(e.target.value.replace(/\D/g, '')); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleVerify()}
              placeholder="000000"
              className="w-full px-4 py-3 rounded-lg bg-dark-700 border border-dark-600 text-2xl font-mono text-center text-white tracking-[0.5em] outline-none focus:border-cyber-500/60 placeholder:tracking-normal placeholder:text-slate-600"
            />
            {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setStep('scan')} className="flex-1 py-2 rounded-lg bg-dark-700 border border-dark-600 text-slate-400 text-sm hover:text-slate-200 transition-colors">
                ← Retour
              </button>
              <button onClick={handleVerify} disabled={busy || token.length !== 6}
                className="flex-1 py-2 rounded-lg bg-cyber-600/20 border border-cyber-500/30 text-cyber-400 text-sm font-medium hover:bg-cyber-600/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Valider
              </button>
            </div>
          </>
        )}

        {/* Success */}
        {step === 'done' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-12 h-12 rounded-full bg-cyber-500/20 border border-cyber-500/30 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-cyber-400" />
            </div>
            <h2 className="text-sm font-semibold text-white">MFA activé !</h2>
            <p className="text-xs text-slate-400 text-center">
              Votre compte est maintenant protégé par l'authentification à deux facteurs.
            </p>
            <button onClick={onClose} className="w-full py-2 rounded-lg bg-cyber-600/20 border border-cyber-500/30 text-cyber-400 text-sm font-medium hover:bg-cyber-600/30 transition-colors">
              Fermer
            </button>
          </div>
        )}

        {/* Disable MFA */}
        {step === 'disable' && (
          <>
            <div className="flex items-center gap-2">
              <ShieldOff className="w-4 h-4 text-red-400" />
              <h2 className="text-sm font-semibold text-white">MFA déjà activé</h2>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              L'authentification MFA est active sur ce compte. Voulez-vous la <strong className="text-red-400">désactiver</strong> ?
              Cette action réduira le niveau de sécurité du compte.
            </p>
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-dark-700 border border-dark-600 text-slate-400 text-sm hover:text-slate-200 transition-colors">
                Annuler
              </button>
              <button onClick={handleDisable} disabled={busy}
                className="flex-1 py-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/25 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Désactiver
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function UserModal({ user, onSave, onClose }) {
  const [form, setForm] = useState(user || { name: '', email: '', role: 'Analyste SOC N1', status: 'active', mfa: false })
  const { toast } = useToast()
  const isNew = !user

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      let saved
      if (isNew) {
        const d = await api.createUser(form)
        saved = d.user
      } else {
        const d = await api.updateUser(String(user.id), form)
        saved = d.user
      }
      onSave(saved, isNew)
      toast(isNew ? 'Utilisateur créé' : 'Utilisateur mis à jour', 'success')
    } catch (e) {
      toast(e.message || 'Erreur', 'error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-dark-900/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-sm font-semibold text-white mb-4">{isNew ? 'Nouvel utilisateur' : 'Modifier l\'utilisateur'}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          {[['Nom complet', 'name', 'text'], ['Email', 'email', 'email']].map(([label, key, type]) => (
            <div key={key}>
              <label className="text-xs text-slate-400 block mb-1">{label}</label>
              <input type={type} required value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-sm text-slate-200 outline-none focus:border-cyber-500/50" />
            </div>
          ))}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Rôle</label>
            <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-sm text-slate-200 outline-none">
              {['Analyste SOC N1','Analyste SOC N2','Ingénieur Sécurité N3','Admin Réseau','RSSI','Admin Plateforme'].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          {/* MFA toggle */}
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-dark-700 border border-dark-600">
            <div>
              <p className="text-xs font-medium text-slate-200">Authentification MFA</p>
              <p className="text-[10px] text-slate-500 mt-0.5">TOTP / Clé d'accès</p>
            </div>
            <button
              type="button"
              onClick={() => setForm(p => ({ ...p, mfa: !p.mfa }))}
              className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${form.mfa ? 'bg-cyber-500' : 'bg-dark-500 border border-dark-400'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.mfa ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {!isNew && (
            <div>
              <label className="text-xs text-slate-400 block mb-1">Statut du compte</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-sm text-slate-200 outline-none">
                <option value="active">Actif</option>
                <option value="inactive">Inactif</option>
                <option value="suspended">Suspendu</option>
              </select>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button type="submit" className="flex-1 py-2 rounded-lg bg-cyber-600/20 border border-cyber-500/30 text-cyber-400 text-sm font-medium hover:bg-cyber-600/30 transition-colors">
              {isNew ? 'Créer' : 'Sauvegarder'}
            </button>
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg bg-dark-700 border border-dark-600 text-slate-400 text-sm hover:text-slate-200 transition-colors">
              Annuler
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Admin() {
  const [activeTab, setActiveTab] = useState('users')
  const [users, setUsers] = useState([])
  const [editingUser, setEditingUser] = useState(null)
  const [showNewUser, setShowNewUser] = useState(false)
  const [loadingMfa, setLoadingMfa] = useState(false)
  const [loadingDelete, setLoadingDelete] = useState(null)
  const [mfaUser, setMfaUser] = useState(null)
  const [ifaceCount, setIfaceCount] = useState('—')
  const [sysInfo, setSysInfo] = useState(null)
  const [ntpStatus, setNtpStatus] = useState(null)
  const [alertStats, setAlertStats] = useState(null)
  const { toast } = useToast()

  useEffect(() => {
    api.getInterfaces().then(d => setIfaceCount((d.ifaces || []).filter(i => !i.internal).length)).catch(() => {})
    const loadSys = () => Promise.allSettled([
      api.getSystemInfo(),
      api.getNtpStatus(),
      api.getAlertStats(),
    ]).then(([sys, ntp, stats]) => {
      if (sys.status === 'fulfilled') setSysInfo(sys.value)
      if (ntp.status === 'fulfilled') setNtpStatus(ntp.value)
      if (stats.status === 'fulfilled') setAlertStats(stats.value)
    })
    loadSys()
    const id = setInterval(loadSys, 15000)
    return () => clearInterval(id)
  }, [])

  const systemHealth = sysInfo ? [
    { name: 'API Backend (Node.js)', status: 'online', latency: '—', load: Math.round(sysInfo.cpu) },
    { name: 'CPU système', status: sysInfo.cpu > 90 ? 'warning' : 'online', latency: `${sysInfo.cpuCores} cœurs`, load: Math.round(sysInfo.cpu) },
    { name: 'Mémoire RAM', status: sysInfo.mem > 90 ? 'warning' : 'online', latency: `${(sysInfo.freeMem / 1024 / 1024 / 1024).toFixed(1)} GB libre`, load: Math.round(sysInfo.mem) },
    { name: 'Synchronisation NTP', status: ntpStatus?.synced ? 'online' : 'warning', latency: ntpStatus?.source || '—', load: ntpStatus?.synced ? 5 : 100 },
    { name: 'Moteur de détection', status: 'online', latency: '—', load: Math.min(Math.round(sysInfo.cpu * 0.6), 100) },
    { name: 'Interfaces réseau', status: ifaceCount > 0 ? 'online' : 'warning', latency: `${ifaceCount} active(s)`, load: 10 },
  ] : []

  useEffect(() => {
    api.getUsers().then(d => d.users && setUsers(d.users)).catch(() => {})
  }, [])

  const handleForceMfa = async () => {
    setLoadingMfa(true)
    try {
      const d = await api.forceMfa()
      setUsers(d.users)
      toast('MFA activé pour tous les utilisateurs', 'success')
    } catch (e) {
      toast(e.message || 'Erreur', 'error')
    } finally {
      setLoadingMfa(false)
    }
  }

  const handleDelete = async (user) => {
    if (!confirm(`Supprimer ${user.name} ?`)) return
    setLoadingDelete(user.id)
    try {
      await api.deleteUser(String(user.id))
      setUsers(prev => prev.filter(u => u.id !== user.id))
      toast(`${user.name} supprimé`, 'success')
    } catch (e) {
      toast(e.message || 'Erreur', 'error')
    } finally {
      setLoadingDelete(null)
    }
  }

  const handleToggleStatus = async (user) => {
    const newStatus = user.status === 'active' ? 'inactive' : 'active'
    try {
      const d = await api.updateUser(String(user.id), { status: newStatus })
      setUsers(prev => prev.map(u => u.id === user.id ? d.user : u))
      toast(`${user.name} : ${newStatus === 'active' ? 'activé' : 'désactivé'}`, 'info')
    } catch (e) {
      toast(e.message || 'Erreur', 'error')
    }
  }

  const handleSaveUser = (saved, isNew) => {
    if (isNew) setUsers(prev => [...prev, saved])
    else setUsers(prev => prev.map(u => u.id === saved.id ? saved : u))
    setEditingUser(null)
    setShowNewUser(false)
  }

  const handleMfaDone = (updatedUser) => {
    setUsers(prev => prev.map(u => u.id === updatedUser.id ? { ...u, mfa: updatedUser.mfa } : u))
  }

  return (
    <div className="p-6 space-y-5">
      {/* System Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Utilisateurs actifs', value: users.filter(u => u.status === 'active').length, icon: Users, color: 'text-cyber-400' },
          { label: 'Interfaces réseau', value: ifaceCount, icon: Server, color: 'text-blue-400' },
          { label: 'Version plateforme', value: '3.2.1', icon: Settings, color: 'text-slate-400', sub: 'Dernière version' },
          { label: 'Stockage utilisé', value: '2.4 TB', icon: Database, color: 'text-orange-400', sub: 'Cap. : 10 TB (24%)' },
        ].map(({ label, value, icon: Icon, color, sub }) => (
          <div key={label} className="card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 mb-1">{label}</p>
                <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
                {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
              </div>
              <Icon className={`w-5 h-5 ${color} opacity-60`} />
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-dark-800 border border-dark-600 rounded-xl p-1">
        {[
          { id: 'users', label: 'Utilisateurs & RBAC' },
          { id: 'system', label: 'Santé système' },
          { id: 'config', label: 'Configuration' },
          { id: 'whitelist', label: 'Liste blanche' },
          { id: 'audit', label: 'Piste d’audit' },
          { id: 'retention', label: 'Rétention & RGPD' },
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

      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-dark-600 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Gestion des utilisateurs — RBAC</h2>
              <button onClick={() => setShowNewUser(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyber-600/20 border border-cyber-500/30 text-cyber-400 text-xs font-medium hover:bg-cyber-600/30 transition-colors">
                <Plus className="w-3.5 h-3.5" />
                Nouvel utilisateur
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-600">
                    {['Utilisateur', 'Rôle', 'Statut', 'MFA', 'Dernière connexion', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-600/50">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-dark-750 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-cyber-600/20 border border-cyber-500/30 flex items-center justify-center text-xs font-bold text-cyber-400">
                            {user.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div>
                            <p className="text-xs font-medium text-slate-200">{user.name}</p>
                            <p className="text-[10px] text-slate-500">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${roleColors[user.role] || 'text-slate-400 bg-dark-700 border-dark-600'}`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${user.status === 'active' ? 'bg-cyber-500' : 'bg-slate-600'}`} />
                          <span className={`text-[10px] font-medium ${user.status === 'active' ? 'text-cyber-400' : 'text-slate-500'}`}>
                            {user.status === 'active' ? 'Actif' : 'Inactif'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {user.mfa ? (
                          <div className="flex items-center gap-1 text-cyber-400">
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span className="text-[10px]">Activé</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-red-400">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span className="text-[10px]">Requis</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-mono text-slate-500">
                          {new Date(user.lastLogin).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => setMfaUser(user)} className={`p-1.5 rounded hover:bg-dark-600 transition-colors ${user.mfa ? 'text-cyber-500 hover:text-cyber-300' : 'text-slate-500 hover:text-yellow-400'}`} title={user.mfa ? 'Gérer MFA' : 'Activer MFA'}>
                            <Smartphone className="w-3 h-3" />
                          </button>
                          <button onClick={() => setEditingUser(user)} className="p-1.5 rounded hover:bg-dark-600 text-slate-500 hover:text-slate-300 transition-colors" title="Modifier">
                            <Edit className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleToggleStatus(user)} className="p-1.5 rounded hover:bg-dark-600 text-slate-500 hover:text-yellow-400 transition-colors" title={user.status === 'active' ? 'Désactiver' : 'Activer'}>
                            {user.status === 'active' ? <Lock className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                          </button>
                          <button onClick={() => handleDelete(user)} disabled={loadingDelete === user.id} className="p-1.5 rounded hover:bg-dark-600 text-slate-500 hover:text-red-400 transition-colors disabled:opacity-50" title="Supprimer">
                            {loadingDelete === user.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* MFA Warning */}
          {users.some(u => !u.mfa && u.status === 'active') && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-sm text-red-300">
                {users.filter(u => !u.mfa && u.status === 'active').length} utilisateur(s) sans MFA actif — Non conforme avec la politique de sécurité (EF-903)
              </span>
              <button onClick={handleForceMfa} disabled={loadingMfa} className="ml-auto flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 font-medium border border-red-500/30 px-3 py-1 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50">
                {loadingMfa ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Forcer MFA
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'system' && (
        <div className="space-y-4">
          {!sysInfo && (
            <div className="card px-5 py-10 text-center text-slate-500 text-sm">Chargement des métriques système…</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {systemHealth.map((component) => (
              <div key={component.name} className="card p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-xs font-semibold text-white">{component.name}</h3>
                    {component.latency !== '—' && (
                      <p className="text-[10px] text-slate-500 mt-0.5">Latence : {component.latency}</p>
                    )}
                  </div>
                  <div className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border ${
                    component.status === 'online'
                      ? 'bg-cyber-500/15 text-cyber-400 border-cyber-500/25'
                      : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25'
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      component.status === 'online' ? 'bg-cyber-500' : 'bg-yellow-500 animate-pulse'
                    }`} />
                    {component.status === 'online' ? 'En ligne' : 'Avertissement'}
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-slate-500">Charge</span>
                    <span className={`font-mono font-semibold ${
                      component.load > 85 ? 'text-red-400' : component.load > 70 ? 'text-yellow-400' : 'text-cyber-400'
                    }`}>{component.load}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-dark-600 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        component.load > 85 ? 'bg-red-500' : component.load > 70 ? 'bg-yellow-500' : 'bg-cyber-500'
                      }`}
                      style={{ width: `${component.load}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Ressources système</h3>
              <div className="space-y-4">
                {[
                  { label: 'CPU global', used: sysInfo?.cpu ?? 0, total: `${sysInfo?.cpuCores ?? '?'} cœurs`, icon: Cpu },
                  { label: 'Mémoire RAM', used: sysInfo?.mem ?? 0, total: `${sysInfo ? ((sysInfo.totalMem - sysInfo.freeMem) / 1024 / 1024 / 1024).toFixed(1) + ' / ' + (sysInfo.totalMem / 1024 / 1024 / 1024).toFixed(1) + ' GB' : '—'}`, icon: Activity },
                  { label: 'Interfaces actives', used: ifaceCount > 0 ? Math.min(ifaceCount * 10, 100) : 0, total: `${ifaceCount} interface(s)`, icon: HardDrive },
                  { label: 'Alertes ouvertes', used: alertStats?.total > 0 ? Math.round((alertStats?.open ?? 0) / alertStats.total * 100) : 0, total: `${alertStats?.open ?? 0} / ${alertStats?.total ?? 0}`, icon: Database },
                ].map(({ label, used, total, icon: Icon }) => (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <Icon className="w-3 h-3 text-slate-500" />
                        <span className="text-xs text-slate-400">{label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-mono font-semibold ${
                          used > 85 ? 'text-red-400' : used > 70 ? 'text-yellow-400' : 'text-cyber-400'
                        }`}>{used}%</span>
                        <span className="text-[10px] text-slate-600">/ {total}</span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-dark-600 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          used > 85 ? 'bg-red-500' : used > 70 ? 'bg-yellow-500' : 'bg-cyber-500'
                        }`}
                        style={{ width: `${used}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Politique de rétention (RGPD)</h3>
              <div className="space-y-3">
                {[
                  { type: 'Captures complètes (PCAP)', retention: '7 jours', usage: '2.1 TB', color: '#3b82f6' },
                  { type: 'Métadonnées de flux', retention: '90 jours', usage: '180 GB', color: '#8b5cf6' },
                  { type: 'Journaux d\'alertes', retention: '1 an', usage: '42 GB', color: '#00c98d' },
                  { type: 'Piste d\'audit', retention: '5 ans', usage: '8 GB', color: '#f59e0b' },
                  { type: 'Rapports de conformité', retention: '10 ans', usage: '2 GB', color: '#ec4899' },
                ].map(({ type, retention, usage, color }) => (
                  <div key={type} className="flex items-center gap-3 p-3 rounded-lg bg-dark-700/50 border border-dark-600">
                    <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-200 truncate">{type}</p>
                      <p className="text-[10px] text-slate-500">Rétention : {retention}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-mono font-semibold text-slate-300">{usage}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'config' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[
            {
              title: 'Authentification & SSO',
              icon: Lock,
              settings: [
                { key: 'LDAP / Active Directory', value: 'Connecté (corp.local)', ok: true },
                { key: 'SSO SAML 2.0', value: 'Activé (ADFS)', ok: true },
                { key: 'MFA obligatoire', value: 'Oui — TOTP + Push', ok: true },
                { key: 'Durée session', value: '8 heures', ok: true },
              ]
            },
            {
              title: 'Notifications & Alerting',
              icon: Activity,
              settings: [
                { key: 'Email (SMTP)', value: 'Configuré ✓', ok: true },
                { key: 'Webhook (Teams)', value: 'Configuré ✓', ok: true },
                { key: 'Syslog SIEM', value: '10.0.1.100:514', ok: true },
                { key: 'PagerDuty', value: 'Non configuré', ok: false },
              ]
            },
            {
              title: 'Mises à jour & Règles',
              icon: RefreshCw,
              settings: [
                { key: 'Mise à jour auto règles', value: 'Quotidienne 04:00', ok: true },
                { key: 'Source signatures', value: 'EmergingThreats Pro', ok: true },
                { key: 'Dernière mise à jour', value: '02/07/2024 04:00', ok: true },
                { key: 'Règles personnalisées', value: '47 règles actives', ok: true },
              ]
            },
            {
              title: 'Sauvegarde & Restauration',
              icon: Database,
              settings: [
                { key: 'Sauvegarde config', value: 'Quotidienne 02:00', ok: true },
                { key: 'Dernière sauvegarde', value: '02/07/2024 02:00', ok: true },
                { key: 'RPO configuré', value: '24 heures ✓', ok: true },
                { key: 'RTO estimé', value: '3h 20min (< 4h ✓)', ok: true },
              ]
            },
          ].map(({ title, icon: Icon, settings }) => (
            <div key={title} className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-dark-700 border border-dark-600">
                  <Icon className="w-4 h-4 text-slate-400" />
                </div>
                <h3 className="text-sm font-semibold text-white">{title}</h3>
              </div>
              <div className="space-y-2.5">
                {settings.map(({ key, value, ok }) => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-400">{key}</span>
                    <div className="flex items-center gap-1.5">
                      {ok ? (
                        <CheckCircle className="w-3 h-3 text-cyber-500" />
                      ) : (
                        <XCircle className="w-3 h-3 text-red-500" />
                      )}
                      <span className={`text-xs font-mono ${ok ? 'text-slate-200' : 'text-red-400'}`}>{value}</span>
                    </div>
                  </div>
                ))}
              </div>
              <button className="mt-4 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-dark-700 border border-dark-600 text-xs text-slate-400 hover:text-slate-200 hover:bg-dark-600 transition-colors">
                <Settings className="w-3.5 h-3.5" />
                Configurer
              </button>
            </div>
          ))}
        </div>
      )}
      {activeTab === 'whitelist' && <WhitelistTab toast={toast} />}
      {activeTab === 'audit' && <AuditTab toast={toast} />}
      {activeTab === 'retention' && <RetentionTab />}

      {mfaUser && <MfaModal user={mfaUser} onDone={handleMfaDone} onClose={() => setMfaUser(null)} />}

      {(showNewUser || editingUser) && (
        <UserModal
          user={editingUser}
          onSave={handleSaveUser}
          onClose={() => { setShowNewUser(false); setEditingUser(null) }}
        />
      )}
    </div>
  )
}

function WhitelistTab({ toast }) {
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', ip: '', hostname: '', type: 'Serveur critique', criticality: 'high', owner: '', notes: '' })

  const load = async () => {
    setLoading(true)
    try { const d = await api.getWhitelist(); setAssets(d.assets || []) } catch {}
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    try {
      const d = await api.addToWhitelist(form)
      setAssets(prev => [...prev, d.asset])
      setForm({ name: '', ip: '', hostname: '', type: 'Serveur critique', criticality: 'high', owner: '', notes: '' })
      setShowAdd(false)
      toast('Actif ajouté à la liste blanche', 'success')
    } catch (e) { toast(e.message, 'error') }
  }

  const handleRemove = async (id, name) => {
    if (!window.confirm(`Retirer "${name}" de la liste blanche ?`)) return
    try {
      await api.removeFromWhitelist(id)
      setAssets(prev => prev.filter(a => a.id !== id))
      toast('Actif retiré', 'success')
    } catch (e) { toast(e.message, 'error') }
  }

  const CRIT = { critical: 'text-red-400 bg-red-500/10 border-red-500/25', high: 'text-orange-400 bg-orange-500/10 border-orange-500/25', medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/25', low: 'text-blue-400 bg-blue-500/10 border-blue-500/25' }

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-dark-600 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Liste blanche des actifs critiques — EF-508</h2>
            <p className="text-xs text-slate-500 mt-0.5">Ces actifs ne peuvent jamais être bloqués (anti-emballement)</p>
          </div>
          <button onClick={() => setShowAdd(s => !s)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyber-600/20 border border-cyber-500/30 text-cyber-400 text-xs font-medium hover:bg-cyber-600/30 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Ajouter
          </button>
        </div>
        {showAdd && (
          <form onSubmit={handleAdd} className="px-5 py-4 border-b border-dark-600 bg-dark-800/50">
            <div className="grid grid-cols-2 gap-3 mb-3">
              {[['name', 'Nom *'], ['ip', 'Adresse IP'], ['hostname', 'Hostname'], ['owner', 'Responsable']].map(([k, l]) => (
                <div key={k}>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider">{l}</label>
                  <input value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} required={k === 'name'}
                    className="mt-1 w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyber-500/50" />
                </div>
              ))}
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider">Criticité</label>
                <select value={form.criticality} onChange={e => setForm(p => ({ ...p, criticality: e.target.value }))}
                  className="mt-1 w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none">
                  {['critical', 'high', 'medium', 'low'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider">Notes</label>
                <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  className="mt-1 w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none" />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-2 rounded-lg bg-dark-700 border border-dark-600 text-xs text-slate-400">Annuler</button>
              <button type="submit" className="flex-1 py-2 rounded-lg bg-cyber-600/20 border border-cyber-500/30 text-cyber-400 text-xs font-medium">Ajouter</button>
            </div>
          </form>
        )}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-600">
                {['Nom', 'IP', 'Hostname', 'Criticité', 'Type', 'Responsable', 'Notes', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-600/50">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-xs text-slate-500">Chargement…</td></tr>
              ) : assets.map(a => (
                <tr key={a.id} className="hover:bg-dark-750 transition-colors">
                  <td className="px-4 py-3 text-xs font-medium text-slate-200">{a.name}</td>
                  <td className="px-4 py-3 text-xs font-mono text-cyber-400">{a.ip || '—'}</td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-400">{a.hostname || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${CRIT[a.criticality] || CRIT.low}`}>{a.criticality}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{a.type}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{a.owner}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{a.notes}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleRemove(a.id, a.name)} className="p-1 text-slate-600 hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function AuditTab({ toast }) {
  const [entries, setEntries] = useState([])
  const [integrity, setIntegrity] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [log, iv] = await Promise.all([api.getAuditLog(), api.verifyAuditLog()])
      setEntries(log.entries || [])
      setIntegrity(iv)
    } catch {}
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const ACTION_COLORS = {
    DETECTION_ALERT: 'text-red-400',
    BLOCK_HOST: 'text-orange-400',
    UNBLOCK_HOST: 'text-cyber-400',
    BLOCK_REFUSED_WHITELIST: 'text-purple-400',
    USER_CREATE: 'text-blue-400',
    USER_DELETE: 'text-red-400',
    FORCE_MFA: 'text-yellow-400',
    RULE_CREATE: 'text-cyber-400',
    RULE_DELETE: 'text-red-400',
    WHITELIST_ADD: 'text-cyber-400',
    WHITELIST_REMOVE: 'text-orange-400',
    ALERT_UPDATE: 'text-slate-400',
  }

  return (
    <div className="space-y-4">
      {integrity && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${integrity.valid ? 'bg-cyber-500/10 border-cyber-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
          {integrity.valid ? <CheckCircle className="w-4 h-4 text-cyber-400 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />}
          <div>
            <p className={`text-xs font-medium ${integrity.valid ? 'text-cyber-300' : 'text-red-300'}`}>
              {integrity.valid ? `Intégrité vérifiée — ${integrity.entries} entrées · chaînage SHA-256 valide` : `INTÉGRITÉ COMPROMISE — rupture détectée à ${integrity.brokenAt || '?'}`}
            </p>
          </div>
          <button onClick={load} className="ml-auto p-1.5 rounded hover:bg-dark-700 text-slate-500 hover:text-slate-300"><RefreshCw className="w-3.5 h-3.5" /></button>
        </div>
      )}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-dark-600 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Piste d’audit inaltérable — EF-904</h2>
          <span className="text-xs text-slate-500">{entries.length} entrée(s)</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /><span className="text-xs">Chargement…</span>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-dark-800">
                <tr className="border-b border-dark-600">
                  {['Horodatage', 'Action', 'Acteur', 'Cible', 'Hash'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-600/50">
                {entries.map((e, i) => (
                  <tr key={i} className="hover:bg-dark-750 transition-colors">
                    <td className="px-4 py-3 text-[10px] font-mono text-slate-500">{new Date(e.ts).toLocaleString('fr-FR')}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-mono font-semibold ${ACTION_COLORS[e.action] || 'text-slate-400'}`}>{e.action}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{e.actor}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-300">{e.target}</td>
                    <td className="px-4 py-3 text-[9px] font-mono text-slate-600 max-w-xs truncate" title={e.hash}>{e.hash?.slice(0, 16)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function RetentionTab() {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getRetentionConfig().then(d => { setConfig(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center py-12 gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /><span className="text-xs">Chargement…</span></div>
  if (!config) return <div className="text-xs text-red-400 p-6">Erreur de chargement</div>

  const CRIT_BAR = (days, max = 730) => Math.round((days / max) * 100)

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Politique de rétention des données</h2>
            <p className="text-xs text-slate-500 mt-0.5">Conforme RGPD Art.5(1)(e) · Loi LCEN · EF-904</p>
          </div>
          <span className="text-[10px] font-mono text-slate-500">v{config.version} · {new Date(config.updatedAt).toLocaleDateString('fr-FR')}</span>
        </div>
        <div className="space-y-3">
          {Object.entries(config.policies).map(([key, pol]) => (
            <div key={key} className="p-3 rounded-lg bg-dark-700 border border-dark-600">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-200">{pol.label}</span>
                <span className="text-xs font-mono font-bold text-cyber-400">{pol.retentionDays}j</span>
              </div>
              <div className="h-1.5 rounded-full bg-dark-600 overflow-hidden mb-2">
                <div className="h-full rounded-full bg-cyber-500" style={{ width: `${CRIT_BAR(pol.retentionDays)}%` }} />
              </div>
              <div className="flex items-center gap-4 text-[10px] text-slate-500 flex-wrap">
                <span>🔐 {pol.encryptionEnabled ? 'Chiffré' : 'Non chiffré'}</span>
                <span>🗄️ {pol.compressionEnabled ? 'Compressé' : 'Brut'}</span>
                <span className="text-slate-600">{pol.basis}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold text-white mb-3">Pseudonymisation</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            ['Statut', config.pseudonymization.enabled ? 'Activée ✓' : 'Désactivée'],
            ['Algorithme', config.pseudonymization.algorithm],
            ['Champs concernés', config.pseudonymization.fields.join(', ')],
            ['Rotation du sel', `tous les ${config.pseudonymization.saltRotationDays}j`],
          ].map(([k, v]) => (
            <div key={k} className="p-3 rounded-lg bg-dark-700 border border-dark-600">
              <p className="text-[10px] text-slate-500 mb-1">{k}</p>
              <p className="text-xs font-mono text-slate-200">{v}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold text-white mb-3">Purge automatisée</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            ['Planning', config.purgeSchedule.label],
            ['Préavis', `${config.purgeSchedule.notifyBefore} jours`],
            ['Validation requise', config.purgeSchedule.approvalRequired ? 'Oui ✓' : 'Non'],
          ].map(([k, v]) => (
            <div key={k} className="p-3 rounded-lg bg-dark-700 border border-dark-600">
              <p className="text-[10px] text-slate-500 mb-1">{k}</p>
              <p className="text-xs font-mono text-slate-200">{v}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 p-3 rounded-lg bg-dark-700 border border-dark-600">
          <p className="text-[10px] text-slate-500 mb-1">DPO / Exercice des droits</p>
          <p className="text-xs font-mono text-cyber-400">{config.dataSubjectRequests.contact}</p>
          <p className="text-[10px] text-slate-500 mt-1">Réponse sous {config.dataSubjectRequests.responseDeadlineDays} jours (RGPD Art.12)</p>
        </div>
      </div>
    </div>
  )
}
