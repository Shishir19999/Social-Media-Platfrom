import { memo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth, useConfirm, useToast } from '../context/contexts'
import { useRequireAuth } from '../hooks/useRequireAuth'
import { appUrl, copyText } from '../lib/links'
import { compactNumber, fullDate, timeAgo } from '../lib/format'
import { POST_LIMIT } from '../lib/validate'
import Avatar from './Avatar'
import Icon from './Icon'
import Lightbox from './Lightbox'
import Menu from './Menu'
import Modal from './Modal'
import RichText from './RichText'

const REPORT_REASONS = ['Spam or scam', 'Harassment or hate', 'Misleading information', 'Something else']

function ImageGrid({ images, onOpen }) {
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

function ReportDialog({ onClose, onSubmit }) {
  const [reason, setReason] = useState(REPORT_REASONS[0])
  const [busy, setBusy] = useState(false)
  return (
    <Modal title="Report this post" onClose={onClose} size="sm">
      <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onSubmit(reason); setBusy(false) }}>
        <fieldset className="radio-group">
          <legend className="modal-text">Why are you reporting it? The post will be hidden from your feed.</legend>
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

function PostCard({ post, onChange, onRemove, detail = false }) {
  const { user } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const guard = useRequireAuth()
  const [lightbox, setLightbox] = useState(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(post.text)
  const [reporting, setReporting] = useState(false)
  const [busy, setBusy] = useState(false)
  const mine = user?.id === post.author.id

  const run = async (fn, failMessage) => {
    try { return await fn() } catch (err) { toast.error(err.message || failMessage); return null }
  }

  const like = async () => {
    if (!guard()) return
    const was = post
    onChange({ ...post, likedByMe: !post.likedByMe, likes: post.likes + (post.likedByMe ? -1 : 1) })
    const fresh = await run(() => api.toggleLike(post.id))
    onChange(fresh || was)
  }

  const bookmark = async () => {
    if (!guard()) return
    const fresh = await run(() => api.toggleBookmark(post.id))
    if (fresh) { onChange(fresh); toast.success(fresh.bookmarkedByMe ? 'Saved to bookmarks.' : 'Removed from bookmarks.') }
  }

  const share = async () => {
    const ok = await copyText(appUrl(`/post/${post.id}`))
    if (ok) toast.success('Link copied.')
    else toast.error('Could not copy the link.')
  }

  const hide = async () => {
    if (!guard()) return
    if (await run(() => api.hidePost(post.id))) { toast.success('Post hidden.'); onRemove(post.id) }
  }

  const report = async (reason) => {
    if (await run(() => api.reportPost(post.id, reason))) {
      setReporting(false)
      toast.success('Thanks, the post was reported and hidden.')
      onRemove(post.id)
    }
  }

  const remove = async () => {
    const ok = await confirm({ title: 'Delete post?', message: 'This permanently deletes the post, its images and comments.', confirmLabel: 'Delete', danger: true })
    if (ok && await run(() => api.deletePost(post.id))) { toast.success('Post deleted.'); onRemove(post.id) }
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    if (!draft.trim() || draft.length > POST_LIMIT) return
    setBusy(true)
    const fresh = await run(() => api.updatePost(post.id, { text: draft.trim() }))
    setBusy(false)
    if (fresh) { onChange(fresh); setEditing(false); toast.success('Post updated.') }
  }

  const menuItems = [
    { label: 'Copy link', icon: 'link', onSelect: share },
    mine && { label: 'Edit post', icon: 'edit', onSelect: () => { setDraft(post.text); setEditing(true) } },
    mine && { label: 'Delete post', icon: 'trash', danger: true, onSelect: remove },
    !mine && { label: 'Hide post', icon: 'eyeOff', onSelect: hide },
    !mine && { label: 'Report post', icon: 'flag', danger: true, onSelect: () => { if (guard()) setReporting(true) } },
  ]

  return (
    <article className="card post-card" aria-label={`Post by ${post.author.displayName}`}>
      <header className="post-head">
        <Link to={`/u/${post.author.username}`} className="post-author" aria-label={`${post.author.displayName}, profile`}>
          <Avatar user={post.author} size={44} />
        </Link>
        <div className="grow">
          <Link to={`/u/${post.author.username}`} className="post-name">{post.author.displayName}</Link>
          <div className="muted">
            @{post.author.username} · <Link to={`/post/${post.id}`} className="time-link"><time dateTime={post.createdAt} title={fullDate(post.createdAt)}>{timeAgo(post.createdAt)}</time></Link>
            {post.edited && ' · edited'}
          </div>
        </div>
        <Menu label="Post options" items={menuItems} />
      </header>

      {editing ? (
        <form onSubmit={saveEdit} className="edit-form">
          <label htmlFor={`edit-${post.id}`} className="sr-only">Edit post text</label>
          <textarea id={`edit-${post.id}`} rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} aria-invalid={draft.length > POST_LIMIT || !draft.trim()} />
          <div className="composer-bar">
            <span className={`counter ${draft.length > POST_LIMIT ? 'counter-over' : ''}`}>{POST_LIMIT - draft.length}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !draft.trim() || draft.length > POST_LIMIT}>Save</button>
          </div>
        </form>
      ) : (
        <RichText text={post.text} className="post-text" />
      )}

      {post.images.length > 0 && <ImageGrid images={post.images} onOpen={setLightbox} />}

      <footer className="post-actions">
        <button type="button" className={`act ${post.likedByMe ? 'act-on act-like' : ''}`} onClick={like} aria-pressed={post.likedByMe} aria-label={`${post.likedByMe ? 'Unlike' : 'Like'}, ${post.likes} likes`}>
          <Icon name={post.likedByMe ? 'heart-fill' : 'heart'} /> <span>{compactNumber(post.likes)}</span>
        </button>
        <Link to={`/post/${post.id}`} className="act" aria-label={`${post.commentsCount} comments`}>
          <Icon name="message" /> <span>{compactNumber(post.commentsCount)}</span>
        </Link>
        <button type="button" className={`act ${post.bookmarkedByMe ? 'act-on' : ''}`} onClick={bookmark} aria-pressed={post.bookmarkedByMe} aria-label={post.bookmarkedByMe ? 'Remove bookmark' : 'Save post'}>
          <Icon name={post.bookmarkedByMe ? 'bookmark-fill' : 'bookmark'} />
        </button>
        <button type="button" className="act" onClick={share} aria-label="Copy link to post"><Icon name="share" /></button>
        {detail && <span className="muted act-date">{fullDate(post.createdAt)}</span>}
      </footer>

      {lightbox !== null && <Lightbox images={post.images} start={lightbox} onClose={() => setLightbox(null)} />}
      {reporting && <ReportDialog onClose={() => setReporting(false)} onSubmit={report} />}
    </article>
  )
}

export default memo(PostCard)
