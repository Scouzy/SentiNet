const BASE = '/api'
// wss:// automatiquement quand la page est servie en HTTPS (évite le mixed-content en prod)
export const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`

const req = (method, url, body) =>
  fetch(`${BASE}${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).then(async r => {
    const data = await r.json()
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
    return data
  })

const get = (url) => req('GET', url)
const post = (url, body) => req('POST', url, body)
const patch = (url, body) => req('PATCH', url, body)
const del = (url) => req('DELETE', url)

export const api = {
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
  getTrafficHistory: () => get('/network/traffic-history'),
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

  // Export / SIEM
  exportAlerts: (format = 'json') => `${BASE}/export/alerts?format=${format}`,
}
