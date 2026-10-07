// Turns an uploaded image File into a small JPEG data URL so it can live in localStorage.
import { ApiError } from '../shared'

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new ApiError('That image could not be read.', 400)) }
    img.src = url
  })
}

/**
 * @param {File} file
 * @param {{maxWidth?: number, maxHeight?: number, quality?: number, square?: boolean}} opts
 */
export async function downsizeImage(file, { maxWidth = 1280, maxHeight = 1280, quality = 0.72, square = false } = {}) {
  const img = await loadImage(file)
  let sx = 0
  let sy = 0
  let sw = img.naturalWidth
  let sh = img.naturalHeight
  if (square) {
    const side = Math.min(sw, sh)
    sx = (sw - side) / 2
    sy = (sh - side) / 2
    sw = side
    sh = side
  }
  const scale = Math.min(1, maxWidth / sw, maxHeight / sh)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sw * scale))
  canvas.height = Math.max(1, Math.round(sh * scale))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}
