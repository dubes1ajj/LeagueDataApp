import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = fileURLToPath(new URL('.', import.meta.url))

function esToolkitCompatModule(name: string): string {
  return path.resolve(workspaceRoot, `src/shims/esToolkitCompat/${name}.ts`)
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: 'es-toolkit/compat/get', replacement: esToolkitCompatModule('get') },
      { find: 'es-toolkit/compat/isPlainObject', replacement: esToolkitCompatModule('isPlainObject') },
      { find: 'es-toolkit/compat/last', replacement: esToolkitCompatModule('last') },
      { find: 'es-toolkit/compat/maxBy', replacement: esToolkitCompatModule('maxBy') },
      { find: 'es-toolkit/compat/minBy', replacement: esToolkitCompatModule('minBy') },
      { find: 'es-toolkit/compat/omit', replacement: esToolkitCompatModule('omit') },
      { find: 'es-toolkit/compat/range', replacement: esToolkitCompatModule('range') },
      { find: 'es-toolkit/compat/sortBy', replacement: esToolkitCompatModule('sortBy') },
      { find: 'es-toolkit/compat/sumBy', replacement: esToolkitCompatModule('sumBy') },
      { find: 'es-toolkit/compat/throttle', replacement: esToolkitCompatModule('throttle') },
      { find: 'es-toolkit/compat/uniqBy', replacement: esToolkitCompatModule('uniqBy') },
    ],
  },
  build: {
    minify: false,
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
