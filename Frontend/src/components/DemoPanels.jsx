import { useState } from 'react'
import { api } from '../api'
import { useAuth, useToast } from '../context/contexts'
import { DEMO_LOGINS, DEMO_PASSWORD } from '../api/demo/seed'
import Icon from './Icon'

/** Quick-fill buttons for the documented demo accounts (only bundled in the demo build). */
export function DemoLogins({ onPick }) {
  return (
    <div className="demo-logins" role="group" aria-label="Demo accounts">
      <p className="demo-logins-title"><Icon name="info" size={16} /> Demo accounts</p>
      <p className="muted">Password for all: <code>{DEMO_PASSWORD}</code></p>
      <ul>
        {DEMO_LOGINS.map((l) => (
          <li key={l.username}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPick(l.username, DEMO_PASSWORD)}>
              Use <strong>{l.username}</strong>
            </button>
            <span className="muted"> {l.note}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function DemoBanner() {
  const { logout } = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const reset = async () => {
    setBusy(true)
    try {
      await api.resetDemo()
      await logout()
      toast.success('Demo data reset.')
      window.location.reload()
    } catch (err) {
      toast.error(err.message)
      setBusy(false)
    }
  }
  return (
    <div className="demo-banner" role="region" aria-label="Demo mode">
      <span><strong>Demo mode</strong> · everything runs in your browser and is stored on this device only.</span>
      <button type="button" className="link-btn" onClick={reset} disabled={busy}>Reset demo data</button>
    </div>
  )
}
