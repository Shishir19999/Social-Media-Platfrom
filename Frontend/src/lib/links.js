import { DEMO } from '../config'

/** Absolute, shareable URL of an in-app path (hash routing is used by the static demo). */
export function appUrl(path) {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/$/, '')
  return DEMO ? `${base}/#${path}` : `${base}${path}`
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      ta.remove()
    }
  }
}
