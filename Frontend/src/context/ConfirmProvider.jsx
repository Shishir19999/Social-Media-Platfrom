import { useCallback, useMemo, useRef, useState } from 'react'
import { ConfirmContext } from './contexts'
import Modal from '../components/Modal'

export default function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null)
  const resolver = useRef(null)

  const confirm = useCallback((options) => new Promise((resolve) => {
    resolver.current = resolve
    setDialog(options)
  }), [])

  const close = (answer) => {
    resolver.current?.(answer)
    resolver.current = null
    setDialog(null)
  }

  const value = useMemo(() => confirm, [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {dialog && (
        <Modal title={dialog.title} onClose={() => close(false)} size="sm" role="alertdialog" initialFocus="cancel">
          <p className="modal-text">{dialog.message}</p>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" data-initial-focus onClick={() => close(false)}>
              {dialog.cancelLabel || 'Cancel'}
            </button>
            <button type="button" className={`btn ${dialog.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)}>
              {dialog.confirmLabel || 'Confirm'}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  )
}
