# Architecture technique — SentiNet v3.2

**Plateforme de supervision et de sécurisation du trafic réseau**  
Document vivant — mis à jour à chaque évolution significative.

---

## 1. Vue d'ensemble

```
┌─────────────────────────────────────────────────────────┐
│                  Navigateur / SOC Analyst               │
│           React 18 SPA  (port 5210, Vite)               │
└────────────────────────┬────────────────────────────────┘
                         │  REST + WebSocket
┌────────────────────────▼────────────────────────────────┐
│              Backend SentiNet API (Node.js 18+)          │
│                   Express 4  (port 3010)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  API Router  │  │  WS Server   │  │  Detection   │  │
│  │  (REST CRUD) │  │  (live push) │  │   Engine     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ┌─────────────────────────────────────────────────────┐│
│  │              Services internes                       ││
│  │  detection.js · audit.js · whitelist.js             ││
│  └─────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────┐│
│  │         Collecte réseau (OS Windows)                 ││
│  │  netstat · ARP · PowerShell Get-NetAdapterStats     ││
│  │  netsh advfirewall · w32tm /query /status           ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
         │ filesystem (logs/)     │ whitelist.json
         │ audit.log (append-only)│ signatures.json
```

---

## 2. Socle technologique

| Couche | Technologie | Justification |
|---|---|---|
| Frontend SPA | React 18 + Vite 4 | Réactivité, HMR rapide, écosystème mature |
| Styles | Tailwind CSS | Utility-first, cohérence design |
| Graphiques | Recharts | Composants SVG légers pour dashboards |
| Icônes | Lucide React | Library SVG consistante |
| Backend API | Node.js 18 + Express 4 | Eventloop adapté I/O réseau, CJS |
| WebSocket | ws (lib native) | Diffusion temps réel sans polling |
| Collecte réseau | OS shells (netstat, ARP, PS) | Intégration native Windows sans driver |
| Pare-feu | netsh advfirewall (Windows) | Blocage temps réel sans dépendance externe |
| Persistance | JSON on-disk (audit, whitelist) | Léger, lisible, append-only pour audit |
| Déploiement dev | concurrently (front + back) | Un seul `npm run dev` |

---

## 3. Découpage des services backend

### 3.1 `server/services/detection.js`
Moteur de détection en temps réel :
- **Beaconing C2** : analyse statistique des intervalles de connexion (CV < 0.15)
- **Mouvement latéral** : connexions SMB/RDP/WinRM/SSH vers ≥ 4 hôtes internes
- **Balayage de ports** : ≥ 25 ports TCP distincts depuis la même source
- **IoC matching** : liste de IPs malveillantes connues + ports C2 (4444, 31337…)
- **Signature matching** : règles configurables via `server/data/signatures.json`
- **Anomalie volumétrique** : pic de débit > 800 Mbps
- **Suivi de sessions** : comptage et pruning des sessions TCP actives

### 3.2 `server/services/audit.js`
Piste d'audit inaltérable (EF-904) :
- Chaînage SHA-256 : `hash(entry) = SHA256(JSON(entry_sans_hash) + prevHash)`
- Stockage append-only dans `logs/audit.log`
- Vérification d'intégrité complète via `verify()`
- Toute action critique (blocage, RBAC, règles, IoC) est journalisée automatiquement

### 3.3 `server/services/whitelist.js`
Liste blanche des actifs critiques (EF-508) :
- Fichier versionné `server/data/whitelist.json`
- Vérification systématique avant tout blocage pare-feu (anti-emballement)
- Refus avec audit si une IP whitelistée est ciblée par un blocage

---

## 4. Segmentation réseau supervisée

| Segment | Interface | Méthode de capture | BPF filter |
|---|---|---|---|
| DMZ | eth0 | SPAN/TAP | `dst net 10.0.0.0/24` |
| WAN sortant | eth1 | Inline/SPAN | `src net 192.168.0.0/16 and dst not net 10.0.0.0/8` |
| LAN est-ouest | eth2 | SPAN | `tcp port 445 or tcp port 139` |
| DNS global | any | Mirror | `udp port 53 or tcp port 53` |

_Note : en environnement Windows de développement, la collecte utilise les APIs OS (netstat, ARP, PowerShell) en mode non-promiscuité. En production, déployer des sondes physiques/virtuelles avec accès promiscuité (DPDK/PF_RING pour 10+ Gbps)._

---

## 5. Points de capture recommandés (production)

- **TAP matériel** sur le lien WAN (agrégé actif/passif)
- **SPAN** sur le cœur de réseau (LAN est/ouest)
- **Mirror** dédié DNS sur le résolveur interne
- **Inline IPS** sur le segment DMZ (fail-open matériel requis — bypass card)
- **Agent endpoint** sur les serveurs critiques (pour corrélation hôte)

---

## 6. Conformité & rétention

| Données | Rétention | Base légale |
|---|---|---|
| Flux réseau bruts | 30 jours | RGPD Art.5(1)(e) |
| Alertes de sécurité | 365 jours | Politique SSI |
| Piste d'audit | 730 jours (2 ans) | EF-904 / RGPD Art.30 |
| Captures PCAP | 7 jours | RGPD — minimisation |
| Métadonnées de session | 90 jours | Loi LCEN |

Pseudonymisation active sur : `email`, `username`, `hostname` (SHA-256 + sel, rotation 180j).

---

## 7. Exigences de performance (non-fonctionnelles)

| Exigence | Valeur cible | Ref |
|---|---|---|
| Débit de capture | 10 Gbps sans perte | ENF-101 |
| Latence d'alerte | < 3 secondes | R6 |
| Disponibilité | ≥ 99.5% (hors maintenance) | ENF-301 |
| MTTD | < 5 min (menaces connues) | R3 |
| Faux positifs | < 2% | R5 / O4 |
| RTO | < 4 heures | ENF-304 |

---

## 8. Flux de données (Data Flow)

```
Réseau →  Capture (netstat/TAP)  →  Detection Engine
                                          │
                                    [alert émise]
                                          │
                          ┌───────────────▼───────────────────┐
                          │  EventBus (Node.js EventEmitter)  │
                          └───┬───────────────────────────────┘
                              │                    │
                    ┌─────────▼──────┐   ┌────────▼───────┐
                    │  db.alerts     │   │  WebSocket push │
                    │  (in-memory)   │   │  → React UI    │
                    └────────────────┘   └────────────────┘
                              │
                    ┌─────────▼──────┐
                    │  audit.log     │
                    │  (SHA-256 chain│
                    └────────────────┘
```

---

## 9. Sécurité de la plateforme

- Headers HTTP de sécurité : `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`
- CORS limité à l'origine frontend en production
- Whitelist anti-emballement sur tous les blocages pare-feu (EF-508)
- Audit inaltérable de toute action à fort impact (EF-904)
- Secrets à externaliser via variables d'environnement (`.env`) en production

---

## 10. Authentification & contrôle d'accès (EF-901/903)

- **Connexion** e-mail + mot de passe, avec **MFA TOTP** (RFC 6238) en 2ᵉ facteur (`server/services/auth.js`).
- **Hachage des mots de passe** : `scrypt` (module `crypto` natif, sel aléatoire par compte, comparaison à temps constant).
- **Sessions** : jeton signé **HS256** (JWT-like) avec `SESSION_SECRET`, expiration 8 h ; jeton MFA intermédiaire à courte durée (5 min).
- **Protection** : middleware `requireAuth` sur **toutes** les routes `/api` (sauf `/api/auth/*` et `/api/agent/*`), et vérification du jeton à l'ouverture du **WebSocket** (`?token=`).
- **RBAC** : rôle porté par le jeton, contrôle `requireRole` ; masquage systématique des secrets (`passwordHash`, `mfaSecret`) dans les réponses API.
- **Amorçage** : script `server/scripts/create-admin.js` (mot de passe via `$ADMIN_PASSWORD`, jamais en argument).

## 11. Sondes distribuées (agents est-ouest) — EF-905

```
┌─────────────────┐   HTTPS + X-Agent-Key    ┌──────────────────────────┐
│  Agent-sonde    │ ───────────────────────► │  /api/agent/ingest        │
│  (2ᵉ machine)   │   flux agrégés (5s)       │  → detection.analyze(     │
│  tcpdump → flux │                           │      excludeLocal:false,  │
│  domaine/réseau │                           │      tag:{sonde,segment,  │
└─────────────────┘                           │          domaine})        │
                                              └──────────────────────────┘
```

- L'**agent** (`agent/sentinet-agent.js`, Node sans dépendance) capture le trafic de son interface via `tcpdump` (repli `ss`), agrège les flux sur une fenêtre glissante et les remonte au serveur, avec son **domaine**, son **réseau/segment** et son **sous-réseau**.
- **Authentification** par clé partagée `AGENT_KEY` (en-tête `X-Agent-Key`).
- Le serveur exécute le **moteur de détection sur le trafic observé** — sans l'auto-exclusion locale — ce qui permet la détection **est-ouest** (balayage, mouvement latéral, beaconing) depuis une source réelle. Chaque alerte est taguée **sonde / segment / domaine** et suit la chaîne complète (temps réel, audit, playbooks).
- **Console** : page *Sondes & Agents* (supervision par domaine/réseau, gestion des intrusions par segment) ; registre des agents in-memory avec statut en ligne/hors ligne.

---

*Dernière mise à jour : août 2026 — SentiNet v3.2 (authentification, portage Linux, agents distribués)*
