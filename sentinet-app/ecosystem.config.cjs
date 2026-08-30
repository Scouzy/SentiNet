// Configuration PM2 — SentiNet API (backend Node.js/Express + WebSocket)
// Lancement :  pm2 start ecosystem.config.cjs
// (fichier en .cjs car package.json déclare "type": "module")

module.exports = {
  apps: [
    {
      name: 'sentinet-api',
      script: './server/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        // N'écoute que sur la boucle locale : le backend n'est joignable que via nginx
        HOST: '127.0.0.1',
        PORT: 3010,
        // Origine autorisée pour CORS — doit correspondre à l'URL publique
        CORS_ORIGIN: 'https://sentinet.devantiq.com',
        // Blocage iptables réel : 'false' = mode sûr (n'altère pas le pare-feu de l'hôte).
        // Mettre 'true' seulement si tu veux que SentiNet applique les blocages au niveau OS.
        FIREWALL_ENFORCE: 'false',
      },
    },
  ],
}
