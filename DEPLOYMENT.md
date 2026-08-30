# Déploiement de SentiNet sur un VPS (Ubuntu / Debian)

Guide pas-à-pas pour installer SentiNet en production derrière **nginx**, avec le
backend géré par **PM2** et un certificat **HTTPS Let's Encrypt**, sur le domaine
`sentinet.devantiq.com`.

> **Note plateforme.** Le backend a été porté pour Linux : la collecte réseau
> utilise `ss`, `ip neigh`, `ping -c` et `/proc/net/dev` ; le blocage pare-feu
> utilise `iptables`/`ip6tables` ; la synchro NTP utilise `timedatectl`. Voir la
> section [Blocage pare-feu & privilèges](#7-blocage-pare-feu--privilèges).

---

## 0. Prérequis

- Un VPS Ubuntu 22.04+/Debian 12+ avec accès **SSH** et un utilisateur **sudo**.
- Le domaine **`sentinet.devantiq.com`** pointant vers l'IP publique du VPS.
- Les ports **80** et **443** ouverts (et **22** pour SSH).

### DNS
Créer un enregistrement **A** (et **AAAA** si IPv6) chez ton registrar :

```
sentinet   A   <IP_PUBLIQUE_DU_VPS>
```

Vérifier la propagation : `dig +short sentinet.devantiq.com`

---

## 1. Dépendances système

> ⚠️ **Serveur partagé** : Node (v22), nginx et certbot sont **déjà installés et
> utilisés par d'autres applications**. Ne PAS les réinstaller, ne PAS lancer
> `apt upgrade` (risque de redémarrer d'autres services). Seul **PM2** manque.

```bash
# PM2 — le seul composant à installer (sans impact sur l'existant)
sudo npm install -g pm2

# Outils réseau de la collecte (présents par défaut sur Ubuntu)
command -v ss && command -v ip && command -v ping

node -v && nginx -v && pm2 -v   # vérifications
```

---

## 2. Récupérer le code

```bash
sudo git clone https://github.com/Scouzy/SentiNet.git /var/www/sentinet
sudo chown -R $USER:$USER /var/www/sentinet
cd /var/www/sentinet/sentinet-app
```

---

## 3. Configurer l'environnement

```bash
cp .env.example .env
nano .env
```

Renseigner au minimum :

```ini
HOST=127.0.0.1
PORT=3010
CORS_ORIGIN=https://sentinet.devantiq.com
NODE_ENV=production
FIREWALL_ENFORCE=false
PSEUDONYM_SALT=<valeur_aléatoire_longue>
SESSION_SECRET=<valeur_aléatoire_longue>
```

Générer une valeur aléatoire : `openssl rand -hex 32`

> `ecosystem.config.cjs` définit déjà `HOST`, `PORT`, `CORS_ORIGIN` et
> `FIREWALL_ENFORCE` pour PM2 ; le `.env` sert de complément (secrets) et pour
> un lancement manuel via `npm start`. Garde les deux cohérents.

---

## 4. Installer et construire

```bash
cd /var/www/sentinet/sentinet-app
npm install
npm run build        # génère le dossier dist/ servi par nginx
```

---

## 5. Lancer le backend avec PM2

Le fichier `ecosystem.config.cjs` est déjà fourni.

```bash
cd /var/www/sentinet/sentinet-app
pm2 start ecosystem.config.cjs
pm2 save                     # sauvegarde la liste des process
pm2 startup                  # affiche une commande sudo à copier-coller
#   → exécuter la commande sudo affichée pour un redémarrage auto au boot

pm2 status                   # doit montrer sentinet-api : online
pm2 logs sentinet-api        # vérifier le démarrage (Ctrl+C pour quitter)
```

Test local du backend :

```bash
curl -s http://127.0.0.1:3010/api/system/info | head
```

---

## 6. Configurer nginx

```bash
sudo cp /var/www/sentinet/deploy/nginx-sentinet.conf \
        /etc/nginx/sites-available/sentinet.devantiq.com
sudo ln -s /etc/nginx/sites-available/sentinet.devantiq.com \
           /etc/nginx/sites-enabled/

sudo nginx -t                # test de la configuration
sudo systemctl reload nginx  # reload (pas restart) → zéro coupure pour les autres sites
```

> ⚠️ **Ne pas** supprimer `sites-enabled/default` ni modifier les vhosts
> existants (`devantiq`, `livemonitor`, `n8n`, `omniroute`…). nginx aiguille par
> `server_name` : le nouveau vhost cohabite sans les affecter.

À ce stade, `http://sentinet.devantiq.com` doit déjà afficher l'application.

---

## 7. Activer HTTPS (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d sentinet.devantiq.com
#   → suivre l'assistant (email, redirection HTTP→HTTPS : choisir « oui »)
```

Certbot ajoute automatiquement le bloc `listen 443 ssl` et le renouvellement
automatique. Vérifier : `sudo certbot renew --dry-run`

> Après HTTPS, le WebSocket bascule tout seul en `wss://` (corrigé côté
> frontend), aucune action supplémentaire.

---

## 8. Blocage pare-feu — mode sûr sur serveur partagé

Le blocage d'une IP peut appliquer des règles `iptables`. Sur **ce serveur**
(partagé, avec ufw actif qui gère déjà iptables), le comportement par défaut est
volontairement prudent :

- **`FIREWALL_ENFORCE=false` (défaut recommandé ici)** : les blocages sont
  **journalisés et suivis** (`fwStatus: "tracked"`) mais **n'altèrent jamais** le
  pare-feu de l'hôte. Aucun risque d'interférence avec ufw ou tes autres
  applications. Toutes les autres fonctions marchent normalement.
- **`FIREWALL_ENFORCE=true` (à éviter sur serveur mutualisé)** : SentiNet
  insère réellement des règles `DROP` dans `iptables`. À ne réserver qu'à un
  serveur dédié, en connaissance de cause, car cela s'ajoute aux chaînes gérées
  par ufw. Le process doit alors tourner avec les privilèges réseau (root, ce
  qui est déjà le cas ici, ou `setcap cap_net_admin,cap_net_raw+ep $(which node)`).

### Pare-feu du VPS (ufw) — aucune modification nécessaire

Ton ufw autorise déjà **80/443** (et 22). Le backend écoute uniquement sur
**127.0.0.1:3010** (jamais exposé), donc **rien à ouvrir**. Ne touche pas à ufw.

---

## 9. Mettre à jour l'application

```bash
cd /var/www/sentinet
git pull
cd sentinet-app
npm install          # si dépendances modifiées
npm run build        # reconstruit le frontend
pm2 reload sentinet-api
```

---

## 10. Dépannage

| Symptôme | Piste |
|---|---|
| Page blanche | Vérifier `root` dans nginx = `.../sentinet-app/dist` et que `npm run build` a réussi. |
| 502 Bad Gateway | Le backend n'est pas lancé : `pm2 status`, `pm2 logs sentinet-api`. |
| WebSocket déconnecté | Vérifier le bloc `location /ws` (Upgrade/Connection) et que certbot a bien activé 443. |
| Données réseau vides | Normal si trafic faible ; vérifier que `ss` et `ip` sont installés (`iproute2`). |
| Blocage sans effet | Privilèges insuffisants : voir §8 (mode « tracked » attendu sinon). |
| Certbot échoue | DNS pas encore propagé, ou ports 80/443 fermés au niveau du fournisseur. |

---

## Récapitulatif des chemins

| Élément | Chemin |
|---|---|
| Code source | `/var/www/sentinet` |
| Application | `/var/www/sentinet/sentinet-app` |
| Frontend servi | `/var/www/sentinet/sentinet-app/dist` |
| Config PM2 | `/var/www/sentinet/sentinet-app/ecosystem.config.cjs` |
| Variables d'env | `/var/www/sentinet/sentinet-app/.env` |
| Config nginx | `/etc/nginx/sites-available/sentinet.devantiq.com` |
| Backend (interne) | `http://127.0.0.1:3010` |
| URL publique | `https://sentinet.devantiq.com` |
