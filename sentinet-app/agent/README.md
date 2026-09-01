# SentiNet — Agent-sonde distant

Capteur réseau léger à installer sur les machines à superviser. Il **sniffe le trafic**
de son segment (réseau + domaine), agrège les flux observés et les **remonte au serveur
central** SentiNet, qui exécute le moteur de détection et affiche les intrusions par
domaine / réseau (page **Sondes & Agents**).

## Prérequis

- **Node.js 18+** (utilise `fetch` natif, aucune dépendance npm)
- **tcpdump** installé et **droits root** (pour la capture). Sans tcpdump, l'agent
  bascule automatiquement sur `ss` (connexions locales, sans vrai sniffing).
- Accès réseau sortant vers le serveur SentiNet (HTTPS).

## Installation

```bash
# Sur la machine à superviser : dépendances
sudo apt update && sudo apt install -y nodejs tcpdump

# Récupérer l'agent — le plus simple : téléchargement direct depuis le serveur SentiNet
sudo mkdir -p /opt/sentinet-agent
sudo curl -fsSL https://sentinet.devantiq.com/api/agent/download -o /opt/sentinet-agent/sentinet-agent.js
#   Alternative (scp) : scp agent/sentinet-agent.js user@CIBLE:~/  puis  sudo mv ~/sentinet-agent.js /opt/sentinet-agent/

ip -o link show    # repérer l'interface à écouter (eth0, ens3…)
```

## Configuration & lancement

La clé `AGENT_KEY` doit être **identique** à celle du serveur (variable `AGENT_KEY`
dans le `.env` du serveur — générée avec `openssl rand -hex 24`).

```bash
sudo SENTINET_URL=https://sentinet.devantiq.com \
     AGENT_KEY=<votre_clef_partagée> \
     AGENT_DOMAIN=devantiq.com \
     AGENT_NETWORK="LAN Siège" \
     AGENT_SUBNET=10.0.0.0/24 \
     IFACE=eth0 \
     node sentinet-agent.js
```

| Variable | Rôle | Défaut |
|---|---|---|
| `SENTINET_URL` | URL du serveur central | *(requis)* |
| `AGENT_KEY` | clé partagée d'authentification | *(requis)* |
| `AGENT_ID` | identifiant **unique** de l'agent (différent sur chaque machine) | hostname + suffixe MAC |
| `AGENT_DOMAIN` | domaine supervisé | `—` |
| `AGENT_NETWORK` | libellé du segment réseau | `Segment agent` |
| `AGENT_SUBNET` | sous-réseau surveillé | *(vide)* |
| `IFACE` | interface de capture | `any` |
| `WINDOW` | fenêtre d'agrégation (s) | `5` |

## Exécution en arrière-plan (recommandé) — installation en une commande

Lancer l'agent avec `node sentinet-agent.js` dans un terminal le **tue dès que la
console est fermée**. Pour qu'il tourne en tâche de fond (et redémarre tout seul au
reboot du VPS), installe-le en **service systemd** via le script fourni :

```bash
# Sur la machine à superviser, en root :
curl -fsSL https://sentinet.devantiq.com/api/agent/install -o install-agent.sh
sudo SENTINET_URL=https://sentinet.devantiq.com \
     AGENT_KEY=<votre_clef_partagée> \
     AGENT_DOMAIN=devantiq.com \
     AGENT_NETWORK="LAN Siège" \
     AGENT_SUBNET=10.0.0.0/24 \
     IFACE=ens6 \
     bash install-agent.sh
```

Le script installe Node.js + tcpdump si besoin, télécharge l'agent, crée le service
`sentinet-agent` et le démarre. **Tu peux fermer la console : l'agent continue.**
Les variables non fournies sont demandées de façon interactive. Ré-exécuter le script
reconfigure simplement le service (utile pour changer d'interface ou de domaine).

Commandes utiles :

```bash
sudo journalctl -u sentinet-agent -f          # logs en direct
sudo systemctl restart sentinet-agent         # redémarrer
sudo systemctl stop sentinet-agent            # arrêter
sudo systemctl disable --now sentinet-agent   # désactiver complètement
```

### Variante manuelle (unité systemd écrite à la main)

Si tu préfères écrire l'unité toi-même :

```ini
# /etc/systemd/system/sentinet-agent.service
[Unit]
Description=SentiNet Agent
After=network-online.target
Wants=network-online.target

[Service]
Environment=SENTINET_URL=https://sentinet.devantiq.com
Environment=AGENT_KEY=<votre_clef_partagée>
Environment=AGENT_DOMAIN=devantiq.com
Environment=AGENT_NETWORK=LAN Siège
Environment=AGENT_SUBNET=10.0.0.0/24
Environment=IFACE=eth0
ExecStart=/usr/bin/node /opt/sentinet-agent/sentinet-agent.js
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sentinet-agent
sudo journalctl -u sentinet-agent -f
```

Une fois lancé, l'agent apparaît dans la page **Sondes & Agents** de l'interface,
sous son domaine, et les intrusions détectées sur son segment y remontent en temps réel.
