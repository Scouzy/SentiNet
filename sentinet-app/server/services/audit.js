'use strict'

/**
 * Piste d'audit inaltérable — EF-904
 * Chaînage SHA-256 : chaque entrée intègre le hash de la précédente.
 * Toute modification externe d'une ligne brise la chaîne → détectable par verify().
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const LOG_DIR = path.join(__dirname, '../../logs')
const LOG_PATH = path.join(LOG_DIR, 'audit.log')

let lastHash = '0'.repeat(64)

// Ensure log directory exists
try { fs.mkdirSync(LOG_DIR, { recursive: true }) } catch {}

// Load last hash from existing log
try {
  const content = fs.readFileSync(LOG_PATH, 'utf8').trim()
  if (content) {
    const lines = content.split('\n').filter(Boolean)
    if (lines.length) {
      const last = JSON.parse(lines[lines.length - 1])
      lastHash = last.hash || lastHash
    }
  }
} catch {}

/**
 * Write an audit entry (append-only).
 * @param {string} action  - Action performed (e.g. "BLOCK_HOST")
 * @param {string} actor   - Who triggered it (username / 'system')
 * @param {string} target  - Target resource (IP, user, rule ID…)
 * @param {object} details - Additional structured data
 */
function write(action, actor = 'system', target = '', details = {}) {
  const entry = {
    ts: new Date().toISOString(),
    action,
    actor,
    target,
    details,
    prevHash: lastHash,
  }
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(entry))
    .digest('hex')

  const full = { ...entry, hash }
  lastHash = hash

  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify(full) + '\n', { flag: 'a' })
  } catch (e) {
    console.error('[audit] write error:', e.message)
  }

  return full
}

/**
 * Read last `limit` entries (most recent first).
 */
function read(limit = 200) {
  try {
    const lines = fs.readFileSync(LOG_PATH, 'utf8').trim().split('\n').filter(Boolean)
    return lines.slice(-limit).reverse().map(l => JSON.parse(l))
  } catch {
    return []
  }
}

/**
 * Verify the integrity of the whole chain.
 * Returns { valid: true, entries: N } or { valid: false, brokenAt: ISO_DATE }
 */
function verify() {
  try {
    const lines = fs.readFileSync(LOG_PATH, 'utf8').trim().split('\n').filter(Boolean)
    let prev = '0'.repeat(64)
    for (const line of lines) {
      const { hash, ...rest } = JSON.parse(line)
      const expected = crypto.createHash('sha256').update(JSON.stringify(rest)).digest('hex')
      if (hash !== expected) return { valid: false, brokenAt: rest.ts, expected, got: hash }
      prev = hash
    }
    return { valid: true, entries: lines.length, lastHash: prev }
  } catch (e) {
    return { valid: false, error: e.message }
  }
}

/**
 * Quick stats for Admin dashboard.
 */
function stats() {
  try {
    const lines = fs.readFileSync(LOG_PATH, 'utf8').trim().split('\n').filter(Boolean)
    const entries = lines.map(l => JSON.parse(l))
    const byAction = {}
    for (const e of entries) {
      byAction[e.action] = (byAction[e.action] || 0) + 1
    }
    return {
      total: entries.length,
      byAction,
      oldest: entries[0]?.ts || null,
      newest: entries[entries.length - 1]?.ts || null,
    }
  } catch {
    return { total: 0, byAction: {}, oldest: null, newest: null }
  }
}

module.exports = { write, read, verify, stats }
