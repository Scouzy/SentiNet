# SentiNet — Test d'intrusion de validation (Phase 4)

Ce test valide **de bout en bout** la chaîne de supervision : un agent-sonde
observe le trafic d'un segment, SentiNet détecte les motifs d'attaque, lève des
alertes qualifiées (MITRE, score de risque), les journalise dans la piste d'audit
inaltérable et déclenche les playbooks — le tout visible par domaine / réseau.

> ⚠️ **Cadre légal.** Ne lance ces scénarios QUE contre des actifs que tu possèdes
> ou que tu es explicitement autorisé à tester. Le script est non destructif, mais
> scanner des systèmes tiers est illégal.

## Prérequis

1. Le serveur SentiNet est déployé et à jour (auth + agents).
2. Un **agent** tourne sur la 2ᵉ machine et apparaît **en ligne** dans la page
   **Sondes & Agents** (sous son domaine / réseau).
3. Tu disposes d'une **cible autorisée** (`TARGET`) : ton propre VPS, un hôte de
   labo, une VM à toi.

## Déroulé

Depuis la 2ᵉ machine (celle de l'agent) :

```bash
cd sentinet-app/test
chmod +x intrusion-test.sh
TARGET=<ip_d_un_hote_a_toi> \
BEACON_IP=203.0.113.10 \
IOC_IP=203.0.113.66 \
DURATION=300 \
./intrusion-test.sh
```

Avant le **scénario 3**, ajoute l'IoC de test dans l'interface :
**Threat Intelligence → Ajouter un IoC → `203.0.113.66`** (plage RFC 5737, non routable).

## Scénarios et détections attendues

| # | Scénario | Action | Détection attendue | MITRE |
|---|---|---|---|---|
| 1 | Balayage de ports | ≥ 20 ports distincts sur une cible | **Balayage de ports** | T1046 |
| 2 | Port C2 connu | connexions vers le port 4444 | **Port C2 connu** | T1071 |
| 3 | IoC / IP malveillante | connexion vers une IP de la liste IoC | **IoC — IP malveillante** | T1071 |
| 4 | Beaconing C2 | connexions régulières (30 s) ≥ 4 min | **Beaconing C2** | T1071.001 |

## Vérification (critères de recette du cahier des charges)

- **Détection (R2)** : chaque scénario produit une alerte dans **Alertes & Incidents**
  — filtre par **domaine** et **segment** pour ne voir que la sonde de test.
- **MTTD (R3)** : l'alerte apparaît en quelques secondes (temps réel via WebSocket) ;
  compare l'horodatage de l'alerte au lancement du scénario. Cible < 60 s (signatures).
- **Attribution** : chaque alerte porte la **sonde**, le **segment** et le **domaine**
  (colonne *Sonde / Segment* + panneau de détail).
- **Réponse (EF-501/504)** : bouton **Bloquer** (Sondes & Agents ou détail d'alerte),
  et incrément des **playbooks** dans **Réponse & Remédiation**.
- **Audit (EF-904)** : chaque détection et action est chaînée SHA-256 dans
  **Réponse → Piste d'audit** (bouton *Vérifier l'intégrité*).
- **Couverture MITRE (R8)** : les techniques déclenchées passent en « couvertes » avec
  leur compteur de détections dans **Détection & Menaces → Matrice ATT&CK**.

## Nettoyage

- Retire l'IoC de test si tu ne veux plus le conserver.
- Débloque les IP de test dans **Réponse & Remédiation** si tu as utilisé le blocage
  (surtout si `FIREWALL_ENFORCE=true`).
