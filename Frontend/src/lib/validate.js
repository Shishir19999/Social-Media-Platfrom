// Form validation and limits: thin re-exports of the rules shared with the API (see ./rules.js).
import { LIMITS, validateEmail, validatePassword, validateUsername } from './rules'

export { validateEmail, validatePassword, validateUsername }

export const POST_LIMIT = LIMITS.post
export const COMMENT_LIMIT = LIMITS.comment
export const BIO_LIMIT = LIMITS.bio
export const MESSAGE_LIMIT = LIMITS.message
export const MAX_IMAGES = LIMITS.images
export const MAX_IMAGE_BYTES = LIMITS.imageBytes
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** Returns an error message for a picked image file, or '' when it is acceptable. */
export function validateImage(file) {
  if (!IMAGE_TYPES.includes(file.type)) return `${file.name}: only JPG, PNG and WebP images are supported.`
  if (file.size > MAX_IMAGE_BYTES) return `${file.name}: images must be 10 MB or smaller.`
  return ''
}
