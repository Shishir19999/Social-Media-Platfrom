import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth, useConfirm, useToast } from '../context/contexts'
import { useAsync } from '../hooks/useAsync'
import { useRequireAuth } from '../hooks/useRequireAuth'
import { buildTree } from '../lib/tree'
import { COMMENT_LIMIT } from '../lib/validate'
import { timeAgo, fullDate } from '../lib/format'
import Avatar from './Avatar'
import Icon from './Icon'
import RichText from './RichText'
import { EmptyState, ErrorState, ListSkeleton } from './States'

function CommentForm({ postId, parentId, autoFocus, placeholder, onAdded, onCancel }) {
  const { user } = useAuth()
  const toast = useToast()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const id = `c-${parentId || 'root'}`

  const submit = async (e) => {
    e.preventDefault()
    if (!text.trim()) { setError('Write a comment first.'); return }
    if (text.length > COMMENT_LIMIT) { setError(`Comments are limited to ${COMMENT_LIMIT} characters.`); return }
    setBusy(true)
    try {
      const c = await api.addComment(postId, { text: text.trim(), parentId })
      setText('')
      setError('')
      onAdded(c)
    } catch (err) {
      setError(err.message)
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="comment-form" onSubmit={submit} noValidate>
      <Avatar user={user} size={32} />
      <div className="grow">
        <label htmlFor={id} className="sr-only">{parentId ? 'Write a reply' : 'Write a comment'}</label>
        <textarea
          id={id}
          rows={2}
          autoFocus={autoFocus}
          value={text}
          placeholder={placeholder}
          aria-invalid={!!error || text.length > COMMENT_LIMIT}
          onChange={(e) => { setText(e.target.value); setError('') }}
        />
        <div className="comment-form-bar">
          <span className="field-error" role="alert">{error}</span>
          <span className={`counter ${text.length > COMMENT_LIMIT ? 'counter-over' : ''}`}>{COMMENT_LIMIT - text.length}</span>
          {onCancel && <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>}
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{parentId ? 'Reply' : 'Comment'}</button>
        </div>
      </div>
    </form>
  )
}

function Comment({ node, depth, postId, postAuthorId, onAdded, onLike, onDelete }) {
  const { user } = useAuth()
  const guard = useRequireAuth()
  const [replying, setReplying] = useState(false)
  const c = node.comment
  const canDelete = user && (user.id === c.author.id || user.id === postAuthorId)

  return (
    <li className="comment" id={`comment-${c.id}`}>
      <Link to={`/u/${c.author.username}`} aria-label={`${c.author.displayName}, profile`}><Avatar user={c.author} size={32} /></Link>
      <div className="grow">
        <div className="comment-body">
          <div className="comment-meta">
            <Link to={`/u/${c.author.username}`} className="post-name">{c.author.displayName}</Link>
            <span className="muted">@{c.author.username} · <time dateTime={c.createdAt} title={fullDate(c.createdAt)}>{timeAgo(c.createdAt)}</time></span>
          </div>
          <RichText text={c.text} />
        </div>
        <div className="comment-actions">
          <button type="button" className={`act act-sm ${c.likedByMe ? 'act-on act-like' : ''}`} aria-pressed={c.likedByMe} onClick={() => guard() && onLike(c)} aria-label={`${c.likedByMe ? 'Unlike' : 'Like'} comment, ${c.likes} likes`}>
            <Icon name={c.likedByMe ? 'heart-fill' : 'heart'} size={16} /> {c.likes > 0 && c.likes}
          </button>
          <button type="button" className="act act-sm" onClick={() => guard() && setReplying((r) => !r)} aria-expanded={replying}>
            <Icon name="reply" size={16} /> Reply
          </button>
          {canDelete && (
            <button type="button" className="act act-sm act-danger" onClick={() => onDelete(c)} aria-label="Delete comment">
              <Icon name="trash" size={16} />
            </button>
          )}
        </div>
        {replying && (
          <CommentForm
            postId={postId}
            parentId={c.id}
            autoFocus
            placeholder={`Reply to @${c.author.username}`}
            onCancel={() => setReplying(false)}
            onAdded={(x) => { setReplying(false); onAdded(x) }}
          />
        )}
        {node.children.length > 0 && (
          <ul className={`comment-list ${depth >= 2 ? 'comment-flat' : ''}`}>
            {node.children.map((child) => (
              <Comment key={child.comment.id} node={child} depth={depth + 1} postId={postId} postAuthorId={postAuthorId} onAdded={onAdded} onLike={onLike} onDelete={onDelete} />
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}

export default function Comments({ postId, postAuthorId, onCount }) {
  const { user } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const { data, loading, error, reload, setData } = useAsync(() => api.listComments(postId), [postId])
  const tree = useMemo(() => buildTree(data || []), [data])

  const update = (next) => { setData(next); onCount?.(next.length) }
  const onAdded = (c) => update([...(data || []), c])
  const onLike = async (c) => {
    setData((list) => list.map((x) => (x.id === c.id ? { ...x, likedByMe: !x.likedByMe, likes: x.likes + (x.likedByMe ? -1 : 1) } : x)))
    try {
      const fresh = await api.toggleCommentLike(postId, c.id)
      setData((list) => list.map((x) => (x.id === c.id ? fresh : x)))
    } catch (err) {
      setData((list) => list.map((x) => (x.id === c.id ? c : x)))
      toast.error(err.message)
    }
  }
  const onDelete = async (c) => {
    if (!await confirm({ title: 'Delete comment?', message: 'Replies to this comment will be deleted too.', confirmLabel: 'Delete', danger: true })) return
    try {
      const res = await api.deleteComment(postId, c.id)
      const gone = new Set(res.removed || [c.id])
      update((data || []).filter((x) => !gone.has(x.id)))
      toast.success('Comment deleted.')
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <section className="card comments" aria-labelledby="comments-title">
      <h2 id="comments-title" className="section-title">Comments {data ? `(${data.length})` : ''}</h2>
      {user ? (
        <CommentForm postId={postId} placeholder="Add a comment" onAdded={onAdded} />
      ) : (
        <p className="muted"><Link to="/login" state={{ from: `/post/${postId}` }}>Log in</Link> to join the conversation.</p>
      )}
      {loading && <ListSkeleton count={3} />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && tree.length === 0 && <EmptyState icon="message" title="No comments yet">Be the first to say something.</EmptyState>}
      {!loading && !error && tree.length > 0 && (
        <ul className="comment-list comment-root">
          {tree.map((n) => (
            <Comment key={n.comment.id} node={n} depth={0} postId={postId} postAuthorId={postAuthorId} onAdded={onAdded} onLike={onLike} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </section>
  )
}
