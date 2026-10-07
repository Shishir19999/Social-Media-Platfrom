import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth, useToast } from '../context/contexts'
import { useAsync } from '../hooks/useAsync'
import { useSentinel } from '../hooks/useInfinite'
import Avatar from '../components/Avatar'
import Feed from '../components/Feed'
import Icon from '../components/Icon'
import Modal from '../components/Modal'
import { ParallaxLayer } from '../components/Motion'
import { FollowButton } from '../components/Sidebar'
import { EmptyState, ErrorState, FeedSkeleton } from '../components/States'
import { compactNumber, monthYear } from '../lib/format'
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

function PostGrid({ username }) {
  const [state, setState] = useState({ posts: [], page: 0, pages: 1, loading: true, error: '' })
  const loadingRef = useRef(false)

  const load = async (page) => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const data = await api.listPosts({ author: username, page, limit: 12 })
      setState((s) => ({ posts: page === 1 ? data.posts : [...s.posts, ...data.posts], page: data.page, pages: data.pages, loading: false, error: '' }))
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message }))
    } finally {
      loadingRef.current = false
    }
  }
  useEffect(() => { load(1) }, [username]) // eslint-disable-line react-hooks/exhaustive-deps
  const hasMore = state.page < state.pages
  const sentinel = useSentinel(() => load(state.page + 1), hasMore && !state.error)

  if (state.loading) return <FeedSkeleton count={1} />
  if (state.error && !state.posts.length) return <ErrorState message={state.error} onRetry={() => { setState((s) => ({ ...s, loading: true, error: '' })); load(1) }} />
  if (!state.posts.length) return <EmptyState icon="image" title="No posts yet">Posts will appear in this grid.</EmptyState>
  return (
    <>
      <ul className="post-grid">
        {state.posts.map((p) => (
          <li key={p.id}>
            <Link to={`/post/${p.id}`} className="tile" aria-label={`Open post: ${p.text.slice(0, 60)}`}>
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

export default function Profile() {
  const { username } = useParams()
  const { user } = useAuth()
  const { data: profile, loading, error, reload, setData } = useAsync(() => api.getProfile(username), [username, user?.id])
  const [view, setView] = useState('list')
  const [editing, setEditing] = useState(false)

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

  return (
    <div className="profile">
      <div className="cover-wrap">
        {profile.cover
          ? <ParallaxLayer speed={0.12} className="cover-layer"><div className="cover" style={{ backgroundImage: `url("${profile.cover}")` }} /></ParallaxLayer>
          : <ParallaxLayer speed={0.12} className="cover-layer"><div className="cover cover-default" /></ParallaxLayer>}
      </div>
      <div className="container">
        <div className="profile-head card">
          <Avatar user={profile} size={104} className="profile-avatar" />
          <div className="profile-actions">
            {profile.isMe
              ? <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}><Icon name="edit" size={16} /> Edit profile</button>
              : <FollowButton username={profile.username} following={profile.isFollowing} onChange={(p) => setData((cur) => ({ ...cur, ...p }))} />}
          </div>
          <h1 className="profile-name">{profile.displayName}</h1>
          <p className="muted">@{profile.username} · Joined {monthYear(profile.joined)}</p>
          {profile.bio && <p className="profile-bio">{profile.bio}</p>}
          <ul className="stats">
            <li><strong>{compactNumber(profile.posts)}</strong> posts</li>
            <li><strong>{compactNumber(profile.followers)}</strong> followers</li>
            <li><strong>{compactNumber(profile.following)}</strong> following</li>
          </ul>
        </div>

        <div className="tabs" role="tablist" aria-label="Post layout">
          <button role="tab" type="button" aria-selected={view === 'list'} className="tab-btn" onClick={() => setView('list')}>Posts</button>
          <button role="tab" type="button" aria-selected={view === 'grid'} className="tab-btn" onClick={() => setView('grid')}>Grid</button>
        </div>
        <div className="profile-posts">
          {view === 'grid'
            ? <PostGrid username={profile.username} />
            : <Feed query={{ author: profile.username }} empty={<EmptyState icon="image" title="No posts yet">{profile.isMe ? 'Share your first post from the home page.' : `@${profile.username} has not posted yet.`}</EmptyState>} />}
        </div>
      </div>
      {editing && <EditProfile profile={profile} onClose={() => setEditing(false)} onSaved={(saved) => { setData((cur) => ({ ...cur, ...saved })); setEditing(false) }} />}
    </div>
  )
}
