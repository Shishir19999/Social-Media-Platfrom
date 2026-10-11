import { memo, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth, useConfirm, useToast } from '../context/contexts'
import { useRequireAuth } from '../hooks/useRequireAuth'
import { appUrl, copyText } from '../lib/links'
import { compactNumber, fullDate, timeAgo } from '../lib/format'
import { REACTIONS, isStaff } from '../lib/rules'
import { POST_LIMIT } from '../lib/validate'
import Avatar from './Avatar'
import Composer from './Composer'
import Icon from './Icon'
import Lightbox from './Lightbox'
import Menu from './Menu'
import MentionTextarea from './MentionTextarea'
import Modal from './Modal'
import {
  HistoryDialog, ImageGrid, LinkCard, ModerateDialog, Poll, QuotedPost, ReactionPicker, ReactionSummary, ReportDialog, RoleBadge,
} from './PostParts'
import RichText from './RichText'

const emojiOf = (type) => REACTIONS.find((r) => r.type === type)?.emoji

// Counts after a reaction change (used for the optimistic update)
function withReaction(post, next) {
  const reactions = { ...post.reactions }
  if (post.myReaction) reactions[post.myReaction] = Math.max(0, reactions[post.myReaction] - 1)
  if (next) reactions[next] += 1
  const likes = post.likes + (next ? 1 : 0) - (post.likedByMe ? 1 : 0)
  return { ...post, reactions, likes, myReaction: next, likedByMe: !!next }
}

function Reactions({ post, onReact }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef(null)
  const timer = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => { if (!wrap.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])
  const mine = post.myReaction
  return (
    <div
      className="reactions"
      ref={wrap}
      onMouseEnter={() => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(true), 450) }}
      onMouseLeave={() => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 250) }}
    >
      <button type="button" className={`act ${mine ? 'act-on act-like' : ''}`} onClick={() => { setOpen(false); onReact(mine ? null : 'like') }} aria-pressed={!!mine} aria-label={`${mine ? 'Remove your reaction' : 'Like'}, ${post.likes} reactions`}>
        {mine && mine !== 'like' ? <span aria-hidden="true" className="emoji-on">{emojiOf(mine)}</span> : <Icon name={mine ? 'heart-fill' : 'heart'} />}
        <span>{compactNumber(post.likes)}</span>
      </button>
      <button type="button" className="act act-sm" aria-haspopup="true" aria-expanded={open} aria-label="Choose a reaction" onClick={() => setOpen((o) => !o)}>
        <Icon name="smile" size={18} />
      </button>
      {open && <ReactionPicker current={mine} onPick={(t) => { setOpen(false); onReact(t === mine ? null : t) }} />}
      <ReactionSummary reactions={post.reactions} />
    </div>
  )
}

function QuoteDialog({ post, onClose, onDone }) {
  return (
    <Modal title="Quote post" onClose={onClose}>
      <Composer quote={post} autoFocus onPosted={(p) => { onDone(p); onClose() }} />
    </Modal>
  )
}

function PostCard({ post, onChange, onRemove, detail = false, footer = null }) {
  const { user } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const guard = useRequireAuth()
  const [lightbox, setLightbox] = useState(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(post.text)
  const [dialog, setDialog] = useState(null)
  const [busy, setBusy] = useState(false)
  const mine = user?.id === post.author.id
  const staff = !!user && isStaff(user.role)
  const live = post.status === 'published'

  // A plain repost is shown as the original post with a "reposted" line on top.
  if (post.isRepost) {
    const undo = async () => {
      try {
        await api.toggleRepost(post.repostOf.id)
        toast.success('Repost removed.')
        onRemove(post.id)
      } catch (err) { toast.error(err.message) }
    }
    return (
      <div className="repost-wrap">
        <p className="repost-banner muted">
          <Icon name="repeat" size={16} />
          <span><Link to={`/u/${post.author.username}`} className="repost-by">{mine ? 'You' : post.author.displayName}</Link> reposted · {timeAgo(post.createdAt)}</span>
          {mine && post.repostOf && !post.repostOf.unavailable && <button type="button" className="link-btn" onClick={undo}>Undo</button>}
        </p>
        {post.repostOf && !post.repostOf.unavailable
          ? <PostCard post={post.repostOf} onChange={(np) => onChange({ ...post, repostOf: np })} onRemove={() => onRemove(post.id)} />
          : <div className="card"><QuotedPost post={post.repostOf} /></div>}
      </div>
    )
  }

  const run = async (fn, failMessage) => {
    try { return await fn() } catch (err) { toast.error(err.message || failMessage); return null }
  }

  const react = async (type) => {
    if (!guard()) return
    const before = post
    onChange(withReaction(post, type))
    const fresh = await run(() => (type ? api.react(post.id, type) : api.react(post.id, post.myReaction)))
    onChange(fresh || before)
  }

  const bookmark = async () => {
    if (!guard()) return
    const before = post
    onChange({ ...post, bookmarkedByMe: !post.bookmarkedByMe })
    const fresh = await run(() => api.toggleBookmark(post.id))
    if (fresh) { onChange(fresh); toast.success(fresh.bookmarkedByMe ? 'Saved to bookmarks.' : 'Removed from bookmarks.') } else onChange(before)
  }

  const repost = async () => {
    if (!guard()) return
    const before = post
    onChange({ ...post, repostedByMe: !post.repostedByMe, reposts: post.reposts + (post.repostedByMe ? -1 : 1) })
    const fresh = await run(() => api.toggleRepost(post.id))
    if (fresh) { onChange({ ...fresh, pinned: post.pinned }); toast.success(fresh.repostedByMe ? 'Reposted.' : 'Repost removed.') } else onChange(before)
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
      setDialog(null)
      toast.success('Thanks, the post was reported and hidden.')
      onRemove(post.id)
    }
  }

  const mute = async () => {
    if (!guard()) return
    if (await run(() => api.toggleMute(post.author.username))) { toast.success(`Muted @${post.author.username}. You will not see their posts in your feeds.`); onRemove(post.id) }
  }

  const block = async () => {
    if (!guard()) return
    const ok = await confirm({ title: `Block @${post.author.username}?`, message: 'You will not see each other\'s posts and they cannot follow or message you. You can undo this in Settings.', confirmLabel: 'Block', danger: true })
    if (ok && await run(() => api.toggleBlock(post.author.username))) { toast.success(`Blocked @${post.author.username}.`); onRemove(post.id) }
  }

  const remove = async () => {
    const ok = await confirm({ title: 'Delete post?', message: 'This permanently deletes the post, its images and comments.', confirmLabel: 'Delete', danger: true })
    if (ok && await run(() => api.deletePost(post.id))) { toast.success('Post deleted.'); onRemove(post.id) }
  }

  const pin = async () => {
    const res = await run(() => api.pinPost(post.id))
    if (res) { onChange({ ...post, pinned: res.pinned }); toast.success(res.pinned ? 'Pinned to your profile.' : 'Unpinned.') }
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    if ((!draft.trim() && !post.poll && !post.images.length) || draft.length > POST_LIMIT) return
    setBusy(true)
    const fresh = await run(() => api.updatePost(post.id, { text: draft.trim() }))
    setBusy(false)
    if (fresh) { onChange({ ...fresh, pinned: post.pinned }); setEditing(false); toast.success('Post updated.') }
  }

  const menuItems = [
    live && { label: 'Copy link', icon: 'link', onSelect: share },
    mine && { label: 'Edit post', icon: 'edit', onSelect: () => { setDraft(post.text); setEditing(true) } },
    post.edited && { label: 'Edit history', icon: 'history', onSelect: () => setDialog('history') },
    mine && live && { label: post.pinned ? 'Unpin from profile' : 'Pin to profile', icon: 'pin', onSelect: pin },
    mine && { label: 'Delete post', icon: 'trash', danger: true, onSelect: remove },
    !mine && live && { label: 'Hide post', icon: 'eyeOff', onSelect: hide },
    !mine && live && { label: `Mute @${post.author.username}`, icon: 'mute', onSelect: mute },
    !mine && live && { label: `Block @${post.author.username}`, icon: 'ban', danger: true, onSelect: block },
    !mine && live && { label: 'Report post', icon: 'flag', danger: true, onSelect: () => { if (guard()) setDialog('report') } },
    staff && { label: 'Moderate post', icon: 'shield', onSelect: () => setDialog('moderate') },
  ]

  const modLabel = post.modState === 'removed' ? 'removed' : 'hidden'

  return (
    <article className={`card post-card ${post.modState !== 'ok' ? 'post-moderated' : ''}`} aria-label={`Post by ${post.author.displayName}`}>
      {post.pinned && <p className="post-flag muted"><Icon name="pin" size={14} /> Pinned post</p>}
      {post.status === 'scheduled' && <p className="post-flag muted"><Icon name="clock" size={14} /> Scheduled for {fullDate(post.createdAt)}</p>}
      {post.status === 'draft' && <p className="post-flag muted"><Icon name="file" size={14} /> Draft, only you can see this</p>}
      {post.modState !== 'ok' && (
        <p className="mod-banner" role="note">
          <Icon name="shield" size={16} /> This post was {modLabel} by the moderators{post.modNote ? `: ${post.modNote}` : '.'}
        </p>
      )}
      <header className="post-head">
        <Link to={`/u/${post.author.username}`} className="post-author" aria-label={`${post.author.displayName}, profile`}>
          <Avatar user={post.author} size={44} />
        </Link>
        <div className="grow">
          <Link to={`/u/${post.author.username}`} className="post-name">{post.author.displayName}</Link> <RoleBadge role={post.author.role} />
          <div className="muted">
            @{post.author.username} · {live
              ? <Link to={`/post/${post.id}`} className="time-link"><time dateTime={post.createdAt} title={fullDate(post.createdAt)}>{timeAgo(post.createdAt)}</time></Link>
              : <time dateTime={post.createdAt}>{timeAgo(post.createdAt)}</time>}
            {post.edited && ' · edited'}
          </div>
        </div>
        <Menu label="Post options" items={menuItems} />
      </header>

      {editing ? (
        <form onSubmit={saveEdit} className="edit-form">
          <label htmlFor={`edit-${post.id}`} className="sr-only">Edit post text</label>
          <MentionTextarea id={`edit-${post.id}`} rows={4} value={draft} onChange={setDraft} aria-invalid={draft.length > POST_LIMIT} />
          <div className="composer-bar">
            <span className={`counter ${draft.length > POST_LIMIT ? 'counter-over' : ''}`}>{POST_LIMIT - draft.length}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || (!draft.trim() && !post.poll) || draft.length > POST_LIMIT}>Save</button>
          </div>
        </form>
      ) : (
        post.text && <RichText text={post.text} className="post-text" />
      )}

      {post.poll && <Poll post={post} onChange={(p) => onChange({ ...p, pinned: post.pinned })} />}
      {post.repostOf && <QuotedPost post={post.repostOf} />}
      {post.link && !post.repostOf && post.images.length === 0 && <LinkCard link={post.link} />}
      {post.images.length > 0 && <ImageGrid images={post.images} onOpen={setLightbox} />}

      {live && (
        <footer className="post-actions">
          <Reactions post={post} onReact={react} />
          <Link to={`/post/${post.id}`} className="act" aria-label={`${post.commentsCount} comments`}>
            <Icon name="message" /> <span>{compactNumber(post.commentsCount)}</span>
          </Link>
          <Menu
            label={`Repost options, ${post.reposts} reposts`}
            icon="repeat"
            buttonClass={`act ${post.repostedByMe ? 'act-on' : ''}`}
            count={compactNumber(post.reposts)}
            align="left"
            items={[
              { label: post.repostedByMe ? 'Undo repost' : 'Repost', icon: 'repeat', onSelect: repost },
              { label: 'Quote post', icon: 'quote', onSelect: () => { if (guard()) setDialog('quote') } },
            ]}
          />
          <button type="button" className={`act ${post.bookmarkedByMe ? 'act-on' : ''}`} onClick={bookmark} aria-pressed={post.bookmarkedByMe} aria-label={post.bookmarkedByMe ? 'Remove bookmark' : 'Save post'}>
            <Icon name={post.bookmarkedByMe ? 'bookmark-fill' : 'bookmark'} />
          </button>
          <button type="button" className="act" onClick={share} aria-label="Copy link to post"><Icon name="share" /></button>
          {detail && <span className="muted act-date">{fullDate(post.createdAt)}</span>}
        </footer>
      )}
      {footer}

      {lightbox !== null && <Lightbox images={post.images} start={lightbox} onClose={() => setLightbox(null)} />}
      {dialog === 'report' && <ReportDialog onClose={() => setDialog(null)} onSubmit={report} />}
      {dialog === 'history' && <HistoryDialog postId={post.id} onClose={() => setDialog(null)} />}
      {dialog === 'quote' && <QuoteDialog post={post} onClose={() => setDialog(null)} onDone={() => onChange({ ...post, reposts: post.reposts + 1 })} />}
      {dialog === 'moderate' && <ModerateDialog post={post} onClose={() => setDialog(null)} onDone={(state) => { setDialog(null); onChange({ ...post, modState: state }) }} />}
    </article>
  )
}

export default memo(PostCard)
