import { lazy, Suspense } from 'react'

// The demo panels (and the seed data they import) are only part of the demo build.
const Banner = __DEMO__ ? lazy(() => import('./DemoPanels').then((m) => ({ default: m.DemoBanner }))) : null
const Logins = __DEMO__ ? lazy(() => import('./DemoPanels').then((m) => ({ default: m.DemoLogins }))) : null

export function DemoBannerLazy() {
  return Banner ? <Suspense fallback={null}><Banner /></Suspense> : null
}

export function DemoLoginsLazy(props) {
  return Logins ? <Suspense fallback={null}><Logins {...props} /></Suspense> : null
}
