const BASE = '/api'

// ── Jeton de session ──────────────────────────────────────────────────────────
const TOKEN_KEY = 'sentinet_token'
let authToken = null
try { authToken = localStorage.getItem(TOKEN_KEY) } catch {}

export function setToken(t) {
  authToken = t || null
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY) } catch {}
}
export function getToken() { return authToken }

// URL WebSocket avec jeton (wss:// automatique en HTTPS)
export function getWsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const base = `${proto}://${window.location.host}/ws`
  return authToken ? `${base}?token=${encodeURIComponent(authToken)}` : base
}
export const WS_URL = getWsUrl() // rétro-compat

const req = (method, url, body) =>
  fetch(`${BASE}${url}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async r => {
    let data = {}
    try { data = await r.json() } catch {}
    // Session expirée/invalide → déconnexion globale (sauf sur les routes d'auth)
    if (r.status === 401 && !url.startsWith('/auth')) {
      setToken(null)
      window.dispatchEvent(new Event('sentinet-unauthorized'))
    }
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
    return data
  })

const get = (url) => req('GET', url)
const post = (url, body) => req('POST', url, body)
const patch = (url, body) => req('PATCH', url, body)
const del = (url) => req('DELETE', url)

export const api = {
  // Auth
  login: (email, password) => post('/auth/login', { email, password }),
  mfaLogin: (tempToken, code) => post('/auth/mfa', { tempToken, code }),
  me: () => get('/auth/me'),
  logout: () => post('/auth/logout', {}),

  // Network
  getInterfaces: () => get('/network/interfaces'),
  getConnections: () => get('/network/connections'),
  getHosts: () => get('/network/hosts'),
  ping: (host) => get(`/network/ping/${host}`),
  getNetworkStats: () => get('/network/stats'),
  getSystemInfo: () => get('/system/info'),

  // Alerts
  getAlerts: () => get('/alerts'),
  updateAlert: (id, data) => patch(`/alerts/${id}`, data),

  // Blocks
  getBlocks: () => get('/blocks'),
  blockHost: (ip, reason, alertId) => post('/blocks', { ip, reason, alertId }),
  unblockHost: (ip) => del(`/blocks/${encodeURIComponent(ip)}`),
  updateBlock: (ip, data) => patch(`/blocks/${encodeURIComponent(ip)}`, data),

  // Users
  getUsers: () => get('/users'),
  createUser: (data) => post('/users', data),
  updateUser: (id, data) => patch(`/users/${id}`, data),
  deleteUser: (id) => del(`/users/${id}`),
  forceMfa: () => post('/users/force-mfa', {}),
  mfaSetup: (id) => post(`/users/${id}/mfa/setup`, {}),
  mfaVerify: (id, token) => post(`/users/${id}/mfa/verify`, { token }),
  mfaDisable: (id) => del(`/users/${id}/mfa`),

  // Sensors / sondes réelles
  getSensors: () => get('/sensors'),

  // Playbooks SOAR
  getPlaybooks: () => get('/playbooks'),
  runPlaybook: (id) => post(`/playbooks/${id}/run`, {}),
  updatePlaybook: (id, data) => patch(`/playbooks/${id}`, data),

  // MITRE ATT&CK (couverture réelle)
  getMitre: () => get('/detection/mitre'),

  // Threat intel feeds réels
  getThreatFeeds: () => get('/threat-intel/feeds'),

  // Detection rules
  getDetectionRules: () => get('/detection/rules'),
  createDetectionRule: (data) => post('/detection/rules', data),
  updateDetectionRule: (id, data) => patch(`/detection/rules/${id}`, data),
  deleteDetectionRule: (id) => del(`/detection/rules/${id}`),

  // Dynamic alerts (from detection engine)
  getDynamicAlerts: () => get('/alerts/dynamic'),
  acknowledgeDynamicAlert: (id) => del(`/alerts/dynamic/${encodeURIComponent(id)}`),
  clearDynamicAlerts: () => del('/alerts/dynamic'),

  // Whitelist (EF-508)
  getWhitelist: () => get('/whitelist'),
  checkWhitelist: (ip) => get(`/whitelist/check/${ip}`),
  addToWhitelist: (data) => post('/whitelist', data),
  removeFromWhitelist: (id) => del(`/whitelist/${id}`),

  // Audit log (EF-904)
  getAuditLog: () => get('/audit'),
  verifyAuditLog: () => get('/audit/verify'),
  getAuditStats: () => get('/audit/stats'),

  // Real network data
  getTrafficHistory: (period) => get('/network/traffic-history' + (period && period !== 'live' ? `?period=${period}` : '')),
  getProtocols: () => get('/network/protocols'),
  getTopTalkers: () => get('/network/top-talkers'),
  getProtoStats: () => get('/network/per-proto-stats'),

  // Alert trends & stats
  getAlertTrends: () => get('/alerts/trends'),
  getAlertStats: () => get('/alerts/stats'),

  // Capture / BPF filters
  getBpfFilters: () => get('/capture/filters'),

  // Retention & RGPD
  getRetentionConfig: () => get('/config/retention'),

  // NTP
  getNtpStatus: () => get('/system/ntp'),

  // IoC management
  addIoC: (ip) => post('/threat-intel/ioc', { ip }),
  checkIoC: (ip) => get(`/threat-intel/check/${ip}`),

  // Export / SIEM (jeton en query : le téléchargement par lien porte l'auth)
  exportAlerts: (format = 'json') =>
    `${BASE}/export/alerts?format=${format}${authToken ? `&token=${encodeURIComponent(authToken)}` : ''}`,
}
