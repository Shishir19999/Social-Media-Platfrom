import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as rules from './rules'
import { extractHashtags, extractMentions } from './richtext'

const require = createRequire(import.meta.url)
const here = (p) => fileURLToPath(new URL(p, import.meta.url))

// The browser-only Live preview and the API must apply the same rules.
describe('rules shared by the API and the Live preview', () => {
  it('Frontend/src/lib/rules.js is the generated copy of Backend/lib/rules.js', () => {
    const body = (file) => readFileSync(here(file), 'utf8').replace(/\r\n/g, '\n').replace(/(module\.exports = \{|export \{)[\s\S]*$/, '')
    expect(body('./rules.js')).toBe(body('../../../Backend/lib/rules.js'))
  })

  it('exports the same values as the backend module', () => {
    const backend = require('../../../Backend/lib/rules.js')
    expect(Object.keys(rules).sort()).toEqual(Object.keys(backend).sort())
    for (const key of ['LIMITS', 'REACTIONS', 'ROLES', 'POLL_DURATIONS', 'DEFAULT_NOTIFICATION_PREFS', 'PREF_FOR_TYPE']) expect(rules[key]).toEqual(backend[key])
    const sample = ['', 'ab', 'new_user', 'bad name', 'a'.repeat(31)]
    for (const v of sample) expect(rules.validateUsername(v)).toBe(backend.validateUsername(v))
  })

  it('hashtag and mention parsing agree with the text tokenizer', () => {
    const text = 'Hello #Travel and #travel, #a #food_2 a#nope &#amp @alice_1 and @bob, me@x.com @al'
    expect(rules.extractHashtags(text)).toEqual(extractHashtags(text))
    expect(rules.extractMentions(text)).toEqual(extractMentions(text))
  })

  it('validates posts, polls and permissions', () => {
    expect(rules.validatePost({ text: '' })).toMatch(/Write something/)
    expect(rules.validatePost({ text: '', poll: { options: ['a', 'b'], duration: '1d' } })).toBe('')
    expect(rules.validatePost({ text: 'x'.repeat(501) })).toMatch(/limited to 500/)
    expect(rules.validatePost({ text: 'hi', poll: { options: ['a', 'b'], duration: '1d' }, images: 1 })).toMatch(/not both/)
    expect(rules.canActOnUser({ id: '1', role: 'admin' }, { id: '2', role: 'moderator' })).toBe(true)
    expect(rules.canActOnUser({ id: '1', role: 'moderator' }, { id: '2', role: 'moderator' })).toBe(false)
    expect(rules.canChangeRole({ id: '1', role: 'moderator' }, { id: '2', role: 'user' }, 'admin')).toBe(false)
    expect(rules.linkPreview('see https://www.example.com/blog/my-first-post.html now').title).toBe('My first post')
  })
})
