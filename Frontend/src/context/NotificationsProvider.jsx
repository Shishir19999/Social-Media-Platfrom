import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { NotificationsContext, useAuth } from './contexts'

const POLL_MS = 30000

// Keeps the unread badge fresh and shares the notification list between the bell panel and the page.
export default function NotificationsProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id
  const [state, setState] = useState({ unread: 0, items: null, loading: false, error: '' })

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

  useEffect(() => {
    if (!userId) { setState({ unread: 0, items: null, loading: false, error: '' }); return undefined }
    refresh()
    const timer = setInterval(() => { if (!document.hidden) refresh() }, POLL_MS)
    return () => clearInterval(timer)
  }, [userId, refresh])

  const markAllRead = useCallback(async () => {
    setState((s) => ({ ...s, unread: 0, items: s.items && s.items.map((n) => ({ ...n, read: true })) }))
    try { await api.markNotificationsRead() } catch { /* the next refresh restores the real state */ }
  }, [])

  const value = useMemo(() => ({ ...state, refresh, markAllRead }), [state, refresh, markAllRead])
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}
