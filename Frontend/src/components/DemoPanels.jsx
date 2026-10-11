import { useState } from 'react'
import { api } from '../api'
import { useAuth, useToast } from '../context/contexts'
import { DEMO_LOGINS, DEMO_PASSWORD } from '../api/demo/seed'
import Icon from './Icon'

/** Quick-fill buttons for the sample accounts (only bundled in the Live preview build). */
export function DemoLogins({ onPick }) {
  return (
    <div className="demo-logins" role="group" aria-label="Sample accounts">
      <p className="demo-logins-title"><Icon name="info" size={16} /> Sample accounts</p>
      <p className="muted">Password for all: <code>{DEMO_PASSWORD}</code>. Open the page in two tabs and sign in as two people to chat live.</p>
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
      toast.success('Live preview data reset.')
      window.location.reload()
    } catch (err) {
      toast.error(err.message)
      setBusy(false)
    }
  }
  return (
    <div className="demo-banner" role="region" aria-label="Live preview">
      <span><strong>Live preview</strong> · everything runs in your browser and is stored on this device only.</span>
      <button type="button" className="link-btn" onClick={reset} disabled={busy}>Reset data</button>
    </div>
  )
}
