// Small formatting helpers shared by the UI and the demo backend.

const UNITS = [
  ['y', 365 * 24 * 3600],
  ['mo', 30 * 24 * 3600],
  ['w', 7 * 24 * 3600],
  ['d', 24 * 3600],
  ['h', 3600],
  ['m', 60],
]

/** "now", "5m", "3h", "2d", "4w" ... */
export function timeAgo(date, now = Date.now()) {
  const secs = Math.max(0, Math.floor((now - new Date(date).getTime()) / 1000))
  if (Number.isNaN(secs) || secs < 45) return 'now'
  for (const [label, size] of UNITS) {
    if (secs >= size) return `${Math.floor(secs / size)}${label}`
  }
  return 'now'
}

/** "2d", "3h", "12m" until a future date ("0m" once it has passed). */
export function timeUntil(date, now = Date.now()) {
  const secs = Math.max(0, Math.floor((new Date(date).getTime() - now) / 1000))
  for (const [label, size] of UNITS) {
    if (secs >= size) return `${Math.floor(secs / size)}${label}`
  }
  return '0m'
}

export function fullDate(date) {
  return new Date(date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function monthYear(date) {
  return new Date(date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

/** 950 -> "950", 1200 -> "1.2K", 3400000 -> "3.4M" */
export function compactNumber(n) {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}K`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function hashString(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
