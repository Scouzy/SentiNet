#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
#  SentiNet — Kit de test d'intrusion contrôlé (Phase 4 / validation)
#
#  À lancer DEPUIS la 2ᵉ machine (celle où tourne l'agent-sonde). Génère des
#  motifs d'attaque détectables pour valider la chaîne détection → alerte →
#  audit → réponse, et mesurer le MTTD.
#
#  ⚠️  RÈGLE ABSOLUE : ne vise QUE des actifs que TU possèdes ou que tu es
#  explicitement autorisé à tester. Ce script est non destructif (scan de
#  connexion léger, connexions courtes), mais lancer des scans contre des tiers
#  est illégal. TARGET doit être un hôte à toi (ton VPS, un hôte de labo…).
#
#  Usage :
#     TARGET=10.0.0.10 BEACON_IP=203.0.113.10 IOC_IP=203.0.113.66 \
#     DURATION=300 ./intrusion-test.sh
# ═════════════════════════════════════════════════════════════════════════════
set -u

TARGET="${TARGET:-}"
BEACON_IP="${BEACON_IP:-203.0.113.10}"   # TEST-NET-3 (RFC 5737) : non routable, sûr
IOC_IP="${IOC_IP:-203.0.113.66}"         # à ajouter comme IoC dans l'UI avant le test
DURATION="${DURATION:-300}"              # durée du beaconing (s)
C2_PORT="${C2_PORT:-4444}"

RED=$'\e[31m'; GRN=$'\e[32m'; YLW=$'\e[33m'; CYN=$'\e[36m'; RST=$'\e[0m'
say() { echo "${CYN}[test]${RST} $*"; }

if [ -z "$TARGET" ]; then
  echo "${RED}TARGET non défini.${RST} Exemple : TARGET=<ip_hote_a_toi> ./intrusion-test.sh"
  exit 1
fi

echo "${YLW}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Test d'intrusion SentiNet — cible : $TARGET"
echo "║  Ne vise QUE des actifs que tu possèdes / es autorisé à tester."
echo "╚══════════════════════════════════════════════════════════════╝"
echo "${RST}"
read -rp "Confirmer que '$TARGET' est un actif autorisé ? [oui/non] " ok
[ "$ok" = "oui" ] || { echo "Abandon."; exit 1; }

pause() { echo; read -rp "↵ Entrée pour le scénario suivant… " _; echo; }

# ── Scénario 1 : Balayage de ports (Reconnaissance — T1046) ───────────────────
say "${GRN}Scénario 1${RST} — Balayage de ports sur $TARGET (≥ 20 ports distincts)"
if command -v nmap >/dev/null 2>&1; then
  nmap -sT -p 1-200 --host-timeout 30s "$TARGET" | tail -n 15
else
  say "nmap absent → repli /dev/tcp sur 40 ports"
  for p in $(seq 1 40); do
    timeout 1 bash -c "echo > /dev/tcp/$TARGET/$p" 2>/dev/null && echo "  ouvert : $p"
  done
fi
say "Attendu : alerte « Balayage de ports » (T1046) dans SentiNet."
pause

# ── Scénario 2 : Port C2 connu (Command & Control) ────────────────────────────
say "${GRN}Scénario 2${RST} — Connexions vers le port C2 $C2_PORT sur $TARGET"
for i in 1 2 3; do
  timeout 2 bash -c "echo test > /dev/tcp/$TARGET/$C2_PORT" 2>/dev/null && echo "  tentative $i" || echo "  tentative $i (port fermé — le trafic reste détecté)"
  sleep 1
done
say "Attendu : alerte « Port C2 connu » (port $C2_PORT)."
pause

# ── Scénario 3 : IoC — connexion vers une IP répertoriée ──────────────────────
say "${GRN}Scénario 3${RST} — Connexion vers l'IoC $IOC_IP"
say "${YLW}Prérequis :${RST} avoir ajouté $IOC_IP comme IoC dans l'UI (Threat Intelligence → Ajouter un IoC), ou via l'API."
timeout 2 bash -c "echo > /dev/tcp/$IOC_IP/80" 2>/dev/null || true
say "Attendu : alerte « IoC — IP malveillante » sur $IOC_IP."
pause

# ── Scénario 4 : Beaconing C2 (T1071.001) ─────────────────────────────────────
say "${GRN}Scénario 4${RST} — Beaconing régulier vers $BEACON_IP pendant ${DURATION}s (intervalle 30s)"
say "Laisse tourner ≥ 4 min pour accumuler assez de balises (≥ 8)."
end=$(( $(date +%s) + DURATION ))
n=0
while [ "$(date +%s)" -lt "$end" ]; do
  n=$((n+1))
  timeout 2 bash -c "echo ping > /dev/tcp/$BEACON_IP/443" 2>/dev/null || true
  echo "  balise $n → $BEACON_IP:443"
  sleep 30
done
say "Attendu : alerte « Beaconing C2 » (T1071.001) sur $BEACON_IP."

echo
say "${GRN}Terminé.${RST} Vérifie dans SentiNet : pages « Sondes & Agents » et « Alertes »"
say "(filtre par domaine/segment), puis « Rapports » pour le MTTD, et « Réponse » pour l'audit."
