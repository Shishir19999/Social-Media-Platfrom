import { useEffect, useRef, useState } from 'react'
import { parallaxAllowed, parallaxOffset, readEnv } from '../lib/motion'

/**
 * Moves the element with transform only while it is on screen. `speed` is the shift per pixel of
 * distance from the viewport centre. Returns a ref; the element gets data-parallax="on|off".
 */
export function useParallax(speed = 0.12) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return undefined
    if (!parallaxAllowed(readEnv())) { el.dataset.parallax = 'off'; return undefined }
    el.dataset.parallax = 'on'
    let visible = false
    let frame = 0
    const update = () => {
      frame = 0
      const parent = el.parentElement.getBoundingClientRect()
      const y = parallaxOffset(parent, window.innerHeight, speed)
      el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`
    }
    const schedule = () => { if (visible && !frame) frame = requestAnimationFrame(update) }
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; schedule() }, { rootMargin: '80px' })
    io.observe(el.parentElement)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
      el.style.transform = ''
      el.dataset.parallax = 'off'
    }
  }, [speed])
  return ref
}

/** Adds .is-visible once the element scrolls into view (content stays visible if IO is missing). */
export function useReveal() {
  const ref = useRef(null)
  const [shown, setShown] = useState(() => typeof IntersectionObserver === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const el = ref.current
    if (!el || shown) return undefined
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setShown(true); io.disconnect() }
    }, { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [shown])
  return [ref, shown]
}
