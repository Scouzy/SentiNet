<div align="center">

<img src="sentinet-app/public/sentinet-logo-primary.svg" alt="SentiNet" width="380" />

### Plateforme de supervision et de sécurisation du trafic réseau

*Une sentinelle pour votre réseau — surveiller, détecter, protéger.*

![Version](https://img.shields.io/badge/version-3.2-1B6CA8)
![React](https://img.shields.io/badge/React-18-2EC4B6?logo=react&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-12A594?logo=node.js&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-4-3FE0C8?logo=vite&logoColor=white)
![Licence](https://img.shields.io/badge/licence-propri%C3%A9taire-0E2C4E)

</div>

---

## Présentation

**SentiNet** (contraction de *sentinelle* + *network*) est une plateforme de **supervision et de sécurisation du trafic réseau** de type SOC (*Security Operations Center*). Elle collecte les flux réseau, détecte les menaces en temps réel via un moteur d'analyse comportementale et par signatures, orchestre la réponse (blocage, quarantaine, playbooks SOAR) et journalise chaque action critique dans une piste d'audit inaltérable.

L'interface web offre à l'analyste SOC un tableau de bord temps réel, la cartographie du réseau, la gestion des détections et de la threat intelligence, la matrice MITRE ATT&CK, ainsi qu'un module d'administration complet (RBAC, MFA, rétention & conformité RGPD).

> Conçue et documentée à partir d'un cahier des charges formel (exigences EF-xxx / ENF-xxx), la plateforme couvre l'ensemble du cycle **détection → décision → réponse → audit**.

---

## Fonctionnalités clés

### 🛰️ Collecte & observabilité
- Capture des flux via les APIs natives de l'OS Windows (`netstat`, `ARP`, PowerShell `Get-NetAdapterStats`) — sans driver ni dépendance externe.
- Suivi et pruning des sessions TCP/UDP actives, ingestion des métadonnées de flux.
- Filtres de capture BPF configurables par segment (DMZ, WAN, LAN est-ouest, DNS).
- Synchronisation temporelle vérifiée (`w32tm` / NTP).

### 🎯 Détection des menaces
- **Beaconing C2** : analyse statistique des intervalles de connexion (coefficient de variation < 0,15).
- **Mouvement latéral** : détection SMB/RDP/WinRM/SSH vers ≥ 4 hôtes internes.
- **Balayage de ports** : ≥ 25 ports TCP distincts depuis une même source.
- **Anomalie volumétrique** : détection des pics de débit (> 800 Mbps).
- **Signatures** : moteur de règles configurables (`signatures.json`) avec éditeur intégré (CRUD complet).
- **Threat intelligence** : IoC (IPs/ports malveillants connus), enrichissement des alertes, cartographie **MITRE ATT&CK**.
- **Scoring de risque** statistique sur chaque alerte.

### 🛡️ Réponse & orchestration
- **Blocage temps réel** via `netsh advfirewall` (Windows), bidirectionnel.
- **Liste blanche anti-emballement** (EF-508) : vérification systématique des actifs critiques avant tout blocage.
- **Playbooks SOAR** conditionnés au score de risque.
- **Validation humaine** obligatoire pour les actions à fort impact (file d'attente Approuver / Rejeter).

### 📜 Audit & conformité
- **Piste d'audit inaltérable** (EF-904) : chaînage SHA-256 (`hash = SHA256(entry + prevHash)`), stockage append-only, vérification d'intégrité complète.
- **Rétention & RGPD** : politiques de rétention paramétrables, pseudonymisation (SHA-256 + sel) des données personnelles.
- **RBAC + MFA** : gestion des utilisateurs, rôles et authentification forte (`otplib` / QR code).

### 📊 Interface analyste (SPA React)
Tableau de bord temps réel · Cartographie réseau · Détection & règles · Alertes · Trafic · Threat Intel · Réponse · Rapports & KPI (MTTD/MTTR/faux positifs) · Administration.

---

## Stack technique

| Couche | Technologie |
|---|---|
| Frontend SPA | React 18 + Vite 4 |
| Styles | Tailwind CSS |
| Graphiques | Recharts |
| Icônes | Lucide React |
| Routing | React Router 6 |
| Backend API | Node.js 18+ / Express 4 (CommonJS) |
| Temps réel | WebSocket (`ws`) |
| Collecte réseau | Shells OS Windows (`netstat`, `ARP`, PowerShell, `netsh`) |
| Auth / MFA | `otplib` + `qrcode` |
| Persistance | JSON on-disk (audit append-only, whitelist, signatures) |
| Dev | `concurrently` (front + back en une commande) |

Détails complets dans **[`ARCHITECTURE.md`](ARCHITECTURE.md)**.

---

## Prérequis

- **Node.js 18 ou supérieur** et **npm**
- **Windows** (la collecte réseau et le blocage pare-feu s'appuient sur les commandes natives Windows : `netstat`, `netsh advfirewall`, PowerShell).
- Droits **administrateur** recommandés pour les actions de blocage pare-feu.

---

## Installation

```bash
# 1. Cloner le dépôt
git clone https://github.com/Scouzy/SentiNet.git
cd SentiNet/sentinet-app

# 2. Installer les dépendances
npm install

# 3. (Optionnel) Configurer l'environnement
copy .env.example .env
#   puis éditer .env pour renseigner les secrets et l'origine CORS
```

---

## Lancement

```bash
# Démarrer le frontend ET le backend en une seule commande
npm run dev
```

| Service | URL | Port |
|---|---|---|
| Interface web (Vite) | http://localhost:5210 | `5210` |
| API + WebSocket (Express) | http://localhost:3010 | `3010` |

Le frontend proxifie automatiquement `/api` et `/ws` vers le backend (voir `vite.config.js`).

Autres scripts :

```bash
npm run dev:client   # frontend seul (Vite)
npm run dev:server   # backend seul (Node/Express)
npm run build        # build de production du frontend
npm run preview      # prévisualisation du build
```

---

## Structure du projet

```
SentiNet/
├── ARCHITECTURE.md                 # Dossier d'architecture technique & sécurité
├── Cahier_des_charges_SentiNet.*   # Cahier des charges (md / docx / pdf)
├── Todolist_SentiNet.md            # Suivi d'avancement (exigences EF/ENF)
├── sentinet-brand.md               # Mémo d'identité visuelle
├── LICENSE
├── README.md
└── sentinet-app/                   # Application
    ├── index.html
    ├── vite.config.js
    ├── tailwind.config.js
    ├── package.json
    ├── public/                     # Logos, icônes, favicon, manifest PWA
    ├── logs/                       # Piste d'audit runtime (audit.log — non versionné)
    ├── server/                     # Backend
    │   ├── index.js                # API REST + serveur WebSocket
    │   ├── services/               # detection.js · audit.js · whitelist.js
    │   ├── config/                 # retention.json
    │   └── data/                   # signatures, whitelist, bpf-filters, db
    └── src/                        # Frontend React
        ├── pages/                  # Dashboard, Detection, Alerts, Network,
        │                           #   Traffic, ThreatIntel, Response, Reports, Admin
        ├── components/             # Layout (Header, Sidebar) + UI
        ├── hooks/                  # useWebSocket
        ├── services/               # api.js
        └── data/                   # mockData.js
```

---

## Sécurité & conformité

- Headers HTTP de sécurité (`X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`).
- CORS restreint à l'origine du frontend en production.
- Whitelist anti-emballement sur tous les blocages pare-feu (EF-508).
- Audit inaltérable de toute action à fort impact avec vérification d'intégrité (EF-904).
- Secrets externalisés via variables d'environnement (`.env`) — jamais commités.
- Rétention et pseudonymisation conformes RGPD (voir `server/config/retention.json`).

> ⚠️ En développement sous Windows, la collecte utilise les APIs OS en mode non-promiscuité. En production, déployer des sondes physiques/virtuelles avec accès promiscuité (DPDK/PF_RING pour 10 Gbps+). Voir `ARCHITECTURE.md §5`.

---

## Statut du projet

**56/65 tâches complétées (86 %)** — l'essentiel du périmètre logiciel est opérationnel.

| Phase | Complétées | Statut |
|---|:--:|:--:|
| P0 — Cadrage & conception | 7/9 | 🟡 En cours |
| P1 — Socle & capture | 8/9 | 🟡 En cours |
| P2 — Détection | 11/11 | ✅ Terminé |
| P3 — Réponse & QoS | 9/9 | ✅ Terminé |
| P4 — Industrialisation | 7/9 | 🟡 En cours |
| P5 — Recette & tests | 5/7 | 🟡 En cours |
| P6 — Exploitation | 4/6 | 🟡 En cours |
| Transverses | 5/5 | ✅ Terminé |

Les tâches restantes nécessitent soit du **hardware physique** (capture DPDK/PF_RING, carte bypass fail-open, cluster HA), soit des **actions organisationnelles** (ateliers de cadrage, budget, contrats de maintenance, formation SOC) — non implémentables en logiciel seul. Détail complet dans **[`Todolist_SentiNet.md`](Todolist_SentiNet.md)**.

---

## Documentation

- **[`ARCHITECTURE.md`](ARCHITECTURE.md)** — architecture technique, flux de données, sécurité, conformité, performances.
- **[`Cahier_des_charges_SentiNet.md`](Cahier_des_charges_SentiNet.md)** — cahier des charges détaillé (exigences EF/ENF).
- **[`Todolist_SentiNet.md`](Todolist_SentiNet.md)** — suivi d'avancement par phase.
- **[`sentinet-brand.md`](sentinet-brand.md)** — identité visuelle et charte graphique.

---

## Licence

Logiciel **propriétaire — tous droits réservés**. Voir **[`LICENSE`](LICENSE)**.
Toute reproduction ou réutilisation, totale ou partielle, sans autorisation écrite préalable est interdite.

---

<div align="center">

**SentiNet v3.2** · Développé par [Scouzy](https://github.com/Scouzy)

</div>
