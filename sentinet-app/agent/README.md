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
# Sur la machine à superviser
sudo apt install -y nodejs tcpdump          # si nécessaire
mkdir -p /opt/sentinet-agent && cd /opt/sentinet-agent
# copier sentinet-agent.js dans ce dossier (scp, git, etc.)
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
| `AGENT_ID` | identifiant unique de l'agent | hostname |
| `AGENT_DOMAIN` | domaine supervisé | `—` |
| `AGENT_NETWORK` | libellé du segment réseau | `Segment agent` |
| `AGENT_SUBNET` | sous-réseau surveillé | *(vide)* |
| `IFACE` | interface de capture | `any` |
| `WINDOW` | fenêtre d'agrégation (s) | `5` |

## Exécution permanente (systemd)

```ini
# /etc/systemd/system/sentinet-agent.service
[Unit]
Description=SentiNet Agent
After=network.target

[Service]
Environment=SENTINET_URL=https://sentinet.devantiq.com
Environment=AGENT_KEY=<votre_clef_partagée>
Environment=AGENT_DOMAIN=devantiq.com
Environment=AGENT_NETWORK=LAN Siège
Environment=AGENT_SUBNET=10.0.0.0/24
Environment=IFACE=eth0
ExecStart=/usr/bin/node /opt/sentinet-agent/sentinet-agent.js
Restart=always
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
