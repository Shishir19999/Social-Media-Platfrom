# Orbit frontend

React 19 + Vite 8. See the [project README](../README.md) for features, roles, the API and how to run everything.

```bash
npm install
npm run dev            # real mode: talks to the API at VITE_API_URL (default http://localhost:5000)
npm run dev:demo       # Live preview: in-browser backend, no server needed
npm run build:pages    # static Live preview build for GitHub Pages (hash routing, base /Social-Media-Platfrom/)
npm test               # vitest: Live preview backend, shared rules, helpers
npm run lint
```

Layout: `src/api` (`http.js` real client, `demo/` in-browser backend, `realtime.js` live updates), `src/lib/rules.js` (rules shared with the API, generated from `Backend/lib/rules.js`), `src/components`, `src/pages`, `src/context`, `src/styles/main.css`.
