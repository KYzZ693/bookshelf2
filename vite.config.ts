import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Static hosts such as GitHub Pages do not know about client-side routes.
 * Copying index.html to 404.html makes every unknown path boot the SPA,
 * which then resolves the route (and any ?code= OAuth callback) itself.
 */
function spaFallback(): Plugin {
  return {
    name: 'spa-404-fallback',
    apply: 'build',
    closeBundle() {
      const out = resolve(import.meta.dirname, 'dist')
      const index = resolve(out, 'index.html')
      if (existsSync(index)) copyFileSync(index, resolve(out, '404.html'))
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // e.g. "/Bookshelf/" for https://<user>.github.io/Bookshelf/
  const base = env.VITE_BASE_PATH || '/'

  return {
    base,
    plugins: [react(), tailwindcss(), spaFallback()],
    resolve: {
      alias: { '@': resolve(import.meta.dirname, 'src') },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined
            if (id.includes('@supabase')) return 'supabase'
            if (id.includes('framer-motion') || id.includes('motion-dom') || id.includes('motion-utils')) return 'motion'
            if (id.includes('react-router') || id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) return 'react'
            if (id.includes('@tanstack')) return 'query'
            return undefined
          },
        },
      },
    },
  }
})
