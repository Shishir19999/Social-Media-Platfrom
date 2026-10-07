import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// `vite build --mode pages` (npm run build:pages) produces the browser-only demo for GitHub Pages:
// in-browser demo backend, hash routing and the repository sub-path as base.
// VITE_DEMO=true enables the demo backend for any other mode (e.g. the dev server) as well.
const PAGES_BASE = '/Social-Media-Platfrom/'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const pages = mode === 'pages'
  const demo = pages || mode === 'demo' || env.VITE_DEMO === 'true' || process.env.VITE_DEMO === 'true'
  return {
    base: pages ? PAGES_BASE : '/',
    plugins: [react()],
    define: { __DEMO__: JSON.stringify(demo) },
    test: { environment: 'node', include: ['src/**/*.test.js'] },
  }
})
