// Decisions and maths for the scroll effects (parallax and reveal). Pure so they can be unit tested.

export const PARALLAX_MIN_WIDTH = 720

/** Parallax is a nicety: off for reduced-motion, small screens, data-saver and low-power devices. */
export function parallaxAllowed(env = {}) {
  const {
    reducedMotion = false, width = 1024, saveData = false, memory, cores,
  } = env
  if (reducedMotion || saveData) return false
  if (width < PARALLAX_MIN_WIDTH) return false
  if ((memory !== undefined && memory <= 2) || (cores !== undefined && cores <= 2)) return false
  return true
}

export function readEnv() {
  const nav = typeof navigator !== 'undefined' ? navigator : {}
  return {
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    width: window.innerWidth,
    saveData: !!nav.connection?.saveData,
    memory: nav.deviceMemory,
    cores: nav.hardwareConcurrency,
  }
}

/**
 * Vertical shift (px) for an element whose box is at `rect` inside a viewport of height `vh`.
 * 0 when the element is centred in the viewport; `speed` is the fraction of the offset applied
 * (negative moves against the scroll direction). Clamped so layers never travel far.
 */
export function parallaxOffset(rect, vh, speed, max = 80) {
  const centre = rect.top + rect.height / 2
  const delta = centre - vh / 2
  const value = -delta * speed
  return Math.max(-max, Math.min(max, value))
}
