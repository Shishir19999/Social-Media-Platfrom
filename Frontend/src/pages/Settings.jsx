import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../api'
import { useAuth, useTheme, useToast } from '../context/contexts'
import { useAsync } from '../hooks/useAsync'
import Avatar from '../components/Avatar'
import Icon from '../components/Icon'
import { RoleBadge } from '../components/PostParts'
import { EmptyState, ErrorState, ListSkeleton } from '../components/States'

const NOTIFICATION_ROWS = [
  ['like', 'Likes and reactions', 'When someone reacts to your posts.'],
  ['comment', 'Comments and replies', 'When someone comments on a post or replies to you.'],
  ['mention', 'Mentions', 'When someone mentions @you in a post or a comment.'],
  ['follow', 'Follows and requests', 'New followers, follow requests and approvals.'],
  ['repost', 'Reposts and quotes', 'When someone reposts or quotes your post.'],
]

function Switch({ id, checked, onChange, label, help, disabled }) {
  return (
    <div className="switch-row">
      <div className="grow">
        <label htmlFor={id} className="switch-label">{label}</label>
        {help && <p className="muted" id={`${id}-help`}>{help}</p>}
      </div>
      <input id={id} type="checkbox" role="switch" className="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-describedby={help ? `${id}-help` : undefined} />
    </div>
  )
}

function Requests() {
  const toast = useToast()
  const { data, loading, error, reload, setData } = useAsync(() => api.followRequests(), [])
  const answer = async (u, action) => {
    try {
      await api.answerFollowRequest(u.username, action)
      setData((list) => list.filter((x) => x.id !== u.id))
      toast.success(action === 'accept' ? `@${u.username} can now see your posts.` : 'Request declined.')
    } catch (err) { toast.error(err.message) }
  }
  return (
    <section className="card settings-card" id="requests" aria-labelledby="req-title">
      <h2 id="req-title" className="side-title"><Icon name="userPlus" size={18} /> Follow requests</h2>
      {loading && <ListSkeleton count={2} />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.length === 0 && <p className="muted">No pending requests. People ask to follow you here when your account is private.</p>}
      {data && data.length > 0 && (
        <ul className="stack-sm">
          {data.map((u) => (
            <li key={u.id} className="row">
              <Link to={`/u/${u.username}`}><Avatar user={u} size={40} /></Link>
              <div className="grow min0"><Link to={`/u/${u.username}`} className="post-name">{u.displayName}</Link><div className="muted ellipsis">@{u.username}</div></div>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => answer(u, 'accept')} aria-label={`Accept @${u.username}`}>Accept</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => answer(u, 'decline')} aria-label={`Decline @${u.username}`}>Decline</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Relations() {
  const toast = useToast()
  const { data, loading, error, reload, setData } = useAsync(() => api.relations(), [])
  const undo = async (u, kind) => {
    try {
      await (kind === 'blocked' ? api.toggleBlock(u.username) : api.toggleMute(u.username))
      setData((d) => ({ ...d, [kind]: d[kind].filter((x) => x.id !== u.id) }))
      toast.success(kind === 'blocked' ? `Unblocked @${u.username}.` : `Unmuted @${u.username}.`)
    } catch (err) { toast.error(err.message) }
  }
  const list = (kind, title, empty, verb) => (
    <div>
      <h3 className="settings-sub">{title}</h3>
      {data[kind].length === 0 && <p className="muted">{empty}</p>}
      <ul className="stack-sm">
        {data[kind].map((u) => (
          <li key={u.id} className="row">
            <Avatar user={u} size={36} />
            <div className="grow min0"><strong>{u.displayName}</strong> <span className="muted">@{u.username}</span></div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => undo(u, kind)} aria-label={`${verb} @${u.username}`}>{verb}</button>
          </li>
        ))}
      </ul>
    </div>
  )
  return (
    <section className="card settings-card" aria-labelledby="rel-title">
      <h2 id="rel-title" className="side-title"><Icon name="ban" size={18} /> Blocked and muted accounts</h2>
      {loading && <ListSkeleton count={2} />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && (
        <div className="settings-cols">
          {list('blocked', 'Blocked', 'You have not blocked anyone. Blocked people cannot see your posts, follow or message you.', 'Unblock')}
          {list('muted', 'Muted', 'You have not muted anyone. Muted people stay hidden from your feeds.', 'Unmute')}
        </div>
      )}
    </section>
  )
}

export default function Settings() {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const toast = useToast()
  const location = useLocation()
  const { data, loading, error, reload, setData } = useAsync(() => api.getSettings(), [])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [location.hash, data])

  const save = async (patch, optimistic) => {
    const before = data
    setData(optimistic)
    setBusy(true)
    try {
      setData(await api.updateSettings(patch))
      toast.success('Settings saved.')
    } catch (err) {
      setData(before)
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container narrow settings">
      <h1 className="page-title">Settings</h1>
      <p className="muted settings-who"><Avatar user={user} size={28} /> Signed in as <strong>@{user.username}</strong> <RoleBadge role={user.role} /></p>

      {loading && <ListSkeleton count={4} />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && (
        <>
          <section className="card settings-card" aria-labelledby="priv-title">
            <h2 id="priv-title" className="side-title"><Icon name="lock" size={18} /> Privacy</h2>
            <Switch
              id="set-private"
              label="Private account"
              help="Only people you approve can follow you and see your posts. Existing followers stay. Turning it off approves everyone who is waiting."
              checked={data.isPrivate}
              disabled={busy}
              onChange={(v) => save({ isPrivate: v }, (d) => ({ ...d, isPrivate: v }))}
            />
          </section>

          <Requests />

          <section className="card settings-card" aria-labelledby="notif-title">
            <h2 id="notif-title" className="side-title"><Icon name="bell" size={18} /> Notifications</h2>
            <p className="muted">Choose what shows up in your notifications. Messages and moderator notices are always delivered.</p>
            {NOTIFICATION_ROWS.map(([key, label, help]) => (
              <Switch
                key={key}
                id={`set-n-${key}`}
                label={label}
                help={help}
                checked={data.notifications[key] !== false}
                disabled={busy}
                onChange={(v) => save({ notifications: { [key]: v } }, (d) => ({ ...d, notifications: { ...d.notifications, [key]: v } }))}
              />
            ))}
          </section>
        </>
      )}

      <Relations />

      <section className="card settings-card" aria-labelledby="look-title">
        <h2 id="look-title" className="side-title"><Icon name={theme === 'dark' ? 'moon' : 'sun'} size={18} /> Appearance</h2>
        <Switch id="set-dark" label="Dark mode" help="Starts from your device setting; your choice is remembered on this device." checked={theme === 'dark'} onChange={toggle} />
      </section>

      <section className="card settings-card" aria-labelledby="acct-title">
        <h2 id="acct-title" className="side-title"><Icon name="user" size={18} /> Account</h2>
        <div className="row">
          <Link to={`/u/${user.username}`} className="btn btn-secondary">View my profile</Link>
          <button type="button" className="btn btn-secondary" onClick={() => logout()}><Icon name="logout" size={16} /> Log out</button>
        </div>
      </section>
      {!data && !loading && !error && <EmptyState title="Nothing to show" />}
    </div>
  )
}
