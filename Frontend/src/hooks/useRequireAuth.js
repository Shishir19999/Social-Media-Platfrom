import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth, useToast } from '../context/contexts'

/** Returns a guard: `guard()` is true for signed-in visitors, otherwise sends them to the login page. */
export function useRequireAuth() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  return useCallback(() => {
    if (user) return true
    toast.info('Log in to do that.')
    navigate('/login', { state: { from: location.pathname + location.search } })
    return false
  }, [user, toast, navigate, location])
}
