import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

let openCount = 0

/** Accessible modal: labelled dialog, focus trap, Esc to close, focus restored on close, page scroll locked. */
export default function Modal({
  title, onClose, children, size = 'md', role = 'dialog', hideTitle = false, className = '', closeLabel = 'Close dialog',
}) {
  const ref = useRef(null)
  const titleId = useId()
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })

  useEffect(() => {
    const previous = document.activeElement
    openCount += 1
    document.body.classList.add('modal-open')
    const root = ref.current
    const target = root.querySelector('[data-initial-focus]') || root.querySelector(FOCUSABLE) || root
    target.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current() }
      if (e.key !== 'Tab') return
      const items = [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (!items.length) { e.preventDefault(); root.focus(); return }
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      openCount -= 1
      if (openCount === 0) document.body.classList.remove('modal-open')
      if (previous && previous.isConnected) previous.focus()
    }
  }, [])

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div
        ref={ref}
        className={`modal modal-${size} ${className}`}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className={`modal-head ${hideTitle ? 'sr-only-head' : ''}`}>
          <h2 id={titleId} className={hideTitle ? 'sr-only' : 'modal-title'}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={closeLabel}>
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
