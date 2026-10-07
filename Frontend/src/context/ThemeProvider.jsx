import { useCallback, useEffect, useMemo, useState } from 'react'
import { ThemeContext } from './contexts'

const KEY = 'orbit_theme'
const systemTheme = () => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

function initial() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return { theme: saved, chosen: true }
  } catch { /* ignore */ }
  return { theme: systemTheme(), chosen: false }
}

export default function ThemeProvider({ children }) {
  const [state, setState] = useState(initial)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', state.theme === 'dark' ? '#0b1020' : '#f6f7fb')
  }, [state.theme])

  // follow the OS setting until the visitor picks a theme explicitly
  useEffect(() => {
    if (state.chosen) return undefined
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setState({ theme: mq.matches ? 'dark' : 'light', chosen: false })
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [state.chosen])

  const toggle = useCallback(() => {
    setState((s) => {
      const next = s.theme === 'dark' ? 'light' : 'dark'
      try { localStorage.setItem(KEY, next) } catch { /* ignore */ }
      return { theme: next, chosen: true }
    })
  }, [])

  const value = useMemo(() => ({ theme: state.theme, toggle }), [state.theme, toggle])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
