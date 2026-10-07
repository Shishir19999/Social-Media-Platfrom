import { useEffect, useId, useRef, useState } from 'react'
import Icon from './Icon'

/**
 * Small action menu (kebab button). items: [{label, icon, onSelect, danger}] ; falsy entries are skipped.
 * Keyboard: Enter/Space/ArrowDown opens, arrows move, Home/End jump, Esc closes and returns focus.
 */
export default function Menu({ label, items, icon = 'more', align = 'right' }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef(null)
  const btn = useRef(null)
  const id = useId()
  const list = items.filter(Boolean)

  useEffect(() => {
    if (!open) return undefined
    wrap.current.querySelector('[role="menuitem"]')?.focus()
    const onDoc = (e) => { if (!wrap.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const onKeyDown = (e) => {
    const els = [...wrap.current.querySelectorAll('[role="menuitem"]')]
    const i = els.indexOf(document.activeElement)
    if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current.focus() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else els[(i + 1) % els.length]?.focus() }
    else if (e.key === 'ArrowUp' && open) { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus() }
    else if (e.key === 'Home' && open) { e.preventDefault(); els[0]?.focus() }
    else if (e.key === 'End' && open) { e.preventDefault(); els[els.length - 1]?.focus() }
    else if (e.key === 'Tab' && open) setOpen(false)
  }

  return (
    <div className="menu" ref={wrap} onKeyDown={onKeyDown}>
      <button
        ref={btn}
        type="button"
        className="icon-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name={icon} />
      </button>
      {open && (
        <div className={`menu-list menu-${align}`} id={id} role="menu" aria-label={label}>
          {list.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={`menu-item ${item.danger ? 'menu-danger' : ''}`}
              onClick={() => { setOpen(false); btn.current.focus(); item.onSelect() }}
            >
              {item.icon && <Icon name={item.icon} size={18} />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
