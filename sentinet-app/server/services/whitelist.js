'use strict'

/**
 * Liste blanche des actifs critiques — EF-508
 * Protège contre le blocage accidentel des ressources vitales.
 */

const fs = require('fs')
const path = require('path')

const WL_PATH = path.join(__dirname, '../data/whitelist.json')

function load() {
  try {
    return JSON.parse(fs.readFileSync(WL_PATH, 'utf8'))
  } catch {
    return { version: '1.0', updatedAt: new Date().toISOString(), assets: [] }
  }
}

function save(data) {
  data.updatedAt = new Date().toISOString()
  fs.writeFileSync(WL_PATH, JSON.stringify(data, null, 2))
}

/** Returns the full list of whitelisted assets. */
function getAll() {
  return load().assets
}

/** Returns true if the given IP or hostname is whitelisted. */
function isWhitelisted(ipOrHostname) {
  return load().assets.some(a => a.ip === ipOrHostname || a.hostname === ipOrHostname)
}

/** Add a new asset to the whitelist. */
function add(asset) {
  const data = load()
  const entry = {
    id: Date.now(),
    addedAt: new Date().toISOString(),
    criticality: 'high',
    type: 'Actif',
    ...asset,
  }
  data.assets.push(entry)
  save(data)
  return entry
}

/** Remove an asset by id. */
function remove(id) {
  const data = load()
  const before = data.assets.length
  data.assets = data.assets.filter(a => a.id !== id)
  if (data.assets.length === before) throw new Error(`Actif ${id} introuvable`)
  save(data)
}

/** Update an asset. */
function update(id, patch) {
  const data = load()
  const a = data.assets.find(x => x.id === id)
  if (!a) throw new Error(`Actif ${id} introuvable`)
  Object.assign(a, patch)
  save(data)
  return a
}

module.exports = { getAll, isWhitelisted, add, remove, update }
