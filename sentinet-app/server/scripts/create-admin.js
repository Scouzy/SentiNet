'use strict'

// ─────────────────────────────────────────────────────────────────────────────
//  Création / mise à jour d'un compte administrateur SentiNet
//
//  Le mot de passe est lu depuis la variable d'environnement ADMIN_PASSWORD
//  (jamais en argument, pour ne pas apparaître dans l'historique du shell).
//
//  Usage recommandé (sur le serveur, dans sentinet-app/) :
//     read -rsp "Mot de passe: " ADMIN_PASSWORD; echo; export ADMIN_PASSWORD
//     node server/scripts/create-admin.js "admin@exemple.fr" "Nom Prénom" "Admin Plateforme"
//     unset ADMIN_PASSWORD
//     pm2 reload sentinet-api        # pour que le serveur recharge la base
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const auth = require('../services/auth')
const initial = require('../data/initial')

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json')

const email = (process.argv[2] || process.env.ADMIN_EMAIL || '').trim()
const name = (process.argv[3] || process.env.ADMIN_NAME || 'Administrateur').trim()
const role = (process.argv[4] || process.env.ADMIN_ROLE || 'Admin Plateforme').trim()
const password = process.env.ADMIN_PASSWORD || ''

function fail(msg) { console.error(`\n❌ ${msg}\n`); process.exit(1) }

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  fail('Email invalide. Usage : node server/scripts/create-admin.js "<email>" ["Nom"] ["Rôle"]  (mot de passe via $ADMIN_PASSWORD)')
}
if (!password || password.length < 8) {
  fail('Définis un mot de passe d\'au moins 8 caractères via la variable ADMIN_PASSWORD.')
}

// Charge la base existante (préserve alertes/blocages/utilisateurs)
let db = { alerts: [], blocks: [], users: initial.users.map(u => ({ ...u })) }
try {
  if (fs.existsSync(DB_PATH)) {
    const saved = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'))
    db = {
      alerts: Array.isArray(saved.alerts) ? saved.alerts : [],
      blocks: Array.isArray(saved.blocks) ? saved.blocks : [],
      users: Array.isArray(saved.users) && saved.users.length ? saved.users : initial.users.map(u => ({ ...u })),
    }
  }
} catch (e) { fail(`Lecture de db.json impossible : ${e.message}`) }

const passwordHash = auth.hashPassword(password)
const existing = db.users.find(u => (u.email || '').toLowerCase() === email.toLowerCase())

if (existing) {
  existing.passwordHash = passwordHash
  existing.role = role
  existing.name = name || existing.name
  existing.status = 'active'
  console.log(`\n✅ Compte mis à jour : ${email} (rôle : ${role})`)
} else {
  db.users.push({
    id: Date.now(),
    name,
    email,
    role,
    status: 'active',
    mfa: false,
    lastLogin: null,
    passwordHash,
  })
  console.log(`\n✅ Compte administrateur créé : ${email} (rôle : ${role})`)
}

try {
  fs.writeFileSync(DB_PATH, JSON.stringify({ alerts: db.alerts, blocks: db.blocks, users: db.users }, null, 2))
} catch (e) { fail(`Écriture de db.json impossible : ${e.message}`) }

console.log('   Mot de passe haché (scrypt) et enregistré.')
console.log('   ➜ Recharge le serveur pour prendre en compte : pm2 reload sentinet-api\n')
