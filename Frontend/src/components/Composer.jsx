import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { useAuth, useToast } from '../context/contexts'
import { POST_LIMIT, MAX_IMAGES, validateImage } from '../lib/validate'
import Avatar from './Avatar'
import Icon from './Icon'

const draftKey = (id) => `orbit_draft_${id}`

function loadDraft(id) {
  try { return localStorage.getItem(draftKey(id)) || '' } catch { return '' }
}

export default function Composer({ onPosted }) {
  const { user } = useAuth()
  const toast = useToast()
  const [text, setText] = useState(() => loadDraft(user.id))
  const [files, setFiles] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const input = useRef(null)

  // draft autosave, debounced
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (text) { localStorage.setItem(draftKey(user.id), text); setSaved(true) }
        else { localStorage.removeItem(draftKey(user.id)); setSaved(false) }
      } catch { /* storage unavailable */ }
    }, 500)
    return () => clearTimeout(t)
  }, [text, user.id])

  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])

  const left = POST_LIMIT - text.length
  const over = left < 0

  const pick = (e) => {
    const picked = [...e.target.files]
    e.target.value = ''
    const problem = picked.map(validateImage).find(Boolean)
    if (problem) { setError(problem); return }
    if (files.length + picked.length > MAX_IMAGES) { setError(`You can attach up to ${MAX_IMAGES} images.`); return }
    setError('')
    setFiles((f) => [...f, ...picked])
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!text.trim()) { setError('Write something before posting.'); return }
    if (over) { setError(`Posts are limited to ${POST_LIMIT} characters.`); return }
    setBusy(true)
    setError('')
    try {
      const post = await api.createPost({ text: text.trim(), images: files })
      setText('')
      setFiles([])
      try { localStorage.removeItem(draftKey(user.id)) } catch { /* ignore */ }
      setSaved(false)
      toast.success('Posted.')
      onPosted?.(post)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card composer" onSubmit={submit} noValidate>
      <div className="composer-row">
        <Avatar user={user} size={44} />
        <div className="grow">
          <label htmlFor="composer-text" className="sr-only">Write a post</label>
          <textarea
            id="composer-text"
            className="composer-text"
            rows={3}
            value={text}
            placeholder="What is on your mind? Use #hashtags and @mentions."
            onChange={(e) => { setText(e.target.value); setError('') }}
            aria-invalid={over || !!error}
          />
          {urls.length > 0 && (
            <ul className="composer-previews" aria-label="Attached images">
              {urls.map((u, i) => (
                <li key={u}>
                  <img src={u} alt={`Attachment ${i + 1}`} />
                  <button type="button" className="icon-btn icon-btn-sm preview-x" aria-label={`Remove image ${i + 1}`} onClick={() => setFiles((f) => f.filter((_, n) => n !== i))}>
                    <Icon name="x" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="field-error" role="alert">{error}</p>
        </div>
      </div>
      <div className="composer-bar">
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={pick} aria-label="Choose images" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => input.current.click()} disabled={files.length >= MAX_IMAGES}>
          <Icon name="image" size={18} /> Photos {files.length > 0 && `(${files.length}/${MAX_IMAGES})`}
        </button>
        <span className="muted draft-note" aria-live="polite">{saved && text ? 'Draft saved' : ''}</span>
        <span className={`counter ${over ? 'counter-over' : left <= 40 ? 'counter-warn' : ''}`} aria-live="polite">
          {left}<span className="sr-only"> characters left</span>
        </span>
        <button type="submit" className="btn btn-primary" disabled={busy || over}>{busy ? 'Posting...' : 'Post'}</button>
      </div>
    </form>
  )
}
