// Picks the back end at build time: the in-browser demo (VITE_DEMO / `npm run build:pages`) or the real API.
// Both implement the same methods (see API_METHODS in ./shared.js); the demo module is only
// bundled when the demo flag is set.
import { API_METHODS } from './shared'

let implPromise

function load() {
  if (!implPromise) {
    implPromise = __DEMO__
      ? import('./demo/demoApi.js').then((m) => m.default)
      : import('./http.js').then((m) => m.default)
  }
  return implPromise
}

export const api = Object.fromEntries(
  API_METHODS.map((name) => [name, async (...args) => (await load())[name](...args)]),
)

export { ApiError } from './shared'
