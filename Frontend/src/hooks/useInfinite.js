import { useEffect, useRef } from 'react'

/** Calls onVisible whenever the sentinel element is near the viewport (and `enabled`). */
export function useSentinel(onVisible, enabled) {
  const ref = useRef(null)
  const cb = useRef(onVisible)
  useEffect(() => { cb.current = onVisible })
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) cb.current() }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [enabled])
  return ref
}
