// Inline form validation shared by the login and register forms (mirrors the server rules).
export function validateUsername(v) {
  const s = v.trim()
  if (!s) return 'Choose a username.'
  if (s.length < 3) return 'Username must be at least 3 characters.'
  if (s.length > 30) return 'Username must be at most 30 characters.'
  if (!/^[A-Za-z0-9_]+$/.test(s)) return 'Use letters, numbers and underscores only.'
  return ''
}

export function validateEmail(v) {
  const s = v.trim()
  if (!s) return 'Enter your email address.'
  if (!/^\S+@\S+\.\S+$/.test(s)) return 'Enter a valid email address.'
  return ''
}

export function validatePassword(v) {
  if (!v) return 'Enter a password.'
  if (v.length < 6) return 'Password must be at least 6 characters.'
  return ''
}

export const POST_LIMIT = 500
export const COMMENT_LIMIT = 500
export const BIO_LIMIT = 280
export const MAX_IMAGES = 6
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** Returns an error message for a picked image file, or '' when it is acceptable. */
export function validateImage(file) {
  if (!IMAGE_TYPES.includes(file.type)) return `${file.name}: only JPG, PNG and WebP images are supported.`
  if (file.size > MAX_IMAGE_BYTES) return `${file.name}: images must be 10 MB or smaller.`
  return ''
}
