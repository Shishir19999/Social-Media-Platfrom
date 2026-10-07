import { useParallax, useReveal } from '../hooks/useMotion'

/** Absolutely positioned decorative layer that drifts at `speed` while its section is on screen. */
export function ParallaxLayer({ speed = 0.12, className = '', children }) {
  const ref = useParallax(speed)
  return <div ref={ref} className={`px-layer ${className}`} aria-hidden="true">{children}</div>
}

/** Fades and lifts its children in when scrolled into view. */
export function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }) {
  const [ref, shown] = useReveal()
  return (
    <Tag ref={ref} className={`reveal ${shown ? 'is-visible' : ''} ${className}`} style={{ '--reveal-delay': `${delay}ms` }} {...rest}>
      {children}
    </Tag>
  )
}
