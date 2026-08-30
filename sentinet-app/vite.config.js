import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5210,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:3010', changeOrigin: true },
      '/ws':  { target: 'ws://localhost:3010',  ws: true, configure: (proxy) => { proxy.on('error', () => {}) } },
    },
  },
})
