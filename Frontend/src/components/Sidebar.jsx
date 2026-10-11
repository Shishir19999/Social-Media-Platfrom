import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth, useToast } from '../context/contexts'
import { useAsync } from '../hooks/useAsync'
import { useRequireAuth } from '../hooks/useRequireAuth'
import { plural } from '../lib/format'
import Avatar from './Avatar'
import Icon from './Icon'
import { RoleBadge } from './PostParts'
import { ErrorState, ListSkeleton } from './States'

/** Follow / Requested / Following toggle. Private accounts turn a follow into a request. */
export function FollowButton({ username, following, requested = false, onChange, size = 'md' }) {
  const guard = useRequireAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  // the local (optimistic) state only lives until the parent passes new values
  const sig = `${following}|${requested}`
  const [local, setLocal] = useState({ sig, value: { following, requested } })
  const state = local.sig === sig ? local.value : { following, requested }
  const setState = (value) => setLocal({ sig, value })

  const click = async () => {
    if (!guard()) return
    setBusy(true)
    const before = state
    setState(before.following || before.requested ? { following: false, requested: false } : { following: true, requested: false })
    try {
      const profile = await api.toggleFollow(username)
      setState({ following: profile.isFollowing, requested: profile.requested })
      onChange?.(profile)
      if (profile.isFollowing) toast.success(`You are following @${username}.`)
      else if (profile.requested) toast.success(`Follow request sent to @${username}.`)
      else toast.success(before.requested ? 'Request cancelled.' : `Unfollowed @${username}.`)
    } catch (err) {
      setState(before)
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const label = state.following ? 'Following' : state.requested ? 'Requested' : 'Follow'
  const on = state.following || state.requested
  return (
    <button type="button" className={`btn ${on ? 'btn-secondary' : 'btn-primary'} ${size === 'sm' ? 'btn-sm' : ''}`} onClick={click} disabled={busy} aria-pressed={on} aria-label={`${label} @${username}`}>
      {label}
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

/** A person with a follow button; `reason` explains why they are suggested. */
export function PersonRow({ person, onFollowed, size = 'sm' }) {
  return (
    <li className="row">
      <Link to={`/u/${person.username}`} aria-label={`${person.displayName}, profile`}><Avatar user={person} size={40} /></Link>
      <div className="grow min0">
        <Link to={`/u/${person.username}`} className="post-name">{person.displayName}</Link> <RoleBadge role={person.role} />
        <div className="muted ellipsis">@{person.username}{person.reason ? ` · ${person.reason}` : ''}</div>
      </div>
      <FollowButton username={person.username} following={!!person.isFollowing} size={size} onChange={onFollowed} />
    </li>
  )
}

export function Suggestions() {
  const { user } = useAuth()
  const { data, loading, error, reload, setData } = useAsync(() => api.suggestions({ limit: 5 }), [user?.id])
  return (
    <section className="card side-card" aria-labelledby="who-title">
      <h2 id="who-title" className="side-title"><Icon name="users" size={18} /> Who to follow</h2>
      {loading && <ListSkeleton count={3} />}
      {error && <ErrorState message="Could not load suggestions." onRetry={reload} />}
      {data && data.length === 0 && <p className="muted">You follow everyone here. Nice.</p>}
      {data && (
        <ul className="stack-sm">
          {data.map((u) => (
            <PersonRow key={u.id} person={u} onFollowed={(p) => { if (p.isFollowing) setData((l) => l.filter((x) => x.id !== u.id)) }} />
          ))}
        </ul>
      )}
    </section>
  )
}
