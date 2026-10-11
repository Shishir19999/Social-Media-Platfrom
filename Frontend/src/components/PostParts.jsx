import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useToast } from '../context/contexts'
import { useRequireAuth } from '../hooks/useRequireAuth'
import { fullDate, plural, timeAgo, timeUntil } from '../lib/format'
import { LIMITS, REACTIONS, REPORT_REASONS } from '../lib/rules'
import Avatar from './Avatar'
import Icon from './Icon'
import Modal from './Modal'
import RichText from './RichText'

export function RoleBadge({ role }) {
  if (role !== 'admin' && role !== 'moderator') return null
  return <span className={`role-badge role-${role}`}>{role === 'admin' ? 'Admin' : 'Mod'}</span>
}

export function ImageGrid({ images, onOpen }) {
  const shown = images.slice(0, 4)
  return (
    <div className={`img-grid img-grid-${shown.length}`}>
      {shown.map((src, i) => (
        <button key={src.slice(-40) + i} type="button" className="img-cell" onClick={() => onOpen(i)} aria-label={`Open image ${i + 1} of ${images.length}`}>
          <img src={src} alt="" loading="lazy" />
          {i === 3 && images.length > 4 && <span className="img-more">+{images.length - 4}</span>}
        </button>
      ))}
    </div>
  )
}

/** Small link card built from the first URL of a post (no request is made to the other site). */
export function LinkCard({ link }) {
  if (!link) return null
  return (
    <a className="link-card" href={link.url} target="_blank" rel="noreferrer noopener">
      <span className="link-card-ico"><Icon name="link" size={20} /></span>
      <span className="grow min0">
        <span className="link-card-title ellipsis">{link.title}</span>
        <span className="muted link-card-host ellipsis">{link.host}</span>
      </span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

/** The original post inside a quote or repost. */
export function QuotedPost({ post }) {
  if (!post) return null
  if (post.unavailable) {
    return <div className="quoted quoted-gone muted"><Icon name="alert" size={16} /> This post is not available.</div>
  }
  return (
    <Link to={`/post/${post.id}`} className="quoted" aria-label={`Quoted post by ${post.author.displayName}`}>
      <span className="row quoted-head">
        <Avatar user={post.author} size={22} />
        <strong>{post.author.displayName}</strong>
        <span className="muted">@{post.author.username} · {timeAgo(post.createdAt)}</span>
      </span>
      {post.text && <span className="quoted-text">{post.text}</span>}
      {post.poll && <span className="muted"><Icon name="poll" size={14} /> Poll</span>}
      {post.images.length > 0 && <img className="quoted-img" src={post.images[0]} alt="" loading="lazy" />}
    </Link>
  )
}

export function Poll({ post, onChange }) {
  const poll = post.poll
  const toast = useToast()
  const guard = useRequireAuth()
  const [busy, setBusy] = useState(false)
  const canVote = !poll.ended && !poll.myVote
  const vote = async (optionId) => {
    if (!guard()) return
    setBusy(true)
    try {
      onChange(await api.votePoll(post.id, optionId))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="poll" role="group" aria-label="Poll">
      <ul className="poll-list">
        {poll.options.map((o) => {
          const pct = poll.total ? Math.round((o.votes / poll.total) * 100) : 0
          const mine = poll.myVote === o.id
          return (
            <li key={o.id}>
              {canVote ? (
                <button type="button" className="poll-option poll-vote" onClick={() => vote(o.id)} disabled={busy}>{o.text}</button>
              ) : (
                <div className={`poll-option poll-result ${mine ? 'poll-mine' : ''}`}>
                  <span className="poll-bar" style={{ width: `${pct}%` }} aria-hidden="true" />
                  <span className="poll-text">{o.text}{mine && <><Icon name="check" size={14} /><span className="sr-only"> (your vote)</span></>}</span>
                  <span className="poll-pct">{pct}%<span className="sr-only">, {plural(o.votes, 'vote')}</span></span>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <p className="muted poll-meta">
        {plural(poll.total, 'vote')} · {poll.ended ? 'Poll ended' : `${timeUntil(poll.endsAt)} left`}
      </p>
    </div>
  )
}

/** Row of reaction buttons (like, haha, wow, sad, applause). */
export function ReactionPicker({ current, onPick }) {
  return (
    <div className="reaction-picker" role="group" aria-label="Choose a reaction">
      {REACTIONS.map((r) => (
        <button key={r.type} type="button" className={`reaction-btn ${current === r.type ? 'reaction-on' : ''}`} onClick={() => onPick(r.type)} aria-pressed={current === r.type} aria-label={r.label} title={r.label}>
          <span aria-hidden="true">{r.emoji}</span>
        </button>
      ))}
    </div>
  )
}

export function ReactionSummary({ reactions }) {
  const top = REACTIONS.filter((r) => reactions[r.type] > 0).sort((a, b) => reactions[b.type] - reactions[a.type]).slice(0, 3)
  if (!top.length) return null
  return <span className="reaction-summary" aria-hidden="true">{top.map((r) => r.emoji).join('')}</span>
}

export function ReportDialog({ onClose, onSubmit }) {
  const [reason, setReason] = useState(REPORT_REASONS[0])
  const [busy, setBusy] = useState(false)
  return (
    <Modal title="Report this post" onClose={onClose} size="sm">
      <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onSubmit(reason); setBusy(false) }}>
        <fieldset className="radio-group">
          <legend className="modal-text">Why are you reporting it? The post will be hidden from your feed and sent to the moderators.</legend>
          {REPORT_REASONS.map((r) => (
            <label key={r} className="radio"><input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} /> {r}</label>
          ))}
        </fieldset>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-danger" disabled={busy}>Report</button>
        </div>
      </form>
    </Modal>
  )
}

export function HistoryDialog({ postId, onClose }) {
  const [versions, setVersions] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    api.postHistory(postId).then((v) => { if (live) setVersions(v) }).catch((e) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [postId])
  return (
    <Modal title="Edit history" onClose={onClose}>
      {error && <p className="field-error" role="alert">{error}</p>}
      {!versions && !error && <p className="muted" role="status">Loading...</p>}
      {versions && (
        <ol className="history-list">
          {versions.map((v, i) => (
            <li key={i}>
              <p className="muted">{v.current ? 'Current version' : 'Earlier version'} · <time dateTime={v.at}>{fullDate(v.at)}</time></p>
              <RichText text={v.text || '(no text)'} />
            </li>
          ))}
        </ol>
      )}
    </Modal>
  )
}

/** Staff decision on a post: hide, remove or restore, with an optional note the author sees. */
export function ModerateDialog({ post, onClose, onDone }) {
  const toast = useToast()
  const [state, setState] = useState(post.modState === 'ok' ? 'hidden' : 'ok')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const choices = post.modState === 'ok'
    ? [['hidden', 'Hide the post', 'Only the author and staff can see it. It can be restored.'], ['removed', 'Remove the post', 'It breaks the rules. The author is told why.']]
    : [['ok', 'Restore the post', 'It becomes visible to everyone again.'], ['removed', 'Remove the post', 'It breaks the rules. The author is told why.']]
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.setModState(post.id, { state, note })
      toast.success(state === 'ok' ? 'Post restored.' : state === 'hidden' ? 'Post hidden.' : 'Post removed.')
      onDone(state)
    } catch (err) {
      toast.error(err.message)
      setBusy(false)
    }
  }
  return (
    <Modal title="Moderate post" onClose={onClose} size="sm">
      <form onSubmit={submit}>
        <fieldset className="radio-group">
          <legend className="modal-text">Choose what happens to this post. The action is written to the audit log.</legend>
          {choices.map(([value, label, help]) => (
            <label key={value} className="radio radio-block"><input type="radio" name="state" value={value} checked={state === value} onChange={() => setState(value)} /> <span><strong>{label}</strong><br /><span className="muted">{help}</span></span></label>
          ))}
        </fieldset>
        <div className="field">
          <label htmlFor="mod-note">Note for the author and the log (optional)</label>
          <textarea id="mod-note" rows={2} maxLength={LIMITS.modNote} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>Apply</button>
        </div>
      </form>
    </Modal>
  )
}
