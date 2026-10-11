import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth, useNotifications, useTheme } from '../context/contexts'
import { isStaff } from '../lib/rules'
import { DEMO } from '../config'
import Avatar from './Avatar'
import { DemoBannerLazy } from './demoLazy'
import Icon from './Icon'
import Menu from './Menu'
import NotificationItem from './NotificationItem'
import { EmptyState, ErrorState, ListSkeleton } from './States'

function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Orbit, home">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="var(--primary)" /><ellipse cx="16" cy="16" rx="12" ry="5" fill="none" stroke="#fff" strokeWidth="2" transform="rotate(-25 16 16)" /><circle cx="25" cy="11" r="3" fill="#fff" /></svg>
      <span>Orbit</span>
    </Link>
  )
}

function SearchBox() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { pathname } = useLocation()
  const [q, setQ] = useState(pathname === '/search' ? params.get('q') || '' : '')
  return (
    <form
      role="search"
      className="searchbox"
      onSubmit={(e) => { e.preventDefault(); if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`) }}
    >
      <Icon name="search" size={18} />
      <label htmlFor="global-search" className="sr-only">Search people, posts and hashtags</label>
      <input id="global-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people, posts, #tags" autoComplete="off" />
    </form>
  )
}

function Bell() {
  const { unread, items, loading, error, refresh, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const wrap = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    refresh()
    const onDoc = (e) => { if (!wrap.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open, refresh])

  return (
    <div className="menu bell" ref={wrap}>
      <button type="button" className="icon-btn" aria-haspopup="dialog" aria-expanded={open} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} onClick={() => setOpen((o) => !o)}>
        <Icon name="bell" />
        {unread > 0 && <span className="badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="menu-list panel" role="dialog" aria-label="Notifications panel">
          <div className="panel-head">
            <strong>Notifications</strong>
            {unread > 0 && <button type="button" className="link-btn" onClick={markAllRead}>Mark all read</button>}
          </div>
          <div className="panel-body">
            {loading && <ListSkeleton count={3} />}
            {error && <ErrorState message="Could not load notifications." onRetry={refresh} />}
            {items && items.length === 0 && <EmptyState icon="bell" title="All quiet">Reactions, comments, follows and mentions will show up here.</EmptyState>}
            {items && items.length > 0 && <ul>{items.slice(0, 6).map((n) => <NotificationItem key={n.id} n={n} onNavigate={() => setOpen(false)} />)}</ul>}
          </div>
          <Link to="/notifications" className="panel-foot" onClick={() => setOpen(false)}>See all notifications</Link>
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const { unread, unreadDm } = useNotifications()
  const staff = !!user && isStaff(user.role)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const main = useRef(null)

  useEffect(() => { window.scrollTo(0, 0) }, [pathname])

  const userMenu = user && [
    { label: 'Your profile', icon: 'user', onSelect: () => navigate(`/u/${user.username}`) },
    { label: 'Saved posts', icon: 'bookmark', onSelect: () => navigate('/saved') },
    { label: 'Messages', icon: 'mail', onSelect: () => navigate('/messages') },
    { label: 'Settings', icon: 'settings', onSelect: () => navigate('/settings') },
    staff && { label: user.role === 'admin' ? 'Admin tools' : 'Moderation tools', icon: 'shield', onSelect: () => navigate('/admin') },
    { label: 'Log out', icon: 'logout', onSelect: async () => { await logout(); navigate('/') } },
  ]

  return (
    <div className="shell">
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); main.current?.focus() }}>Skip to content</a>
      {DEMO && <DemoBannerLazy />}
      <header className="topbar">
        <div className="topbar-in">
          <Logo />
          <SearchBox />
          <nav className="topnav" aria-label="Main">
            <NavLink to="/" end className="navlink"><Icon name="home" /><span>Home</span></NavLink>
            <NavLink to="/explore" className="navlink"><Icon name="sparkles" /><span>Explore</span></NavLink>
            {user && <NavLink to="/saved" className="navlink"><Icon name="bookmark" /><span>Saved</span></NavLink>}
            {user && (
              <NavLink to="/messages" className="navlink" aria-label={unreadDm ? `Messages, ${unreadDm} unread` : 'Messages'}>
                <span className="tab-ico"><Icon name="mail" />{unreadDm > 0 && <span className="badge" aria-hidden="true">{unreadDm > 9 ? '9+' : unreadDm}</span>}</span><span>Messages</span>
              </NavLink>
            )}
            {staff && <NavLink to="/admin" className="navlink"><Icon name="shield" /><span>{user.role === 'admin' ? 'Admin' : 'Moderate'}</span></NavLink>}
          </nav>
          <div className="topbar-end">
            <button type="button" className="icon-btn" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
            {user ? (
              <>
                <Bell />
                <div className="user-menu">
                  <Menu label="Account menu" items={userMenu} icon="user" />
                </div>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost btn-sm">Log in</Link>
                <Link to="/register" className="btn btn-primary btn-sm">Sign up</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main" ref={main} tabIndex={-1} className="main">
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Mobile">
        <NavLink to="/" end className="tab"><Icon name="home" /><span>Home</span></NavLink>
        <NavLink to="/explore" className="tab"><Icon name="sparkles" /><span>Explore</span></NavLink>
        {user ? (
          <>
            <NavLink to="/messages" className="tab">
              <span className="tab-ico"><Icon name="mail" />{unreadDm > 0 && <span className="badge" aria-hidden="true">{unreadDm > 9 ? '9+' : unreadDm}</span>}</span><span>Messages</span>
            </NavLink>
            <NavLink to="/notifications" className="tab">
              <span className="tab-ico"><Icon name="bell" />{unread > 0 && <span className="badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}</span><span>Alerts</span>
            </NavLink>
            <NavLink to={`/u/${user.username}`} className="tab"><Avatar user={user} size={22} /><span>Me</span></NavLink>
          </>
        ) : (
          <>
            <NavLink to="/search" className="tab"><Icon name="search" /><span>Search</span></NavLink>
            <NavLink to="/login" className="tab"><Icon name="user" /><span>Log in</span></NavLink>
          </>
        )}
      </nav>
    </div>
  )
}
