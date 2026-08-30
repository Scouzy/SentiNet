'use strict'

// ─────────────────────────────────────────────────────────────────────────────
//  Authentification SentiNet — sans dépendance externe
//  · Hachage de mot de passe : scrypt (module crypto natif)
//  · Jetons de session : JWT-like signé HMAC-SHA256 (HS256)
//  · Middleware requireAuth / requireRole
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto')

const SECRET = process.env.SESSION_SECRET || 'sentinet-dev-secret-change-me'
const TOKEN_TTL = 8 * 3600 // 8 h (secondes)
const MFA_TTL = 5 * 60     // 5 min pour l'étape MFA

// ── Hachage de mot de passe (scrypt) ──────────────────────────────────────────
function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(String(password), salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  try {
    const salt = Buffer.from(parts[1], 'hex')
    const expected = Buffer.from(parts[2], 'hex')
    const actual = crypto.scryptSync(String(password), salt, expected.length)
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  } catch { return false }
}

// ── Jetons signés (HS256) ─────────────────────────────────────────────────────
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlJson(obj) { return b64url(JSON.stringify(obj)) }
function fromB64url(s) { return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64') }

function signToken(payload, ttl = TOKEN_TTL) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttl }
  const data = `${b64urlJson(header)}.${b64urlJson(body)}`
  const sig = b64url(crypto.createHmac('sha256', SECRET).update(data).digest())
  return `${data}.${sig}`
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const data = `${parts[0]}.${parts[1]}`
  const expected = b64url(crypto.createHmac('sha256', SECRET).update(data).digest())
  // comparaison à temps constant
  const a = Buffer.from(parts[2]); const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const body = JSON.parse(fromB64url(parts[1]).toString('utf8'))
    if (body.exp && Math.floor(Date.now() / 1000) > body.exp) return null
    return body
  } catch { return null }
}

// ── Middleware ────────────────────────────────────────────────────────────────
function extractToken(req) {
  const h = req.headers['authorization'] || ''
  if (h.startsWith('Bearer ')) return h.slice(7)
  if (req.query && req.query.token) return String(req.query.token)
  return null
}

function requireAuth(req, res, next) {
  const payload = verifyToken(extractToken(req))
  if (!payload || payload.scope !== 'session') {
    return res.status(401).json({ error: 'Authentification requise' })
  }
  req.user = payload
  next()
}

// Contrôle de rôle (RBAC) — accepte une liste de rôles autorisés
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentification requise' })
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès refusé : privilèges insuffisants' })
    }
    next()
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  extractToken,
  requireAuth,
  requireRole,
  TOKEN_TTL,
  MFA_TTL,
}
