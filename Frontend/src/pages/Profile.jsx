import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth, useConfirm, useToast } from '../context/contexts'
import { useAsync } from '../hooks/useAsync'
import { useSentinel } from '../hooks/useInfinite'
import { appUrl, copyText } from '../lib/links'
import Avatar from '../components/Avatar'
import Feed from '../components/Feed'
import Icon from '../components/Icon'
import Menu from '../components/Menu'
import Modal from '../components/Modal'
import { ParallaxLayer } from '../components/Motion'
import PostCard from '../components/PostCard'
import { RoleBadge } from '../components/PostParts'
import { FollowButton } from '../components/Sidebar'
import { EmptyState, ErrorState, FeedSkeleton, ListSkeleton } from '../components/States'
import { compactNumber, fullDate, monthYear } from '../lib/format'
import { BIO_LIMIT, validateImage } from '../lib/validate'

function EditProfile({ profile, onClose, onSaved }) {
  const { updateUser } = useAuth()
  const toast = useToast()
  const [displayName, setDisplayName] = useState(profile.displayName)
  const [bio, setBio] = useState(profile.bio)
  const [avatar, setAvatar] = useState(null)
  const [cover, setCover] = useState(null)
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [removeCover, setRemoveCover] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const avatarUrl = useMemo(() => (avatar ? URL.createObjectURL(avatar) : null), [avatar])
  const coverUrl = useMemo(() => (cover ? URL.createObjectURL(cover) : null), [cover])
  useEffect(() => () => { if (avatarUrl) URL.revokeObjectURL(avatarUrl) }, [avatarUrl])
  useEffect(() => () => { if (coverUrl) URL.revokeObjectURL(coverUrl) }, [coverUrl])

  const choose = (setter, flag) => (e) => {
    const f = e.target.files[0]
    e.target.value = ''
    if (!f) return
    const problem = validateImage(f)
    if (problem) { setError(problem); return }
    setError('')
    setter(f)
    flag(false)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (bio.length > BIO_LIMIT) { setError(`Bio must be at most ${BIO_LIMIT} characters.`); return }
    if (displayName.length > 50) { setError('Display name must be at most 50 characters.'); return }
    setBusy(true)
    try {
      const saved = await api.updateProfile({ displayName, bio, avatar, cover, removeAvatar, removeCover })
      updateUser({ displayName: saved.displayName, avatar: saved.avatar })
      toast.success('Profile updated.')
      onSaved(saved)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const shownAvatar = removeAvatar ? null : avatarUrl || profile.avatar
  const shownCover = removeCover ? null : coverUrl || profile.cover

  return (
    <Modal title="Edit profile" onClose={onClose}>
      <form onSubmit={submit} noValidate className="edit-profile">
        <div className="cover cover-edit" style={shownCover ? { backgroundImage: `url("${shownCover}")` } : undefined} />
        <div className="field-row">
          <label className="btn btn-secondary btn-sm">Change cover<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={choose(setCover, setRemoveCover)} /></label>
          {shownCover && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setCover(null); setRemoveCover(true) }}>Remove cover</button>}
        </div>
        <div className="field-row">
          <Avatar user={{ ...profile, avatar: shownAvatar }} size={64} />
          <label className="btn btn-secondary btn-sm">Change photo<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={choose(setAvatar, setRemoveAvatar)} /></label>
          {shownAvatar && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAvatar(null); setRemoveAvatar(true) }}>Remove photo</button>}
        </div>
        <div className="field">
          <label htmlFor="ep-name">Display name</label>
          <input id="ep-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} />
        </div>
        <div className="field">
          <label htmlFor="ep-bio">Bio</label>
          <textarea id="ep-bio" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} aria-invalid={bio.length > BIO_LIMIT} />
          <p className={`hint ${bio.length > BIO_LIMIT ? 'counter-over' : ''}`}>{BIO_LIMIT - bio.length} characters left</p>
        </div>
        <p className="field-error" role="alert">{error}</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save changes'}</button>
        </div>
      </form>
    </Modal>
  )
}

function PostGrid({ username, media = false }) {
  const [state, setState] = useState({ posts: [], page: 0, pages: 1, loading: true, error: '' })
  const loadingRef = useRef(false)

  const load = async (page) => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const data = await api.listPosts({ author: username, media, page, limit: 12 })
      setState((s) => ({ posts: page === 1 ? data.posts : [...s.posts, ...data.posts], page: data.page, pages: data.pages, loading: false, error: '' }))
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message }))
    } finally {
      loadingRef.current = false
    }
  }
  useEffect(() => { load(1) }, [username, media]) // eslint-disable-line react-hooks/exhaustive-deps
  const hasMore = state.page < state.pages
  const sentinel = useSentinel(() => load(state.page + 1), hasMore && !state.error)

  if (state.loading) return <FeedSkeleton count={1} />
  if (state.error && !state.posts.length) return <ErrorState message={state.error} onRetry={() => { setState((s) => ({ ...s, loading: true, error: '' })); load(1) }} />
  if (!state.posts.length) return <EmptyState icon="image" title={media ? 'No photos yet' : 'No posts yet'}>{media ? 'Photos appear in this grid.' : 'Posts will appear in this grid.'}</EmptyState>
  return (
    <>
      <ul className="post-grid">
        {state.posts.map((p) => (
          <li key={p.id}>
            <Link to={`/post/${p.id}`} className="tile" aria-label={`Open post: ${(p.text || 'photo').slice(0, 60)}`}>
              {p.images[0] ? <img src={p.images[0]} alt="" loading="lazy" /> : <span className="tile-text">{p.text}</span>}
              {p.images.length > 1 && <span className="tile-badge"><Icon name="image" size={14} /> {p.images.length}</span>}
              <span className="tile-over"><Icon name="heart-fill" size={16} /> {compactNumber(p.likes)} <Icon name="message" size={16} /> {compactNumber(p.commentsCount)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {hasMore && <div ref={sentinel} className="feed-more"><button type="button" className="btn btn-secondary" onClick={() => load(state.page + 1)}>Load more</button></div>}
    </>
  )
}

// value for <input type="datetime-local">
const localInput = (ms) => new Date(ms - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)

function DraftActions({ post, onChange, onRemove }) {
  const toast = useToast()
  const [scheduling, setScheduling] = useState(false)
  const [when, setWhen] = useState(() => localInput(Date.now() + 60 * 60000))
  const [busy, setBusy] = useState(false)
  const [minWhen] = useState(() => localInput(Date.now() + 2 * 60000))
  const run = async (scheduleAt) => {
    setBusy(true)
    try {
      const fresh = await api.publishPost(post.id, { scheduleAt })
      if (scheduleAt) { onChange(fresh); setScheduling(false); toast.success(`Scheduled for ${fullDate(scheduleAt)}.`) } else { onRemove(post.id); toast.success('Published.') }
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="draft-actions">
      <button type="button" className="btn btn-primary btn-sm" onClick={() => run()} disabled={busy}>Publish now</button>
      {scheduling ? (
        <span className="row">
          <label htmlFor={`when-${post.id}`} className="sr-only">Publish at</label>
          <input id={`when-${post.id}`} type="datetime-local" value={when} min={minWhen} onChange={(e) => setWhen(e.target.value)} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => run(new Date(when).getTime())} disabled={busy}>Confirm</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setScheduling(false)}>Cancel</button>
        </span>
      ) : (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setScheduling(true)}><Icon name="calendar" size={16} /> {post.status === 'scheduled' ? 'Reschedule' : 'Schedule'}</button>
      )}
    </div>
  )
}

function Drafts() {
  const drafts = useAsync(() => api.myPosts('draft'), [])
  const scheduled = useAsync(() => api.myPosts('scheduled'), [])
  const reloadBoth = () => { drafts.reload(); scheduled.reload() }
  const section = (title, state, empty) => (
    <section aria-label={title}>
      <h2 className="section-title">{title}</h2>
      {state.loading && <FeedSkeleton count={1} />}
      {state.error && <ErrorState message={state.error} onRetry={state.reload} />}
      {state.data && state.data.posts.length === 0 && <EmptyState icon="file" title={empty[0]}>{empty[1]}</EmptyState>}
      {state.data && state.data.posts.map((p) => (
        <PostCard
          key={p.id}
          post={p}
          onChange={(np) => { if (np.status !== p.status) reloadBoth(); else state.setData((d) => ({ posts: d.posts.map((x) => (x.id === np.id ? np : x)) })) }}
          onRemove={(id) => { state.setData((d) => ({ posts: d.posts.filter((x) => x.id !== id) })); if (p.status !== 'draft') scheduled.reload() }}
          footer={<DraftActions post={p} onChange={() => reloadBoth()} onRemove={(id) => state.setData((d) => ({ posts: d.posts.filter((x) => x.id !== id) }))} />}
        />
      ))}
    </section>
  )
  return (
    <div className="stack-sm">
      {section('Scheduled', scheduled, ['Nothing scheduled', 'Use Schedule in the composer to queue a post for later.'])}
      {section('Drafts', drafts, ['No drafts', 'Use Save draft in the composer to keep something for later.'])}
    </div>
  )
}

function Connections({ username, kind, onClose }) {
  const [state, setState] = useState({ users: [], page: 0, pages: 1, loading: true, error: '' })
  const load = async (page) => {
    try {
      const data = await api.listConnections(username, kind, page)
      setState((s) => ({ users: page === 1 ? data.users : [...s.users, ...data.users], page: data.page, pages: data.pages, loading: false, error: '' }))
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message }))
    }
  }
  useEffect(() => { load(1) }, [username, kind]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal title={kind === 'followers' ? 'Followers' : 'Following'} onClose={onClose} size="sm">
      {state.loading && <ListSkeleton count={4} />}
      {state.error && <ErrorState message={state.error} onRetry={() => load(1)} />}
      {!state.loading && !state.error && state.users.length === 0 && <EmptyState icon="users" title={kind === 'followers' ? 'No followers yet' : 'Not following anyone yet'} />}
      <ul className="stack-sm">
        {state.users.map((u) => (
          <li key={u.id} className="row">
            <Link to={`/u/${u.username}`} onClick={onClose} aria-label={`${u.displayName}, profile`}><Avatar user={u} size={40} /></Link>
            <div className="grow min0"><Link to={`/u/${u.username}`} onClick={onClose} className="post-name">{u.displayName}</Link> <RoleBadge role={u.role} /><div className="muted ellipsis">@{u.username}</div></div>
            {!u.isMe && <FollowButton username={u.username} following={u.isFollowing} size="sm" />}
          </li>
        ))}
      </ul>
      {state.page < state.pages && <div className="feed-more"><button type="button" className="btn btn-secondary" onClick={() => load(state.page + 1)}>Load more</button></div>}
    </Modal>
  )
}

export default function Profile() {
  const { username } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const [params, setParams] = useSearchParams()
  const { data: profile, loading, error, reload, setData } = useAsync(() => api.getProfile(username), [username, user?.id])
  const [editing, setEditing] = useState(false)
  const [list, setList] = useState(null)

  if (loading) return <div className="container narrow"><FeedSkeleton count={1} /></div>
  if (error) {
    return (
      <div className="container narrow">
        {error.toLowerCase().includes('not found')
          ? <EmptyState icon="user" title="User not found" action={<Link to="/explore" className="btn btn-primary">Back to Explore</Link>}>There is nobody called @{username}.</EmptyState>
          : <ErrorState message={error} onRetry={reload} />}
      </div>
    )
  }
  if (!profile) return null

  const tab = ['posts', 'media', 'drafts'].includes(params.get('tab')) && (params.get('tab') !== 'drafts' || profile.isMe) ? params.get('tab') : 'posts'
  const setTab = (t) => setParams(t === 'posts' ? {} : { tab: t }, { replace: true })
  const merge = (p) => setData((cur) => ({ ...cur, ...p }))
  const hidden = profile.blockedByThem || profile.blockedByMe

  const relate = async (kind) => {
    const blocking = kind === 'block' && !profile.blockedByMe
    if (blocking) {
      const ok = await confirm({ title: `Block @${profile.username}?`, message: 'You will not see each other\'s posts, and they cannot follow or message you. You can undo this in Settings.', confirmLabel: 'Block', danger: true })
      if (!ok) return
    }
    try {
      const fresh = await (kind === 'block' ? api.toggleBlock(profile.username) : api.toggleMute(profile.username))
      merge(fresh)
      if (kind === 'block') toast.success(fresh.blockedByMe ? `Blocked @${profile.username}.` : `Unblocked @${profile.username}.`)
      else toast.success(fresh.mutedByMe ? `Muted @${profile.username}. Their posts are hidden from your feeds.` : `Unmuted @${profile.username}.`)
    } catch (err) { toast.error(err.message) }
  }

  const menu = [
    { label: 'Copy profile link', icon: 'link', onSelect: async () => { toast[(await copyText(appUrl(`/u/${profile.username}`))) ? 'success' : 'error']('Link copied.') } },
    !profile.isMe && !profile.blockedByThem && { label: profile.mutedByMe ? `Unmute @${profile.username}` : `Mute @${profile.username}`, icon: 'mute', onSelect: () => relate('mute') },
    !profile.isMe && { label: profile.blockedByMe ? `Unblock @${profile.username}` : `Block @${profile.username}`, icon: 'ban', danger: !profile.blockedByMe, onSelect: () => relate('block') },
  ]

  return (
    <div className="profile">
      <div className="cover-wrap">
        {profile.cover && !profile.blockedByThem
          ? <ParallaxLayer speed={0.12} className="cover-layer"><div className="cover" style={{ backgroundImage: `url("${profile.cover}")` }} /></ParallaxLayer>
          : <ParallaxLayer speed={0.12} className="cover-layer"><div className="cover cover-default" /></ParallaxLayer>}
      </div>
      <div className="container">
        <div className="profile-head card">
          <Avatar user={profile} size={104} className="profile-avatar" />
          <div className="profile-actions">
            {profile.isMe ? (
              <>
                <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}><Icon name="edit" size={16} /> Edit profile</button>
                <Link to="/settings" className="icon-btn" aria-label="Settings"><Icon name="settings" /></Link>
              </>
            ) : (
              <>
                {user && !hidden && <Link to={`/messages/${profile.username}`} className="btn btn-secondary" aria-label={`Message @${profile.username}`}><Icon name="mail" size={16} /> <span className="btn-text">Message</span></Link>}
                {!hidden && <FollowButton username={profile.username} following={profile.isFollowing} requested={profile.requested} onChange={merge} />}
                <Menu label="Profile options" items={menu} />
              </>
            )}
          </div>
          <h1 className="profile-name">{profile.displayName} <RoleBadge role={profile.role} /></h1>
          <p className="muted">
            @{profile.username} · Joined {monthYear(profile.joined)}
            {profile.isPrivate && <> · <span className="private-tag"><Icon name="lock" size={14} /> Private account</span></>}
            {profile.status === 'suspended' && <> · <span className="status status-suspended">suspended</span></>}
            {profile.mutedByMe && ' · Muted'}
          </p>
          {profile.bio && <p className="profile-bio">{profile.bio}</p>}
          <ul className="stats">
            <li><strong>{compactNumber(profile.posts)}</strong> posts</li>
            <li><button type="button" className="stat-btn" disabled={profile.locked || hidden} onClick={() => setList('followers')}><strong>{compactNumber(profile.followers)}</strong> followers</button></li>
            <li><button type="button" className="stat-btn" disabled={profile.locked || hidden} onClick={() => setList('following')}><strong>{compactNumber(profile.following)}</strong> following</button></li>
          </ul>
        </div>

        {profile.blockedByThem && <EmptyState icon="ban" title={`You cannot see @${profile.username}'s posts`}>This account has blocked you.</EmptyState>}
        {profile.blockedByMe && (
          <EmptyState icon="ban" title={`You blocked @${profile.username}`} action={<button type="button" className="btn btn-primary" onClick={() => relate('block')}>Unblock</button>}>
            You cannot see each other&apos;s posts and they cannot follow or message you.
          </EmptyState>
        )}
        {!hidden && profile.locked && (
          <EmptyState icon="lock" title="This account is private" action={user ? <FollowButton username={profile.username} following={profile.isFollowing} requested={profile.requested} onChange={merge} /> : <Link to="/login" className="btn btn-primary">Log in to follow</Link>}>
            Follow @{profile.username} and, once approved, you will see their posts and photos.
          </EmptyState>
        )}
        {!hidden && !profile.locked && (
          <>
            <div className="tabs" role="tablist" aria-label="Profile">
              <button role="tab" type="button" id="pt-posts" aria-selected={tab === 'posts'} aria-controls="pt-panel" className="tab-btn" onClick={() => setTab('posts')}>Posts</button>
              <button role="tab" type="button" id="pt-media" aria-selected={tab === 'media'} aria-controls="pt-panel" className="tab-btn" onClick={() => setTab('media')}>Media</button>
              {profile.isMe && <button role="tab" type="button" id="pt-drafts" aria-selected={tab === 'drafts'} aria-controls="pt-panel" className="tab-btn" onClick={() => setTab('drafts')}>Drafts</button>}
            </div>
            <div className="profile-posts" id="pt-panel" role="tabpanel" aria-labelledby={`pt-${tab}`}>
              {tab === 'media' && <PostGrid username={profile.username} media />}
              {tab === 'drafts' && <Drafts />}
              {tab === 'posts' && <Feed query={{ author: profile.username }} empty={<EmptyState icon="image" title="No posts yet">{profile.isMe ? 'Share your first post from the home page.' : `@${profile.username} has not posted yet.`}</EmptyState>} />}
            </div>
          </>
        )}
      </div>
      {editing && <EditProfile profile={profile} onClose={() => setEditing(false)} onSaved={(saved) => { setData((cur) => ({ ...cur, ...saved })); setEditing(false) }} />}
      {list && <Connections username={profile.username} kind={list} onClose={() => setList(null)} />}
    </div>
  )
}
