import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react'
import { api } from '../api'
import Avatar from './Avatar'

// The @word being typed right before the caret, if any
function activeMention(value, caret) {
  const m = /(?:^|[^\p{L}\p{N}_])@([A-Za-z0-9_]{0,30})$/u.exec(value.slice(0, caret))
  return m ? { query: m[1], start: caret - m[1].length - 1 } : null
}

/**
 * Textarea with @mention autocomplete (ARIA autocomplete + listbox). Arrow keys move, Enter or Tab pick,
 * Escape closes. Everything else is a normal textarea; extra props go to the textarea.
 */
const MentionTextarea = forwardRef(function MentionTextarea({ value, onChange, ...rest }, ref) {
  const area = useRef(null)
  const listId = useId()
  const [mention, setMention] = useState(null)
  const [users, setUsers] = useState([])
  const [active, setActive] = useState(0)
  useImperativeHandle(ref, () => area.current)

  useEffect(() => {
    if (!mention) return undefined
    let live = true
    const t = setTimeout(() => {
      api.searchUsers(mention.query).then((list) => { if (live) { setUsers(list); setActive(0) } }).catch(() => { if (live) setUsers([]) })
    }, 120)
    return () => { live = false; clearTimeout(t) }
  }, [mention])

  const open = !!mention && users.length > 0

  const update = (el) => setMention(activeMention(el.value, el.selectionStart))

  const pick = (u) => {
    const el = area.current
    const caret = el.selectionStart
    const next = `${value.slice(0, mention.start)}@${u.username} ${value.slice(caret)}`
    onChange(next)
    setMention(null)
    setUsers([])
    requestAnimationFrame(() => {
      const pos = mention.start + u.username.length + 2
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  const onKeyDown = (e) => {
    if (open) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % users.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + users.length) % users.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(users[active]); return }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMention(null); return }
    }
    rest.onKeyDown?.(e)
  }

  return (
    <div className="mention-wrap">
      <textarea
        {...rest}
        ref={area}
        value={value}
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onChange={(e) => { onChange(e.target.value); update(e.target) }}
        onKeyUp={(e) => { if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) update(e.target) }}
        onClick={(e) => update(e.target)}
        onBlur={() => setTimeout(() => setMention(null), 150)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul className="mention-list" id={listId} role="listbox" aria-label="People to mention">
          {users.map((u, i) => (
            <li key={u.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={`mention-option ${i === active ? 'mention-active' : ''}`} onMouseDown={(e) => { e.preventDefault(); pick(u) }}>
              <Avatar user={u} size={28} />
              <span className="grow min0"><strong>{u.displayName}</strong> <span className="muted">@{u.username}</span></span>
            </li>
          ))}
        </ul>
      )}
      <span className="sr-only" role="status" aria-live="polite">{open ? `${users.length} people to mention. Use the arrow keys.` : ''}</span>
    </div>
  )
})

export default MentionTextarea
