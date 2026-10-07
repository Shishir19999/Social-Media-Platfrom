// Deterministic procedural illustrations for the demo data, so no image files have to be shipped
// or stored: a reference such as "art:peaks:7" is turned into an SVG data URL on demand.
import { hashString } from '../../lib/format'

const PALETTES = [
  ['#ff9a8b', '#ff6a88', '#fff1c1', '#5b3a6b', '#3a2a56', '#241a3a'],
  ['#89f7fe', '#66a6ff', '#ffffff', '#2b5876', '#1f4466', '#14304a'],
  ['#fbc2eb', '#a6c1ee', '#fffbe6', '#6a5acd', '#4b3f9e', '#2d2766'],
  ['#fddb92', '#d1fdff', '#fff8dc', '#3f8f7a', '#2b6b5c', '#1b4a40'],
  ['#f6d365', '#fda085', '#fffbea', '#8c4a5c', '#5e2f4a', '#3a1c33'],
  ['#a1c4fd', '#c2e9fb', '#ffffff', '#44627d', '#2e465d', '#1c2e40'],
  ['#d4fc79', '#96e6a1', '#fffde0', '#2f7a4f', '#1f573a', '#133826'],
  ['#e0c3fc', '#8ec5fc', '#ffffff', '#5a4fa8', '#3e3580', '#27205a'],
]

function prng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const f = (n) => Math.round(n * 10) / 10

function ridge(rand, w, baseY, amp, color, steps = 14) {
  const pts = []
  for (let i = 0; i <= steps; i++) pts.push([f((w / steps) * i), f(baseY - rand() * amp)])
  let d = `M0 ${f(baseY + amp)} L${pts[0][0]} ${pts[0][1]}`
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    d += ` Q${f((x0 + x1) / 2)} ${f(Math.min(y0, y1) - amp * 0.2)} ${x1} ${y1}`
  }
  return `<path d="${d} L${w} ${f(baseY + amp)} Z" fill="${color}"/>`
}

const SCENES = {
  hills(rand, w, h, p) {
    return `<circle cx="${f(w * (0.25 + rand() * 0.5))}" cy="${f(h * 0.38)}" r="${f(h * 0.11)}" fill="${p[2]}" opacity=".9"/>`
      + ridge(rand, w, h * 0.66, h * 0.16, p[3]) + ridge(rand, w, h * 0.78, h * 0.14, p[4]) + ridge(rand, w, h * 0.9, h * 0.12, p[5])
  },
  peaks(rand, w, h, p) {
    let out = `<circle cx="${f(w * 0.78)}" cy="${f(h * 0.25)}" r="${f(h * 0.07)}" fill="${p[2]}" opacity=".85"/>`
    const layers = [[p[3], 0.62], [p[4], 0.74], [p[5], 0.88]]
    for (const [color, base] of layers) {
      const n = 3 + Math.floor(rand() * 2)
      for (let i = 0; i < n; i++) {
        const cx = rand() * w
        const half = w * (0.16 + rand() * 0.14)
        const top = h * (base - 0.18 - rand() * 0.16)
        out += `<path d="M${f(cx - half)} ${f(h * base + h * 0.2)} L${f(cx)} ${f(top)} L${f(cx + half)} ${f(h * base + h * 0.2)} Z" fill="${color}"/>`
        out += `<path d="M${f(cx - half * 0.22)} ${f(top + (h * 0.2 * half) / (w * 0.3))} L${f(cx)} ${f(top)} L${f(cx + half * 0.22)} ${f(top + (h * 0.2 * half) / (w * 0.3))} Z" fill="${p[2]}" opacity=".75"/>`
      }
    }
    return out + `<rect x="0" y="${f(h * 0.9)}" width="${w}" height="${f(h * 0.1)}" fill="${p[5]}"/>`
  },
  waves(rand, w, h, p) {
    let out = `<circle cx="${f(w * 0.7)}" cy="${f(h * 0.33)}" r="${f(h * 0.1)}" fill="${p[2]}" opacity=".9"/>`
    for (let i = 0; i < 5; i++) {
      const y = h * (0.5 + i * 0.1)
      const amp = h * (0.025 + rand() * 0.02)
      const shift = rand() * 100
      let d = `M0 ${f(y)}`
      for (let x = 0; x <= w; x += w / 8) d += ` Q${f(x + w / 16)} ${f(y + (((x + shift) / (w / 8)) % 2 < 1 ? -amp : amp))} ${f(x + w / 8)} ${f(y)}`
      out += `<path d="${d} L${w} ${h} L0 ${h} Z" fill="${[p[3], p[4], p[5], p[4], p[5]][i]}" opacity="${f(0.55 + i * 0.1)}"/>`
    }
    return out
  },
  city(rand, w, h, p) {
    let out = `<circle cx="${f(w * 0.2)}" cy="${f(h * 0.3)}" r="${f(h * 0.09)}" fill="${p[2]}" opacity=".9"/>`
    let x = 0
    while (x < w) {
      const bw = w * (0.05 + rand() * 0.07)
      const bh = h * (0.25 + rand() * 0.45)
      out += `<rect x="${f(x)}" y="${f(h - bh)}" width="${f(bw)}" height="${f(bh)}" fill="${p[rand() > 0.5 ? 4 : 5]}"/>`
      for (let wy = h - bh + 12; wy < h - 10; wy += 22) {
        for (let wx = x + 7; wx < x + bw - 8; wx += 16) {
          if (rand() > 0.55) out += `<rect x="${f(wx)}" y="${f(wy)}" width="6" height="9" fill="${p[2]}" opacity=".85"/>`
        }
      }
      x += bw + 2
    }
    return out
  },
  forest(rand, w, h, p) {
    let out = `<circle cx="${f(w * 0.5)}" cy="${f(h * 0.3)}" r="${f(h * 0.12)}" fill="${p[2]}" opacity=".7"/>`
    for (const [color, base, size] of [[p[3], 0.72, 0.28], [p[4], 0.84, 0.34], [p[5], 0.98, 0.42]]) {
      for (let x = -20; x < w + 20; x += w * (0.06 + rand() * 0.03)) {
        const th = h * (size + rand() * 0.08)
        const tw = th * 0.38
        out += `<path d="M${f(x)} ${f(h * base)} L${f(x - tw / 2)} ${f(h * base)} L${f(x)} ${f(h * base - th)} L${f(x + tw / 2)} ${f(h * base)} Z" fill="${color}"/>`
      }
    }
    return out
  },
  dunes(rand, w, h, p) {
    return `<circle cx="${f(w * 0.3)}" cy="${f(h * 0.3)}" r="${f(h * 0.1)}" fill="${p[2]}"/>`
      + ridge(rand, w, h * 0.6, h * 0.14, p[3], 6) + ridge(rand, w, h * 0.75, h * 0.14, p[4], 6) + ridge(rand, w, h * 0.92, h * 0.1, p[5], 6)
  },
  night(rand, w, h, p) {
    let out = ''
    for (let i = 0; i < 70; i++) out += `<circle cx="${f(rand() * w)}" cy="${f(rand() * h * 0.75)}" r="${f(0.6 + rand() * 1.6)}" fill="#fff" opacity="${f(0.3 + rand() * 0.7)}"/>`
    out += `<circle cx="${f(w * 0.72)}" cy="${f(h * 0.26)}" r="${f(h * 0.08)}" fill="#fff8dc"/><circle cx="${f(w * 0.74)}" cy="${f(h * 0.24)}" r="${f(h * 0.07)}" fill="${p[5]}" opacity=".6"/>`
    return out + ridge(rand, w, h * 0.86, h * 0.1, '#0b1020', 10)
  },
  abstract(rand, w, h, p) {
    let out = ''
    for (let i = 0; i < 9; i++) {
      out += `<circle cx="${f(rand() * w)}" cy="${f(rand() * h)}" r="${f(h * (0.1 + rand() * 0.28))}" fill="${p[2 + (i % 4)] || p[2]}" opacity="${f(0.18 + rand() * 0.3)}"/>`
    }
    return out
  },
}

const NIGHT_PALETTE = ['#0f172a', '#312e81', '#fff8dc', '#1e1b4b', '#1e1b4b', '#0b1020']

/** art:<scene>:<seed>[:<width>x<height>] -> SVG data URL */
const cache = new Map()
export function artUrl(ref) {
  if (cache.has(ref)) return cache.get(ref)
  const [, scene = 'abstract', seed = '1', size = '800x600'] = ref.split(':')
  const [w, h] = size.split('x').map(Number)
  const hash = hashString(`${scene}${seed}`)
  const rand = prng(hash)
  const palette = scene === 'night' ? NIGHT_PALETTE : PALETTES[hash % PALETTES.length]
  const body = (SCENES[scene] || SCENES.abstract)(rand, w, h, palette)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="s" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${palette[0]}"/><stop offset="1" stop-color="${palette[1]}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#s)"/>${body}</svg>`
  const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
  cache.set(ref, url)
  return url
}

/** Resolves stored media: art: references become data URLs, everything else is returned unchanged. */
export function resolveMedia(value) {
  return typeof value === 'string' && value.startsWith('art:') ? artUrl(value) : value
}
