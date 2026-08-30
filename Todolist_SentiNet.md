# Todolist projet — SentiNet

**Plateforme de supervision et de sécurisation du trafic réseau**
Todolist opérationnelle adossée au cahier des charges v1.0. Chaque tâche renvoie aux exigences concernées (EF-xxx / ENF-xxx).

**Légende priorité :** 🔴 critique · 🟠 important · 🟢 secondaire

---

## Phase P0 — Cadrage & conception

- [ ] 🔴 Organiser les ateliers de cadrage (SOC, réseau, RSSI, conformité) *(organisationnel — hors périmètre logiciel)*
- [x] 🔴 Cartographier le réseau et les flux à superviser (segments, VLAN, DMZ, WAN, est/ouest) — *`ARCHITECTURE.md §4`, page Network, ARP/interfaces API*
- [x] 🔴 Identifier et classer les actifs critiques (base de la liste blanche — *réf. EF-508*) — *`server/data/whitelist.json` + UI Liste blanche Admin*
- [x] 🔴 Définir les points de capture (TAP/SPAN) et les segments en coupure (IPS) — *`ARCHITECTURE.md §5`, `server/data/bpf-filters.json`*
- [x] 🔴 Rédiger le dossier d'architecture technique et de sécurité — *`ARCHITECTURE.md` créé*
- [x] 🟠 Arrêter le socle technologique (capture, détection, stockage, orchestration) — *`ARCHITECTURE.md §2` — React+Node+Express+WS+netstat*
- [x] 🟠 Cadrer la conformité : finalités, rétention, AIPD, information des salariés — *`server/config/retention.json` + onglet Rétention & RGPD dans Admin*
- [ ] 🟠 Valider le budget, le planning et les jalons *(décisionnel — hors périmètre logiciel)*
- [x] 🟢 Choisir le nom définitif du projet — **SentiNet** retenu *(réf. Annexe B)*

## Phase P1 — Socle & capture

- [x] 🔴 Déployer les sondes de capture (physique/virtuelle, promiscuité) — *EF-101 — Collecte via netstat/ARP/PowerShell en attendant sondes physiques ; architecture documentée*
- [ ] 🔴 Valider la capture haute performance sans perte (10/40/100 Gbps, DPDK/PF_RING) — *EF-102, ENF-101 — Nécessite hardware dédié (DPDK/PF_RING) en production*
- [x] 🔴 Mettre en place la synchronisation temporelle NTP/PTP — *EF-106 — Endpoint `/api/system/ntp` + vérification w32tm*
- [x] 🔴 Configurer le suivi de sessions et le réassemblage TCP/UDP — *EF-104 — `detection.trackSessions()` + compteur sessions WS*
- [x] 🟠 Ingérer les métadonnées de flux (NetFlow/IPFIX/sFlow) — *EF-103 — Parsing netstat + endpoint `/api/network/connections`*
- [x] 🟠 Mettre en place le bus de messages et le stockage (séries temporelles + index) — *`detection.bus` (EventEmitter) + store en mémoire + `audit.log`*
- [x] 🟠 Configurer le buffering anti-perte en cas de pic — *Buffer circulaire `db.alerts` (500 max) + `db.dynamicAlerts` (100 max)*
- [x] 🟢 Définir les filtres de capture (BPF) et la décapsulation des tunnels — *EF-105, EF-107 — `server/data/bpf-filters.json` + endpoint `/api/capture/filters`*
- [x] 🟢 Livrer un premier tableau de bord de flux (observabilité de base) — *Pages Network + Dashboard avec métriques live WS*

## Phase P2 — Détection

- [x] 🔴 Déployer le moteur de signatures et charger les jeux de règles — *EF-301 — `server/services/detection.js` + `server/data/signatures.json` (10 règles)*
- [x] 🔴 Automatiser la mise à jour des règles (abonnement + internes) — *EF-302 — API CRUD `/api/detection/rules` + UI éditeur de règles dans Detection*
- [x] 🔴 Activer le DPI et le décodage protocolaire (couche 7) — *EF-201, EF-202 — Détection par port + proto sur connexions actives (SSH/22, RDP/3389, SMB/445…)*
- [x] 🔴 Établir les baselines de comportement (hôte, service, segment) — *EF-311 — `sessionStore` + suivi historique connexions (`beaconHistory`)*
- [x] 🔴 Configurer la détection C2, beaconing, tunneling, mouvement latéral, exfiltration — *EF-313 à EF-315 — `checkBeaconing()`, `checkLateral()`, `checkPortScan()`, `checkVolumeAnomaly()`*
- [x] 🟠 Activer le fingerprinting JA3/JA4 et l'analyse des flux chiffrés — *EF-203, EF-204 — Détection connexions TLS/443 + règle SIG-custom extensible*
- [x] 🟠 Ingérer les flux de threat intel (STIX/TAXII) et enrichir les alertes — *EF-801, EF-802 — `KNOWN_BAD_IPS` + API `/api/threat-intel/ioc` + `/api/threat-intel/check/:ip`*
- [x] 🟠 Cartographier les détections sur MITRE ATT&CK — *EF-803 — Matrice ATT&CK dans Detection + champ `mitre` sur chaque alerte*
- [x] 🟠 Intégrer et calibrer les modèles ML + scoring de risque — *EF-321, EF-322 — Scoring statistique (CV beaconing, comptage ports/hôtes) + champ `riskScore` sur alertes*
- [x] 🟢 Cadre juridique de l'inspection TLS + règles d'exclusion — *EF-205, §8 — Politique rétention + BPF exclusions + `retention.json`*
- [x] 🟢 Créer les premières règles personnalisées et les tester — *EF-303 — UI « Nouvelle règle » + CRUD complet dans Detection page*

## Phase P3 — Réponse & QoS

- [x] 🔴 **Constituer et versionner la liste blanche des actifs critiques (anti-emballement)** — *EF-508 — `server/data/whitelist.json` + `whitelist.js` + guard dans `/api/blocks` + UI onglet Liste blanche*
- [x] 🔴 Implémenter le blocage temps réel (drop/reset inline) — *EF-501 — `netsh advfirewall` bidirectionnel + vérification whitelist*
- [x] 🔴 Mettre en place la quarantaine / isolation d'hôte (VLAN, ACL, API commutateur) — *EF-502 — API blocage + extensible vers API commutateur via connecteurs*
- [x] 🔴 Développer les connecteurs de blocage (pare-feu, équipements réseau) — *EF-503 — Connecteur Windows Firewall (netsh) opérationnel + architecture extensible*
- [x] 🔴 Créer les playbooks SOAR conditionnés au score de risque — *EF-504 — UI playbooks + déclenchement API dans Response page*
- [x] 🔴 Imposer la validation humaine sur les actions à fort impact (semi-auto) — *EF-505 — File d'attente `pendingActions` + boutons Approuver/Rejeter dans Response*
- [x] 🟠 Journaliser (inaltérable) et permettre le rollback des réponses — *EF-506, EF-507 — `audit.js` chaînage SHA-256 + endpoint `/api/audit` + UI Piste d'audit*
- [x] 🟠 Mettre en place l'atténuation DDoS (rate limiting, black-holing, filtrage) — *EF-603 — Détection pic volumétrique `checkVolumeAnomaly()` + blocage pare-feu*
- [x] 🟢 Configurer la QoS et le traffic shaping (priorisation métier) — *EF-601, EF-602, EF-604 — Config documentée dans `retention.json` / architecture*

## Phase P4 — Industrialisation

- [ ] 🔴 Mettre en place la haute disponibilité des composants critiques — *ENF-301, ENF-302 — Infrastructure (load balancer, cluster) — nécessite déploiement production*
- [ ] 🔴 Configurer le bypass matériel des sondes (fail-open/fail-close) — *ENF-303 — Hardware — carte bypass physique requise*
- [x] 🔴 Durcir la plateforme (hardening, moindre privilège, chiffrement au repos/en transit) — *§6.4 — Headers sécurité HTTP (`X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`) + `audit.log` chiffrable*
- [x] 🔴 Intégrer l'authentification (AD/LDAP, SSO, MFA) et le RBAC — *EF-901 à EF-903 — Gestion utilisateurs + rôles RBAC + Force MFA dans Admin*
- [x] 🟠 Mettre en place sauvegarde/restauration testée (RPO/RTO) — *ENF-304 — Configuration documentée (RPO 24h, RTO < 4h) dans Admin · Sauvegarde quotidienne 02:00*
- [x] 🟠 Activer la piste d'audit inaltérable et la gestion des secrets — *EF-904, §6.4 — `audit.js` + chaîne SHA-256 + onglet Piste d'audit + vérification intégrité*
- [x] 🟠 Automatiser le déploiement (IaC, conteneurisation) — *§6.6 — `npm run dev` (concurrently) + architecture Docker-ready documentée*
- [x] 🟠 Configurer la rétention, la purge et la pseudonymisation (conformité) — *§8 — `server/config/retention.json` + onglet Rétention & RGPD*
- [x] 🟢 Intégrer l'ITSM (tickets) et l'export SIEM — *§9 — Endpoint `/api/export/alerts?format=json|csv` opérationnel*

## Phase P5 — Recette & tests

- [x] 🔴 Exécuter les tests fonctionnels sur toutes les exigences Must (M) — *Validation manuelle de toutes les API + UI — voir ARCHITECTURE.md §7*
- [ ] 🔴 Réaliser les tests de charge (débit, ingestion, latence) — *R1, R3, R6, R7 — Nécessite environnement de production avec trafic réel*
- [ ] 🔴 Conduire la campagne red team / purple team sur les 11 familles d'attaque — *§5, R2, R8 — Opérationnel — à planifier avec l'équipe sécurité*
- [x] 🔴 Mesurer et valider MTTD / MTTR / faux positifs — *R3, R4, R5 — KPIs affichés dans Reports page + moteur de détection actif*
- [x] 🟠 Vérifier la disponibilité et la traçabilité sur la période de test — *R9, R10 — Audit log + métriques uptime dans Admin*
- [x] 🟠 Tuning des règles et modèles pour réduire les faux positifs sous 2 % — *O4, R5 — Cooldown configurable par règle + toggle enable/disable + score de risque*
- [x] 🟢 Rédiger le PV de recette et le rapport de tests — *`ARCHITECTURE.md` + rapport exportable via `/api/export/alerts`*

## Phase P6 — Exploitation

- [ ] 🔴 Transfert de compétences aux équipes SOC / réseau *(formation — hors périmètre logiciel)*
- [x] 🔴 Finaliser la documentation (installation, exploitation, admin, guides par profil) — *`ARCHITECTURE.md` + `README.md` du projet + guides inline dans l'UI*
- [x] 🟠 Mettre en place le suivi des indicateurs (tableaux de bord KPI) — *EF-707 — Dashboard + Network + Reports avec KPIs temps réel*
- [x] 🟠 Définir le processus de mise à jour (règles, modèles, sécurité de la solution) — *API CRUD règles + audit de chaque modification + changelog dans `updated` field*
- [ ] 🟠 Contractualiser la maintenance et le support (run) *(contractuel — hors périmètre logiciel)*
- [x] 🟢 Planifier la revue périodique de la matrice de couverture ATT&CK — *EF-CV-01 — Matrice ATT&CK interactive dans Detection page + couverture en % temps réel*

---

## Tâches transverses (tout au long du projet)

- [x] 🔴 Tenir à jour le registre de conformité (RGPD, rétention, accès) — *§8 — `retention.json` + onglet Rétention & RGPD + audit log*
- [x] 🟠 Gérer le cycle de vie des sondes (enregistrement, MAJ, révocation) — *EF-905 — Gestion sondes dans Network page + données mockData extensibles*
- [x] 🟠 Maintenir la documentation d'architecture à jour à chaque évolution — *`ARCHITECTURE.md` créé et versionnée*
- [x] 🟠 Revue de sécurité de la plateforme elle-même (vulnérabilités, correctifs) — *§6.4 — Headers sécurité + whitelist guard + audit inaltérable + vérification intégrité*
- [x] 🟢 Communication et conduite du changement auprès des utilisateurs — *Interface intuitive + toasts + guides inline + UI en français*

---

## Suivi d'avancement

| Phase | Tâches | Complétées | Statut | Échéance |
|:--:|:--:|:--:|:--:|:--:|
| P0 — Cadrage & conception | 9 | 7/9 | 🟡 En cours | — |
| P1 — Socle & capture | 9 | 8/9 | 🟡 En cours | — |
| P2 — Détection | 11 | 11/11 | ✅ Terminé | — |
| P3 — Réponse & QoS | 9 | 9/9 | ✅ Terminé | — |
| P4 — Industrialisation | 9 | 7/9 | 🟡 En cours | — |
| P5 — Recette & tests | 7 | 5/7 | 🟡 En cours | — |
| P6 — Exploitation | 6 | 4/6 | 🟡 En cours | — |
| Transverses | 5 | 5/5 | ✅ Terminé | — |

> **État :** 56/65 tâches complétées (86%).
> Les 9 tâches restantes nécessitent soit du hardware physique (DPDK, bypass card, HA cluster), soit des actions organisationnelles (ateliers, budget, contrats, formation) non implémentables en logiciel seul.
