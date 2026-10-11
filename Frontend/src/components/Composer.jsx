import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { useAuth, useToast } from '../context/contexts'
import { fullDate } from '../lib/format'
import { LIMITS, POLL_DURATIONS, validatePost } from '../lib/rules'
import { POST_LIMIT, MAX_IMAGES, validateImage } from '../lib/validate'
import Avatar from './Avatar'
import Icon from './Icon'
import MentionTextarea from './MentionTextarea'
import { QuotedPost } from './PostParts'

const draftKey = (id) => `orbit_draft_${id}`
const DURATION_LABELS = { '1h': '1 hour', '1d': '1 day', '3d': '3 days', '7d': '7 days' }

function loadDraft(id) {
  try { return localStorage.getItem(draftKey(id)) || '' } catch { return '' }
}

// value for <input type="datetime-local"> a few minutes from now
const localInput = (ms) => {
  const d = new Date(ms - new Date().getTimezoneOffset() * 60000)
  return d.toISOString().slice(0, 16)
}

/**
 * Post composer: text with @mention autocomplete, photos (pick, drop or paste), poll, schedule and drafts.
 * With `quote` it writes a quote post about that post. `onPosted(post)` fires for published posts,
 * `onSaved(post)` for drafts and scheduled posts.
 */
export default function Composer({ onPosted, onSaved, quote = null, autoFocus = false }) {
  const { user } = useAuth()
  const toast = useToast()
  const uid = useId()
  const [text, setText] = useState(() => (quote ? '' : loadDraft(user.id)))
  const [files, setFiles] = useState([])
  const [poll, setPoll] = useState(null)
  const [schedule, setSchedule] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dragging, setDragging] = useState(false)
  const input = useRef(null)
  const [minWhen] = useState(() => localInput(Date.now() + 2 * 60000))

  // draft autosave (local to this device), debounced
  useEffect(() => {
    if (quote) return undefined
    const t = setTimeout(() => {
      try {
        if (text) { localStorage.setItem(draftKey(user.id), text); setSaved(true) }
        else { localStorage.removeItem(draftKey(user.id)); setSaved(false) }
      } catch { /* storage unavailable */ }
    }, 500)
    return () => clearTimeout(t)
  }, [text, user.id, quote])

  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])

  const left = POST_LIMIT - text.length
  const over = left < 0

  const addFiles = (picked) => {
    const images = picked.filter((f) => f.type.startsWith('image/'))
    if (!images.length) return
    const problem = images.map(validateImage).find(Boolean)
    if (problem) { setError(problem); return }
    if (files.length + images.length > MAX_IMAGES) { setError(`You can attach up to ${MAX_IMAGES} images.`); return }
    if (poll) { setError('A post can have a poll or images, not both.'); return }
    setError('')
    setFiles((f) => [...f, ...images])
  }

  const pick = (e) => {
    const picked = [...e.target.files]
    e.target.value = ''
    addFiles(picked)
  }

  const onPaste = (e) => {
    const images = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'))
    if (images.length) { e.preventDefault(); addFiles(images) }
  }

  const togglePoll = () => {
    if (poll) { setPoll(null); return }
    if (files.length) { setError('A post can have a poll or images, not both.'); return }
    setError('')
    setPoll({ options: ['', ''], duration: '1d' })
  }

  const cleanPoll = () => (poll ? { options: poll.options.map((o) => o.trim()).filter(Boolean), duration: poll.duration } : undefined)

  const send = async (status) => {
    const scheduleAt = status === 'scheduled' && schedule ? new Date(schedule).getTime() : undefined
    const problem = validatePost({ text, poll: cleanPoll(), images: files.length, scheduleAt, status })
    if (problem) { setError(problem); return }
    if (quote && !text.trim()) { setError('Add your comment to quote this post.'); return }
    setBusy(true)
    setError('')
    try {
      const created = await api.createPost({ text: text.trim(), images: files, poll: cleanPoll(), quoteOf: quote?.id, status, scheduleAt })
      setText('')
      setFiles([])
      setPoll(null)
      setSchedule(null)
      if (!quote) { try { localStorage.removeItem(draftKey(user.id)) } catch { /* ignore */ } }
      setSaved(false)
      if (status === 'published') { toast.success(quote ? 'Quote posted.' : 'Posted.'); onPosted?.(created) }
      else {
        toast.success(status === 'draft' ? 'Draft saved. Find it on your profile under Drafts.' : `Scheduled for ${fullDate(scheduleAt)}.`)
        onSaved?.(created)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const submit = (e) => { e.preventDefault(); send(schedule ? 'scheduled' : 'published') }

  const hasContent = !!text.trim() || !!poll || files.length > 0

  return (
    <form
      className={`card composer ${dragging ? 'composer-drop' : ''}`}
      onSubmit={submit}
      noValidate
      onDragOver={(e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDragging(true) } }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles([...e.dataTransfer.files]) }}
    >
      <div className="composer-row">
        <Avatar user={user} size={44} />
        <div className="grow">
          <label htmlFor={`${uid}-text`} className="sr-only">{quote ? 'Add your comment' : 'Write a post'}</label>
          <MentionTextarea
            id={`${uid}-text`}
            className="composer-text"
            rows={quote ? 2 : 3}
            value={text}
            autoFocus={autoFocus}
            placeholder={quote ? 'Add your comment...' : 'What is on your mind? Use #hashtags and @mentions.'}
            onChange={(v) => { setText(v); setError('') }}
            onPaste={onPaste}
            aria-invalid={over || !!error}
            aria-describedby={`${uid}-err`}
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
          {poll && (
            <fieldset className="poll-builder">
              <legend>Poll</legend>
              {poll.options.map((o, i) => (
                <div className="row poll-builder-row" key={i}>
                  <label htmlFor={`${uid}-opt${i}`} className="sr-only">Option {i + 1}</label>
                  <input id={`${uid}-opt${i}`} value={o} maxLength={LIMITS.pollOption} placeholder={`Option ${i + 1}`} onChange={(e) => setPoll((p) => ({ ...p, options: p.options.map((x, n) => (n === i ? e.target.value : x)) }))} />
                  {poll.options.length > LIMITS.pollOptionsMin && (
                    <button type="button" className="icon-btn icon-btn-sm" aria-label={`Remove option ${i + 1}`} onClick={() => setPoll((p) => ({ ...p, options: p.options.filter((_, n) => n !== i) }))}><Icon name="x" size={14} /></button>
                  )}
                </div>
              ))}
              <div className="row poll-builder-foot">
                {poll.options.length < LIMITS.pollOptionsMax && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPoll((p) => ({ ...p, options: [...p.options, ''] }))}><Icon name="plus" size={16} /> Add option</button>
                )}
                <label htmlFor={`${uid}-dur`} className="muted poll-dur-label">Runs for</label>
                <select id={`${uid}-dur`} value={poll.duration} onChange={(e) => setPoll((p) => ({ ...p, duration: e.target.value }))}>
                  {Object.keys(POLL_DURATIONS).map((d) => <option key={d} value={d}>{DURATION_LABELS[d]}</option>)}
                </select>
              </div>
            </fieldset>
          )}
          {schedule !== null && (
            <div className="row schedule-row">
              <label htmlFor={`${uid}-when`}><Icon name="clock" size={16} /> Publish at</label>
              <input id={`${uid}-when`} type="datetime-local" value={schedule} min={minWhen} onChange={(e) => { setSchedule(e.target.value); setError('') }} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSchedule(null)}>Post now instead</button>
            </div>
          )}
          {quote && <QuotedPost post={quote} />}
          <p id={`${uid}-err`} className="field-error" role="alert">{error}</p>
        </div>
      </div>
      <div className="composer-bar">
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={pick} aria-label="Choose images" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => input.current.click()} disabled={files.length >= MAX_IMAGES || !!poll}>
          <Icon name="image" size={18} /> Photos {files.length > 0 && `(${files.length}/${MAX_IMAGES})`}
        </button>
        {!quote && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={togglePoll} aria-pressed={!!poll} disabled={files.length > 0}>
            <Icon name="poll" size={18} /> Poll
          </button>
        )}
        {!quote && (
          <button type="button" className="btn btn-ghost btn-sm" aria-pressed={schedule !== null} onClick={() => setSchedule((s) => (s === null ? localInput(Date.now() + 60 * 60000) : null))}>
            <Icon name="calendar" size={18} /> Schedule
          </button>
        )}
        <span className="muted draft-note" aria-live="polite">{saved && text && !quote ? 'Draft saved' : ''}</span>
        <span className={`counter ${over ? 'counter-over' : left <= 40 ? 'counter-warn' : ''}`} aria-live="polite">
          {left}<span className="sr-only"> characters left</span>
        </span>
        {!quote && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => send('draft')} disabled={busy || !hasContent}>Save draft</button>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy || over || !hasContent}>
          {busy ? 'Working...' : schedule ? 'Schedule' : quote ? 'Quote' : 'Post'}
        </button>
      </div>
    </form>
  )
}
