import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth, useToast } from '../context/contexts'
import { useAsync } from '../hooks/useAsync'
import { useRequireAuth } from '../hooks/useRequireAuth'
import { plural } from '../lib/format'
import Avatar from './Avatar'
import Icon from './Icon'
import { ErrorState, ListSkeleton } from './States'

export function FollowButton({ username, following, onChange, size = 'md' }) {
  const guard = useRequireAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const click = async () => {
    if (!guard()) return
    setBusy(true)
    try {
      const profile = await api.toggleFollow(username)
      onChange?.(profile)
      toast.success(profile.isFollowing ? `You are following @${username}.` : `Unfollowed @${username}.`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <button type="button" className={`btn ${following ? 'btn-secondary' : 'btn-primary'} ${size === 'sm' ? 'btn-sm' : ''}`} onClick={click} disabled={busy} aria-pressed={following}>
      {following ? 'Following' : 'Follow'}
    </button>
  )
}

export function TrendingList({ compact = false }) {
  const { data, loading, error, reload } = useAsync(() => api.trending(), [])
  if (compact) {
    return (
      <ul className="chips" aria-label="Trending hashtags">
        {(data || []).map((t) => (
          <li key={t.tag}><Link className="chip" to={`/tag/${encodeURIComponent(t.tag)}`}>#{t.tag}</Link></li>
        ))}
      </ul>
    )
  }
  return (
    <section className="card side-card" aria-labelledby="trend-title">
      <h2 id="trend-title" className="side-title"><Icon name="hash" size={18} /> Trending</h2>
      {loading && <ListSkeleton count={3} />}
      {error && <ErrorState message="Could not load trends." onRetry={reload} />}
      {data && data.length === 0 && <p className="muted">Hashtags will trend here once people start using them.</p>}
      {data && (
        <ol className="trend-list">
          {data.map((t, i) => (
            <li key={t.tag}>
              <Link to={`/tag/${encodeURIComponent(t.tag)}`} className="trend">
                <span className="muted trend-rank">{i + 1}</span>
                <span className="trend-tag">#{t.tag}</span>
                <span className="muted">{plural(t.count, 'post')}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export function Suggestions() {
  const { user } = useAuth()
  const { data, loading, error, reload, setData } = useAsync(() => api.suggestions(), [user?.id])
  return (
    <section className="card side-card" aria-labelledby="who-title">
      <h2 id="who-title" className="side-title"><Icon name="users" size={18} /> Who to follow</h2>
      {loading && <ListSkeleton count={3} />}
      {error && <ErrorState message="Could not load suggestions." onRetry={reload} />}
      {data && data.length === 0 && <p className="muted">You follow everyone here. Nice.</p>}
      {data && (
        <ul className="stack-sm">
          {data.map((u) => (
            <li key={u.id} className="row">
              <Link to={`/u/${u.username}`} aria-label={`${u.displayName}, profile`}><Avatar user={u} size={40} /></Link>
              <div className="grow min0">
                <Link to={`/u/${u.username}`} className="post-name">{u.displayName}</Link>
                <div className="muted ellipsis">@{u.username}</div>
              </div>
              <FollowButton username={u.username} following={false} size="sm" onChange={() => setData((l) => l.filter((x) => x.id !== u.id))} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
