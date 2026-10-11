import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { connect, disconnect, on } from '../api/realtime'
import { NotificationsContext, useAuth, useToast } from './contexts'

const POLL_MS = 30000

// Keeps the unread badges fresh (notifications and direct messages), listens for live events and
// shares the notification list between the bell panel and the page.
export default function NotificationsProvider({ children }) {
  const { user, token } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const userId = user?.id
  const [state, setState] = useState({ unread: 0, items: null, loading: false, error: '' })
  const [unreadDm, setUnreadDm] = useState(0)
  const path = useRef(location.pathname)
  useEffect(() => { path.current = location.pathname }, [location.pathname])

  const refresh = useCallback(async () => {
    if (!userId) return
    setState((s) => ({ ...s, loading: s.items === null, error: '' }))
    try {
      const data = await api.notifications()
      setState({ unread: data.unread, items: data.items, loading: false, error: '' })
    } catch (err) {
      if (err.status !== 401) setState((s) => ({ ...s, loading: false, error: err.message }))
    }
  }, [userId])

  const refreshDm = useCallback(async () => {
    if (!userId) return
    try { setUnreadDm(await api.unreadMessages()) } catch { /* the next refresh retries */ }
  }, [userId])

  useEffect(() => {
    if (!userId) { setState({ unread: 0, items: null, loading: false, error: '' }); setUnreadDm(0); return undefined }
    refresh()
    refreshDm()
    const timer = setInterval(() => { if (!document.hidden) { refresh(); refreshDm() } }, POLL_MS)
    return () => clearInterval(timer)
  }, [userId, refresh, refreshDm])

  // live updates: a socket in real mode, a BroadcastChannel in the Live preview
  useEffect(() => {
    if (!userId) return undefined
    connect(token, userId)
    const offNote = on('notification:new', (p) => { if (!p || !p.userId || p.userId === userId) refresh() })
    const offMsg = on('message:new', (p) => {
      if (p.to !== userId && p.from !== userId) return
      refreshDm()
      if (p.to === userId && !path.current.startsWith('/messages')) {
        toast.info(`New message: ${p.message.text.length > 60 ? `${p.message.text.slice(0, 59)}...` : p.message.text}`, { label: 'Open', onClick: () => navigate('/messages') })
      }
    })
    const offRead = on('message:read', (p) => { if (!p.to || p.to === userId) refreshDm() })
    return () => { offNote(); offMsg(); offRead(); disconnect() }
  }, [userId, token, refresh, refreshDm, toast, navigate])

  const markAllRead = useCallback(async () => {
    setState((s) => ({ ...s, unread: 0, items: s.items && s.items.map((n) => ({ ...n, read: true })) }))
    try { await api.markNotificationsRead() } catch { /* the next refresh restores the real state */ }
  }, [])

  const value = useMemo(() => ({ ...state, unreadDm, refresh, refreshDm, markAllRead }), [state, unreadDm, refresh, refreshDm, markAllRead])
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}
