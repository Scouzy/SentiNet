'use strict'

module.exports = {
  alerts: [],
  users: [
    { id: 1, name: 'Alexandre Martin', email: 'a.martin@corp.fr', role: 'Analyste SOC N2', status: 'active', lastLogin: '2024-07-02T14:10:00Z', mfa: true },
    { id: 2, name: 'Sophie Leclerc', email: 's.leclerc@corp.fr', role: 'Ingénieur Sécurité N3', status: 'active', lastLogin: '2024-07-02T13:45:00Z', mfa: true },
    { id: 3, name: 'Thomas Bernard', email: 't.bernard@corp.fr', role: 'Admin Réseau', status: 'active', lastLogin: '2024-07-02T12:00:00Z', mfa: true },
    { id: 4, name: 'Marie Dupont', email: 'm.dupont@corp.fr', role: 'RSSI', status: 'active', lastLogin: '2024-07-02T09:30:00Z', mfa: true },
    { id: 5, name: 'Jean Moreau', email: 'j.moreau@corp.fr', role: 'Analyste SOC N1', status: 'active', lastLogin: '2024-07-01T18:00:00Z', mfa: false },
    { id: 6, name: 'Clara Simon', email: 'c.simon@corp.fr', role: 'Admin Plateforme', status: 'inactive', lastLogin: '2024-06-28T10:00:00Z', mfa: true },
  ],
}
