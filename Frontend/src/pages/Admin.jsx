import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth, useConfirm, useToast } from '../context/contexts'
import { useAsync } from '../hooks/useAsync'
import Avatar from '../components/Avatar'
import Icon from '../components/Icon'
import Modal from '../components/Modal'
import PostCard from '../components/PostCard'
import { ModerateDialog, RoleBadge } from '../components/PostParts'
import { EmptyState, ErrorState, FeedSkeleton, ListSkeleton } from '../components/States'
import { fullDate, plural, timeAgo } from '../lib/format'
import { LIMITS, ROLES, SUSPEND_DAYS, canActOnUser, isStaff } from '../lib/rules'

const TABS = [
  ['overview', 'Overview', 'dashboard'],
  ['reports', 'Reports', 'flag'],
  ['posts', 'Moderated posts', 'eyeOff'],
  ['users', 'People', 'users'],
  ['audit', 'Audit log', 'history'],
]

const ACTION_LABELS = {
  'report.hide': 'Hid a reported post',
  'report.remove': 'Removed a reported post',
  'report.dismiss': 'Dismissed a report',
  'post.hide': 'Hid a post',
  'post.remove': 'Removed a post',
  'post.restore': 'Restored a post',
  'user.suspend': 'Suspended an account',
  'user.ban': 'Banned an account',
  'user.restore': 'Restored an account',
  'user.role': 'Changed a role',
}

function Pager({ page, pages, onPage }) {
  if (pages <= 1) return null
  return (
    <nav className="pager" aria-label="Pages">
      <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}><Icon name="chevronLeft" size={16} /> Previous</button>
      <span className="muted">Page {page} of {pages}</span>
      <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next <Icon name="chevronRight" size={16} /></button>
    </nav>
  )
}

function Stat({ icon, label, value, tone }) {
  return (
    <li className={`card stat ${tone ? `stat-${tone}` : ''}`}>
      <span className="state-icon"><Icon name={icon} size={22} /></span>
      <span className="stat-value">{value}</span>
      <span className="muted">{label}</span>
    </li>
  )
}

function Overview() {
  const { data, loading, error, reload } = useAsync(() => api.modStats(), [])
  if (loading) return <ListSkeleton count={4} />
  if (error) return <ErrorState message={error} onRetry={reload} />
  const max = Math.max(1, ...data.series.map((d) => d.posts))
  return (
    <>
      <ul className="stats-grid" aria-label="Statistics">
        <Stat icon="users" label="People" value={data.users} />
        <Stat icon="message" label="Posts" value={data.posts} />
        <Stat icon="flag" label="Posts with open reports" value={data.openReports} tone={data.openReports ? 'warn' : ''} />
        <Stat icon="eyeOff" label="Hidden or removed posts" value={data.moderated} />
        <Stat icon="clock" label="Suspended accounts" value={data.suspended} />
        <Stat icon="ban" label="Banned accounts" value={data.banned} />
        <Stat icon="userPlus" label="New people, last 7 days" value={data.newUsers} />
        <Stat icon="poll" label="New posts, last 7 days" value={data.newPosts} />
      </ul>
      <section className="card" aria-labelledby="chart-title">
        <h2 id="chart-title" className="side-title"><Icon name="poll" size={18} /> Posts per day</h2>
        <div className="bars" role="img" aria-label={`Posts per day for the last seven days: ${data.series.map((d) => `${d.day}: ${d.posts}`).join(', ')}`}>
          {data.series.map((d) => (
            <div key={d.day} className="bar-col">
              <span className="bar-n">{d.posts}</span>
              <span className="bar" style={{ height: `${Math.max(4, (d.posts / max) * 100)}%` }} />
              <span className="bar-label muted">{d.day.slice(5)}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

function ResolveDialog({ item, onClose, onDone }) {
  const toast = useToast()
  const [action, setAction] = useState('hide')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.resolveReport(item.postId, { action, note })
      toast.success(action === 'dismiss' ? 'Report dismissed.' : action === 'hide' ? 'Post hidden.' : 'Post removed.')
      onDone()
    } catch (err) {
      toast.error(err.message)
      setBusy(false)
    }
  }
  return (
    <Modal title="Resolve report" onClose={onClose} size="sm">
      <form onSubmit={submit}>
        <fieldset className="radio-group">
          <legend className="modal-text">What should happen to this post? The decision is written to the audit log.</legend>
          <label className="radio radio-block"><input type="radio" name="act" checked={action === 'dismiss'} onChange={() => setAction('dismiss')} /> <span><strong>Dismiss</strong><br /><span className="muted">The post is fine and stays visible.</span></span></label>
          <label className="radio radio-block"><input type="radio" name="act" checked={action === 'hide'} onChange={() => setAction('hide')} /> <span><strong>Hide</strong><br /><span className="muted">Only the author and staff can see it. Reversible.</span></span></label>
          <label className="radio radio-block"><input type="radio" name="act" checked={action === 'remove'} onChange={() => setAction('remove')} /> <span><strong>Remove</strong><br /><span className="muted">It breaks the rules. The author is told.</span></span></label>
        </fieldset>
        <div className="field">
          <label htmlFor="res-note">Note (optional)</label>
          <textarea id="res-note" rows={2} maxLength={LIMITS.modNote} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>Apply</button>
        </div>
      </form>
    </Modal>
  )
}

function Reports() {
  const [status, setStatus] = useState('open')
  const [page, setPage] = useState(1)
  const [resolving, setResolving] = useState(null)
  const { data, loading, error, reload } = useAsync(() => api.modReports({ status, page }), [status, page])
  return (
    <>
      <div className="tabs tabs-sub" role="tablist" aria-label="Report status">
        {[['open', 'Open'], ['closed', 'Closed']].map(([v, l]) => (
          <button key={v} type="button" role="tab" aria-selected={status === v} className="tab-btn" onClick={() => { setStatus(v); setPage(1) }}>{l}</button>
        ))}
      </div>
      {loading && <FeedSkeleton count={2} />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.items.length === 0 && <EmptyState icon="check" title={status === 'open' ? 'The queue is empty' : 'Nothing closed yet'}>{status === 'open' ? 'No open reports. Nice work.' : 'Resolved reports appear here.'}</EmptyState>}
      {data && data.items.map((item) => (
        <section key={item.postId} className="report" aria-label={`Report on a post, ${plural(item.count, 'report')}`}>
          <div className="report-meta card">
            <p><strong>{plural(item.count, 'report')}</strong> · last {timeAgo(item.lastAt)} ago{item.resolution ? ` · ${item.resolution}` : ''}</p>
            <ul className="report-reasons">
              {item.reports.map((r, i) => (
                <li key={i}><span className="muted">@{r.reporter.username}</span> {r.reason || 'No reason given'}</li>
              ))}
            </ul>
          </div>
          {item.post
            ? <PostCard post={item.post} onChange={() => {}} onRemove={() => {}} footer={status === 'open' && (
              <div className="report-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setResolving(item)}>Resolve report</button>
                <Link className="btn btn-ghost btn-sm" to={`/u/${item.post.author.username}`}>View author</Link>
              </div>
            )} />
            : <div className="card muted">The post no longer exists.</div>}
        </section>
      ))}
      {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
      {resolving && <ResolveDialog item={resolving} onClose={() => setResolving(null)} onDone={() => { setResolving(null); reload() }} />}
    </>
  )
}

function ModeratedPosts() {
  const [page, setPage] = useState(1)
  const [target, setTarget] = useState(null)
  const { data, loading, error, reload } = useAsync(() => api.modPosts({ page }), [page])
  return (
    <>
      {loading && <FeedSkeleton count={2} />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.items.length === 0 && <EmptyState icon="eyeOff" title="No moderated posts">Hidden and removed posts are listed here so they can be restored.</EmptyState>}
      {data && data.items.map((p) => (
        <PostCard key={p.id} post={p} onChange={() => {}} onRemove={() => {}} footer={(
          <div className="report-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setTarget(p)}>Change decision</button>
          </div>
        )} />
      ))}
      {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
      {target && <ModerateDialog post={target} onClose={() => setTarget(null)} onDone={() => { setTarget(null); reload() }} />}
    </>
  )
}

function StatusDialog({ person, action, onClose, onDone }) {
  const toast = useToast()
  const [days, setDays] = useState(7)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.setUserStatus(person.id, { action, days, reason })
      toast.success(action === 'suspend' ? `@${person.username} is suspended for ${days} days.` : `@${person.username} is banned.`)
      onDone()
    } catch (err) {
      toast.error(err.message)
      setBusy(false)
    }
  }
  return (
    <Modal title={action === 'suspend' ? `Suspend @${person.username}` : `Ban @${person.username}`} onClose={onClose} size="sm">
      <form onSubmit={submit}>
        <p className="modal-text">{action === 'suspend'
          ? 'A suspended person can read but not post, comment, react, follow or message until the suspension ends.'
          : 'A banned account is signed out everywhere and cannot log in. You can restore it later.'}</p>
        {action === 'suspend' && (
          <fieldset className="radio-group">
            <legend className="sr-only">How long</legend>
            {SUSPEND_DAYS.map((d) => <label key={d} className="radio"><input type="radio" name="days" checked={days === d} onChange={() => setDays(d)} /> {d === 1 ? '1 day' : `${d} days`}</label>)}
          </fieldset>
        )}
        <div className="field">
          <label htmlFor="st-reason">Reason (shown to the person, written to the log)</label>
          <textarea id="st-reason" rows={2} maxLength={LIMITS.modNote} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className={`btn ${action === 'ban' ? 'btn-danger' : 'btn-primary'}`} disabled={busy}>{action === 'suspend' ? 'Suspend' : 'Ban account'}</button>
        </div>
      </form>
    </Modal>
  )
}

function People({ me }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [filters, setFilters] = useState({ q: '', role: '', status: '' })
  const [applied, setApplied] = useState(filters)
  const [page, setPage] = useState(1)
  const [dialog, setDialog] = useState(null)
  const { data, loading, error, reload } = useAsync(() => api.modUsers({ ...applied, page }), [applied, page])
  const admin = me.role === 'admin'

  const restore = async (p) => {
    try { await api.setUserStatus(p.id, { action: 'restore' }); toast.success(`@${p.username} is active again.`); reload() } catch (err) { toast.error(err.message) }
  }
  const changeRole = async (p, role) => {
    const ok = await confirm({ title: `Make @${p.username} ${role === 'user' ? 'a regular user' : `a ${role}`}?`, message: role === 'user' ? 'They lose all staff tools.' : 'They gain access to the staff tools.', confirmLabel: 'Change role' })
    if (!ok) { reload(); return }
    try { await api.setUserRole(p.id, role); toast.success('Role updated.') } catch (err) { toast.error(err.message) }
    reload()
  }

  return (
    <>
      <form className="filters card" role="search" aria-label="Find people" onSubmit={(e) => { e.preventDefault(); setApplied(filters); setPage(1) }}>
        <div className="field">
          <label htmlFor="pf-q">Name or username</label>
          <input id="pf-q" type="search" value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="pf-role">Role</label>
          <select id="pf-role" value={filters.role} onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value }))}>
            <option value="">Any role</option>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pf-status">Status</label>
          <select id="pf-status" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="">Any status</option>
            <option value="active">active</option>
            <option value="suspended">suspended</option>
            <option value="banned">banned</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary">Search</button>
      </form>
      {loading && <ListSkeleton count={4} />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.items.length === 0 && <EmptyState icon="users" title="No one matches">Try different filters.</EmptyState>}
      {data && data.items.length > 0 && (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="People table">
          <table className="table">
            <caption className="sr-only">People, with their role, status and the moderation actions available to you</caption>
            <thead>
              <tr><th scope="col">Person</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Posts</th><th scope="col">Joined</th><th scope="col">Actions</th></tr>
            </thead>
            <tbody>
              {data.items.map((p) => {
                const can = canActOnUser(me, p)
                return (
                  <tr key={p.id}>
                    <th scope="row">
                      <span className="row"><Avatar user={p} size={32} /><span className="min0"><Link to={`/u/${p.username}`} className="post-name">{p.displayName}</Link><br /><span className="muted">@{p.username}{p.email ? ` · ${p.email}` : ''}</span></span></span>
                    </th>
                    <td>
                      {admin && p.id !== me.id
                        ? (
                          <select aria-label={`Role for @${p.username}`} value={p.role} onChange={(e) => changeRole(p, e.target.value)}>
                            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        )
                        : <>{p.role === 'user' ? 'user' : <RoleBadge role={p.role} />}</>}
                    </td>
                    <td>
                      <span className={`status status-${p.status}`}>{p.status}</span>
                      {p.suspendedUntil && <span className="muted"> until {new Date(p.suspendedUntil).toLocaleDateString()}</span>}
                      {p.statusReason && <div className="muted">{p.statusReason}</div>}
                    </td>
                    <td>{p.posts}</td>
                    <td className="muted">{new Date(p.joined).toLocaleDateString()}</td>
                    <td>
                      {can ? (
                        <span className="row-actions">
                          {p.status !== 'active' && <button type="button" className="btn btn-secondary btn-sm" onClick={() => restore(p)} aria-label={`Restore @${p.username}`}>Restore</button>}
                          {p.status !== 'banned' && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog({ p, action: 'suspend' })} aria-label={`Suspend @${p.username}`}>Suspend</button>}
                          {admin && p.status !== 'banned' && <button type="button" className="btn btn-danger btn-sm" onClick={() => setDialog({ p, action: 'ban' })} aria-label={`Ban @${p.username}`}>Ban</button>}
                        </span>
                      ) : <span className="muted">{p.id === me.id ? 'You' : 'No action'}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
      {dialog && <StatusDialog person={dialog.p} action={dialog.action} onClose={() => setDialog(null)} onDone={() => { setDialog(null); reload() }} />}
    </>
  )
}

function Audit() {
  const [page, setPage] = useState(1)
  const { data, loading, error, reload } = useAsync(() => api.auditLog({ page }), [page])
  return (
    <>
      {loading && <ListSkeleton count={5} />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.items.length === 0 && <EmptyState icon="history" title="The log is empty">Staff actions are recorded here.</EmptyState>}
      {data && data.items.length > 0 && (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Audit log table">
          <table className="table">
            <caption className="sr-only">Every moderation and administration action, newest first</caption>
            <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">Action</th><th scope="col">Target</th><th scope="col">Note</th></tr></thead>
            <tbody>
              {data.items.map((a) => (
                <tr key={a.id}>
                  <td className="muted"><time dateTime={a.createdAt}>{fullDate(a.createdAt)}</time></td>
                  <td><span className="row"><Avatar user={a.actor} size={24} /> @{a.actor.username}</span></td>
                  <td>{ACTION_LABELS[a.action] || a.action}</td>
                  <td className="ellipsis audit-target">{a.targetLabel || a.targetId}</td>
                  <td className="muted">{a.note || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
    </>
  )
}

export default function Admin() {
  const { tab = 'overview' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  if (!isStaff(user.role)) return <Navigate to="/" replace />
  const known = TABS.some(([key]) => key === tab)
  const current = known ? tab : 'overview'
  return (
    <div className="container admin">
      <div className="page-head">
        <h1 className="page-title">{user.role === 'admin' ? 'Administration' : 'Moderation'}</h1>
        <span className="muted">Signed in as <RoleBadge role={user.role} /> @{user.username}</span>
      </div>
      <div className="tabs" role="tablist" aria-label="Staff tools">
        {TABS.map(([key, label, icon]) => (
          <button key={key} role="tab" type="button" id={`admin-tab-${key}`} aria-selected={current === key} aria-controls="admin-panel" className="tab-btn" onClick={() => navigate(key === 'overview' ? '/admin' : `/admin/${key}`)}>
            <Icon name={icon} size={16} /> {label}
          </button>
        ))}
      </div>
      <div id="admin-panel" role="tabpanel" aria-labelledby={`admin-tab-${current}`}>
        {current === 'overview' && <Overview />}
        {current === 'reports' && <Reports />}
        {current === 'posts' && <ModeratedPosts />}
        {current === 'users' && <People me={user} />}
        {current === 'audit' && <Audit />}
      </div>
    </div>
  )
}
