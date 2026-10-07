// Splits post/comment text into plain text, #hashtags, @mentions and links.
const TOKEN_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'])|((?:^|(?<=[^\p{L}\p{N}_&]))#[\p{L}\p{N}_]{2,40})|((?:^|(?<=[^\p{L}\p{N}_]))@[A-Za-z0-9_]{3,30})/gu

export function tokenize(text) {
  const out = []
  if (typeof text !== 'string' || !text) return out
  let last = 0
  for (const m of text.matchAll(TOKEN_RE)) {
    if (m.index > last) out.push({ type: 'text', value: text.slice(last, m.index) })
    const value = m[0]
    if (m[1]) out.push({ type: 'url', value })
    else if (m[2]) out.push({ type: 'tag', value, tag: value.slice(1).toLowerCase() })
    else out.push({ type: 'mention', value, username: value.slice(1) })
    last = m.index + value.length
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) })
  return out
}

export function extractHashtags(text) {
  return [...new Set(tokenize(text).filter((t) => t.type === 'tag').map((t) => t.tag))].slice(0, 20)
}

export function extractMentions(text) {
  return [...new Set(tokenize(text).filter((t) => t.type === 'mention').map((t) => t.username))].slice(0, 20)
}

/** Splits `text` around case-insensitive matches of `query` for highlighting. */
export function highlightParts(text, query) {
  const q = (query || '').trim().replace(/^[#@]/, '')
  if (!q) return [{ text, match: false }]
  const rx = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig')
  return text.split(rx).filter(Boolean).map((part) => ({ text: part, match: part.toLowerCase() === q.toLowerCase() }))
}
