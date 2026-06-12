import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    cssMinify: false,
  },
  server: {
    proxy: {
      '/golf-proxy': {
        target: 'https://service.golfleague.net',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/golf-proxy/, ''),
      },
    },
  },
})
