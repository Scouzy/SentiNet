#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
#  SentiNet — Installation de l'agent-sonde en service systemd (arrière-plan)
#
#  Installe l'agent comme service systemd : il tourne en tâche de fond, survit
#  à la fermeture de la console ET au redémarrage du VPS. Plus besoin de laisser
#  un terminal ouvert.
#
#  Usage (en root, sur la machine à superviser) :
#
#    curl -fsSL https://sentinet.devantiq.com/api/agent/install -o install-agent.sh
#    sudo SENTINET_URL=https://sentinet.devantiq.com \
#         AGENT_KEY=<votre_clef_partagée> \
#         AGENT_DOMAIN=devantiq.com \
#         AGENT_NETWORK="LAN Siège" \
#         AGENT_SUBNET=10.0.0.0/24 \
#         IFACE=ens6 \
#         bash install-agent.sh
#
#  Les variables non fournies sont demandées interactivement.
#  Ré-exécuter le script mettra simplement le service à jour (reconfiguration).
# ═════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SVC_NAME="sentinet-agent"
INSTALL_DIR="/opt/sentinet-agent"
AGENT_FILE="$INSTALL_DIR/sentinet-agent.js"
UNIT_FILE="/etc/systemd/system/${SVC_NAME}.service"

if [ "$(id -u)" -ne 0 ]; then
  echo "❌ Ce script doit être lancé en root (sudo)." >&2
  exit 1
fi

# ── Récupération de la configuration (env ou interactif) ──────────────────────
ask() { # ask VAR "libellé" "défaut"
  local var="$1" label="$2" def="${3:-}" cur="${!1:-}"
  if [ -n "$cur" ]; then return; fi
  if [ -n "$def" ]; then read -rp "  $label [$def] : " val; val="${val:-$def}"
  else read -rp "  $label : " val; fi
  printf -v "$var" '%s' "$val"
}

echo "═══ Configuration de l'agent SentiNet ═══"
ask SENTINET_URL "URL du serveur SentiNet"          "https://sentinet.devantiq.com"
ask AGENT_KEY    "Clé partagée AGENT_KEY (= serveur)" ""
ask AGENT_DOMAIN "Domaine supervisé (ex. devantiq.com)" ""
ask AGENT_NETWORK "Libellé du réseau/segment"        "Segment agent"
ask AGENT_SUBNET "Sous-réseau surveillé (optionnel)" ""
# Interface : proposer la 1re interface non-loopback détectée
DEFAULT_IFACE="$(ip -o link show 2>/dev/null | awk -F': ' '$2!="lo"{print $2; exit}')"
ask IFACE        "Interface de capture"              "${DEFAULT_IFACE:-any}"

if [ -z "${SENTINET_URL:-}" ] || [ -z "${AGENT_KEY:-}" ]; then
  echo "❌ SENTINET_URL et AGENT_KEY sont obligatoires." >&2
  exit 1
fi

# ── Dépendances (node + tcpdump) ──────────────────────────────────────────────
echo "═══ Vérification des dépendances ═══"
if ! command -v node >/dev/null 2>&1; then
  echo "  → Node.js absent, installation…"
  apt-get update -qq && apt-get install -y nodejs >/dev/null 2>&1 || {
    echo "  ⚠ Installation de nodejs via apt échouée — installe Node 18+ manuellement." >&2; }
fi
NODE_BIN="$(command -v node || echo /usr/bin/node)"
echo "  Node : $("$NODE_BIN" -v 2>/dev/null || echo 'introuvable')"
if ! command -v tcpdump >/dev/null 2>&1; then
  echo "  → tcpdump absent, installation…"
  apt-get install -y tcpdump >/dev/null 2>&1 || echo "  ⚠ tcpdump non installé — l'agent basculera sur 'ss' (pas de vrai sniffing)." >&2
fi

# ── Récupération de l'agent ───────────────────────────────────────────────────
echo "═══ Déploiement de l'agent ═══"
mkdir -p "$INSTALL_DIR"
if [ -f "./sentinet-agent.js" ]; then
  cp ./sentinet-agent.js "$AGENT_FILE"
  echo "  Agent copié depuis le dossier courant."
else
  echo "  Téléchargement de l'agent depuis $SENTINET_URL/api/agent/download…"
  curl -fsSL "$SENTINET_URL/api/agent/download" -o "$AGENT_FILE"
fi
chmod 644 "$AGENT_FILE"

# ── Écriture de l'unité systemd ───────────────────────────────────────────────
echo "═══ Création du service systemd ═══"
esc() { printf '%s' "$1" | sed 's/[%]/%%/g'; }
cat > "$UNIT_FILE" <<EOF
[Unit]
Description=SentiNet Agent ($(esc "${AGENT_DOMAIN:-—}"))
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=SENTINET_URL=$(esc "$SENTINET_URL")
Environment=AGENT_KEY=$(esc "$AGENT_KEY")
Environment=AGENT_DOMAIN=$(esc "${AGENT_DOMAIN:-—}")
Environment=AGENT_NETWORK=$(esc "${AGENT_NETWORK:-Segment agent}")
Environment=AGENT_SUBNET=$(esc "${AGENT_SUBNET:-}")
Environment=IFACE=$(esc "${IFACE:-any}")
ExecStart=$NODE_BIN $AGENT_FILE
Restart=always
RestartSec=5
User=root
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
chmod 644 "$UNIT_FILE"

# ── Activation ────────────────────────────────────────────────────────────────
systemctl daemon-reload
systemctl enable "$SVC_NAME" >/dev/null 2>&1
systemctl restart "$SVC_NAME"
sleep 2

echo ""
echo "✅ Agent installé et démarré en arrière-plan."
echo "   Domaine  : ${AGENT_DOMAIN:-—}   Réseau : ${AGENT_NETWORK:-Segment agent}   Interface : ${IFACE:-any}"
echo ""
systemctl --no-pager status "$SVC_NAME" | head -n 6 || true
echo ""
echo "Commandes utiles :"
echo "   journalctl -u $SVC_NAME -f          # voir les logs en direct"
echo "   systemctl restart $SVC_NAME         # redémarrer"
echo "   systemctl stop $SVC_NAME            # arrêter"
echo "   systemctl disable --now $SVC_NAME   # désactiver complètement"
echo ""
echo "Tu peux fermer la console : l'agent continue de tourner."
