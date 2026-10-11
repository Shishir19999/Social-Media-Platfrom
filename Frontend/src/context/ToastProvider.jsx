import { useCallback, useMemo, useRef, useState } from 'react'
import { ToastContext } from './contexts'
import Icon from '../components/Icon'

let nextId = 1

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const push = useCallback((kind, message, ms = 4500, action = null) => {
    const id = nextId++
    setToasts((list) => [...list.slice(-3), { id, kind, message, action }])
    timers.current.set(id, setTimeout(() => dismiss(id), ms))
    return id
  }, [dismiss])

  const api = useMemo(() => ({
    success: (m) => push('success', m),
    error: (m) => push('error', m, 7000),
    info: (m, action) => push('info', m, 6000, action),
    dismiss,
  }), [push, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" role="region" aria-label="Status messages">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <Icon name={t.kind === 'error' ? 'alert' : t.kind === 'success' ? 'check' : 'info'} />
            <span className="toast-msg">{t.message}</span>
            {t.action && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { t.action.onClick(); dismiss(t.id) }}>{t.action.label}</button>}
            <button type="button" className="icon-btn icon-btn-sm" aria-label="Dismiss message" onClick={() => dismiss(t.id)}>
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
