import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth, useNotifications } from '../context/contexts'
import { useAsync } from '../hooks/useAsync'
import Avatar from '../components/Avatar'
import Comments from '../components/Comments'
import Feed from '../components/Feed'
import Icon from '../components/Icon'
import NotificationItem from '../components/NotificationItem'
import PostCard from '../components/PostCard'
import { Suggestions, TrendingList } from '../components/Sidebar'
import { EmptyState, ErrorState, FeedSkeleton, ListSkeleton } from '../components/States'
import { highlightParts } from '../lib/richtext'
import { plural } from '../lib/format'

export function RequireAuth({ children }) {
  const { user, checking } = useAuth()
  const location = useLocation()
  if (checking) return <div className="container"><FeedSkeleton count={2} /></div>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return children
}

export function PostPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, loading, error, reload, setData } = useAsync(() => api.getPost(id), [id])
  return (
    <div className="container layout-2">
      <div className="col">
        <button type="button" className="btn btn-ghost btn-sm back" onClick={() => navigate(-1)}><Icon name="arrowLeft" size={16} /> Back</button>
        {loading && <FeedSkeleton count={1} />}
        {error && (error.includes('private account')
          ? <EmptyState icon="lock" title="This account is private" action={<Link className="btn btn-primary" to="/explore">Back to Explore</Link>}>{error}</EmptyState>
          : error.includes('not found')
          ? <EmptyState icon="search" title="Post not found" action={<Link className="btn btn-primary" to="/explore">Back to Explore</Link>}>It may have been deleted.</EmptyState>
          : <ErrorState message={error} onRetry={reload} />)}
        {data && !loading && !error && (
          <>
            <PostCard post={data} detail onChange={setData} onRemove={() => navigate('/', { replace: true })} />
            {data.status === 'published' && <Comments postId={data.id} postAuthorId={data.author.id} onCount={(n) => setData((p) => ({ ...p, commentsCount: n }))} />}
          </>
        )}
      </div>
      <aside className="aside"><TrendingList /><Suggestions /></aside>
    </div>
  )
}

export function TagPage() {
  const { tag } = useParams()
  return (
    <div className="container layout-2">
      <div className="col">
        <h1 className="page-title">#{tag}</h1>
        <Feed query={{ tag }} empty={<EmptyState icon="hash" title={`No posts tagged #${tag}`}>Be the first to use it.</EmptyState>} />
      </div>
      <aside className="aside"><TrendingList /><Suggestions /></aside>
    </div>
  )
}

export function SavedPage() {
  return (
    <div className="container layout-2">
      <div className="col">
        <h1 className="page-title">Saved posts</h1>
        <Feed query={{ saved: true }} empty={<EmptyState icon="bookmark" title="Nothing saved yet" action={<Link to="/explore" className="btn btn-primary">Explore posts</Link>}>Tap the bookmark on a post to keep it here.</EmptyState>} />
      </div>
      <aside className="aside"><TrendingList /></aside>
    </div>
  )
}

function Highlight({ text, q }) {
  return highlightParts(text, q).map((p, i) => (p.match ? <mark key={i}>{p.text}</mark> : p.text))
}

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const initial = params.get('q') || ''
  const kind = ['all', 'people', 'posts', 'tags'].includes(params.get('in')) ? params.get('in') : 'all'
  const [typed, setTyped] = useState(null)
  const input = typed ?? initial
  const q = initial
  const { data, loading, error, reload, setData } = useAsync(() => (q.trim() ? api.search(q) : Promise.resolve(null)), [q])

  const setKind = (k) => setParams((p) => { const n = new URLSearchParams(p); if (k === 'all') n.delete('in'); else n.set('in', k); return n }, { replace: true })

  // live search while typing
  useEffect(() => {
    if (typed === null) return undefined
    const t = setTimeout(() => {
      setParams((p) => { const n = new URLSearchParams(p); if (typed.trim()) n.set('q', typed.trim()); else n.delete('q'); return n }, { replace: true })
      setTyped(null)
    }, 350)
    return () => clearTimeout(t)
  }, [typed, setParams])

  const nothing = data && !data.users.length && !data.posts.length && !data.tags.length
  const show = (k) => kind === 'all' || kind === k
  const tabs = [['all', 'All'], ['people', `People${data ? ` (${data.users.length})` : ''}`], ['posts', `Posts${data ? ` (${data.posts.length})` : ''}`], ['tags', `Hashtags${data ? ` (${data.tags.length})` : ''}`]]
  return (
    <div className="container layout-2">
      <div className="col">
        <h1 className="page-title">Search</h1>
        <div className="field">
          <label htmlFor="search-page-input" className="sr-only">Search</label>
          <input id="search-page-input" type="search" value={input} onChange={(e) => setTyped(e.target.value)} placeholder="People, posts or #hashtags" autoFocus />
        </div>
        {q.trim() && (
          <div className="tabs tabs-top" role="tablist" aria-label="Result type">
            {tabs.map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={kind === k} className="tab-btn" onClick={() => setKind(k)}>{label}</button>
            ))}
          </div>
        )}
        {!q.trim() && <EmptyState icon="search" title="Find people, posts and hashtags">Type above to search. Try a name, a word or a #topic.</EmptyState>}
        {q.trim() && loading && <ListSkeleton count={4} />}
        {error && <ErrorState message={error} onRetry={reload} />}
        {nothing && <EmptyState icon="search" title={`No results for "${q}"`}>Check the spelling or try a different word.</EmptyState>}
        {data && !nothing && (
          <>
            {show('tags') && data.tags.length > 0 && (
              <section aria-labelledby="s-tags" className="card side-card">
                <h2 id="s-tags" className="side-title">Hashtags</h2>
                <ul className="chips">{data.tags.map((t) => <li key={t.tag}><Link className="chip" to={`/tag/${encodeURIComponent(t.tag)}`}>#{t.tag} <span className="muted">{plural(t.count, 'post')}</span></Link></li>)}</ul>
              </section>
            )}
            {show('people') && data.users.length > 0 && (
              <section aria-labelledby="s-users" className="card side-card">
                <h2 id="s-users" className="side-title">People</h2>
                <ul className="stack-sm">
                  {data.users.map((u) => (
                    <li key={u.id} className="row">
                      <Link to={`/u/${u.username}`} aria-label={`${u.displayName}, profile`}><Avatar user={u} size={44} /></Link>
                      <div className="grow min0">
                        <Link to={`/u/${u.username}`} className="post-name"><Highlight text={u.displayName} q={q} /></Link>
                        <div className="muted">@<Highlight text={u.username} q={q} /></div>
                        {u.bio && <div className="muted ellipsis">{u.bio}</div>}
                      </div>
                      <Link to={`/messages/${u.username}`} className="icon-btn" aria-label={`Message @${u.username}`}><Icon name="mail" /></Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {show('posts') && data.posts.length > 0 && (
              <section aria-labelledby="s-posts">
                <h2 id="s-posts" className="section-title">Posts</h2>
                {data.posts.map((p) => (
                  <PostCard key={p.id} post={p}
                    onChange={(np) => setData((d) => ({ ...d, posts: d.posts.map((x) => (x.id === np.id ? np : x)) }))}
                    onRemove={(id) => setData((d) => ({ ...d, posts: d.posts.filter((x) => x.id !== id) }))} />
                ))}
              </section>
            )}
            {kind !== 'all' && data[kind === 'people' ? 'users' : kind].length === 0 && <EmptyState icon="search" title="Nothing in this tab">Try the All tab.</EmptyState>}
          </>
        )}
      </div>
      <aside className="aside"><TrendingList /></aside>
    </div>
  )
}

export function NotificationsPage() {
  const { items, loading, error, refresh, unread, markAllRead } = useNotifications()
  useEffect(() => { refresh() }, [refresh])
  return (
    <div className="container narrow">
      <div className="page-head">
        <h1 className="page-title">Notifications</h1>
        {unread > 0 && <button type="button" className="btn btn-secondary btn-sm" onClick={markAllRead}>Mark all read</button>}
      </div>
      <div className="card notif-list">
        {loading && !items && <ListSkeleton count={4} />}
        {error && !items && <ErrorState message={error} onRetry={refresh} />}
        {items && items.length === 0 && <EmptyState icon="bell" title="All quiet">Reactions, comments, replies, mentions and follows will show up here.</EmptyState>}
        {items && items.length > 0 && <ul>{items.map((n) => <NotificationItem key={n.id} n={n} />)}</ul>}
      </div>
    </div>
  )
}

export function NotFound() {
  return (
    <div className="container narrow">
      <EmptyState icon="search" title="404 - page not found" action={<Link to="/" className="btn btn-primary">Go home</Link>}>
        The page you are looking for does not exist or has moved.
      </EmptyState>
    </div>
  )
}
