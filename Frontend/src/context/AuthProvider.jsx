import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { loadAuth, saveAuth } from '../api/shared'
import { AuthContext } from './contexts'

export default function AuthProvider({ children }) {
  const [auth, setAuth] = useState(loadAuth)
  const [checking, setChecking] = useState(() => !!loadAuth().token)

  const persist = useCallback((data) => {
    saveAuth(data)
    setAuth(data)
  }, [])

  const login = useCallback(async (identifier, password) => {
    const data = await api.login(identifier, password)
    persist({ token: data.token, user: data.user })
    return data.user
  }, [persist])

  const register = useCallback(async (username, email, password) => {
    const data = await api.register(username, email, password)
    persist({ token: data.token, user: data.user })
    return data.user
  }, [persist])

  // Revoke the token on the server (best effort), then clear local state.
  const logout = useCallback(async () => {
    try { await api.logout() } catch { /* already invalid or server unreachable: sign out locally anyway */ }
    persist({ token: null, user: null })
  }, [persist])

  const updateUser = useCallback((patch) => {
    setAuth((current) => {
      const next = { ...current, user: { ...current.user, ...patch } }
      saveAuth(next)
      return next
    })
  }, [])

  // Validate a stored session once on start (it may have been revoked, or demo data was reset).
  useEffect(() => {
    if (!loadAuth().token) return undefined
    let live = true
    api.me()
      .then((data) => { if (live) setAuth((c) => { const next = { ...c, user: data.user }; saveAuth(next); return next }) })
      .catch((err) => { if (live && err.status === 401) persist({ token: null, user: null }) })
      .finally(() => { if (live) setChecking(false) })
    return () => { live = false }
  }, [persist])

  // The server rejected our token (revoked or expired) while using the app.
  useEffect(() => {
    const onExpired = () => persist({ token: null, user: null })
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [persist])

  const value = useMemo(
    () => ({ user: auth.user, token: auth.token, checking, login, register, logout, updateUser }),
    [auth.user, auth.token, checking, login, register, logout, updateUser],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
