import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDemoApi } from './demoApi'
import { DEMO_PASSWORD } from './seed'
import { AUTH_KEY } from '../shared'

function memoryStorage() {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }
}

// The Live preview applies the same rules as the Express API; these mirror Backend/test/features.test.js.
describe('live preview backend: features and roles', () => {
  let storage
  let api
  let events
  beforeEach(() => {
    storage = memoryStorage()
    events = []
    api = createDemoApi({ storage, latency: false, realtime: (event, payload) => events.push([event, payload]) })
  })
  const signIn = async (name) => {
    const data = await api.login(name, DEMO_PASSWORD)
    storage.setItem(AUTH_KEY, JSON.stringify({ token: data.token, user: data.user }))
    return data.user
  }

  it('reactions switch and toggle; counts per type', async () => {
    await signIn('alice')
    const post = await api.createPost({ text: 'react to me' })
    await signIn('marcus')
    let r = await api.react(post.id, 'laugh')
    expect([r.myReaction, r.reactions.laugh]).toEqual(['laugh', 1])
    r = await api.react(post.id, 'wow')
    expect([r.reactions.laugh, r.reactions.wow, r.likes]).toEqual([0, 1, 1])
    r = await api.react(post.id, 'wow')
    expect([r.myReaction, r.likes]).toEqual([null, 0])
    await expect(api.react(post.id, 'nope')).rejects.toMatchObject({ status: 400 })
  })

  it('polls validate, accept one vote and close', async () => {
    await signIn('alice')
    await expect(api.createPost({ text: 'p', poll: { options: ['one'], duration: '1d' } })).rejects.toMatchObject({ status: 400 })
    const post = await api.createPost({ text: 'Best colour?', poll: { options: ['Red', 'Blue'], duration: '1h' } })
    const opt = post.poll.options[0].id
    const voted = await api.votePoll(post.id, opt)
    expect([voted.poll.total, voted.poll.myVote]).toEqual([1, opt])
    await expect(api.votePoll(post.id, opt)).rejects.toMatchObject({ status: 409 })
    const later = createDemoApi({ storage, latency: false, now: () => Date.now() + 2 * 3600 * 1000 })
    await expect(later.votePoll(post.id, post.poll.options[1].id)).rejects.toMatchObject({ status: 400 })
  })

  it('reposts toggle, quotes embed the original', async () => {
    await signIn('alice')
    const { posts } = await api.listPosts({ author: 'marcus' })
    const original = posts.find((p) => !p.isRepost)
    let r = await api.toggleRepost(original.id)
    expect([r.reposts, r.repostedByMe]).toEqual([1, true])
    r = await api.toggleRepost(original.id)
    expect([r.reposts, r.repostedByMe]).toEqual([0, false])
    const quote = await api.createPost({ text: 'quoting', quoteOf: original.id })
    expect(quote.repostOf.id).toBe(original.id)
    await expect(api.createPost({ text: '', quoteOf: original.id })).rejects.toMatchObject({ status: 400 })
  })

  it('drafts and scheduled posts stay private; edit history; pinning', async () => {
    await signIn('alice')
    const draft = await api.createPost({ text: 'secret #draft', status: 'draft' })
    expect((await api.myPosts('draft')).posts.map((p) => p.id)).toContain(draft.id)
    await signIn('marcus')
    await expect(api.getPost(draft.id)).rejects.toMatchObject({ status: 404 })
    await signIn('alice')
    await expect(api.publishPost(draft.id, { scheduleAt: Date.now() + 1000 })).rejects.toMatchObject({ status: 400 })
    const scheduled = await api.publishPost(draft.id, { scheduleAt: Date.now() + 5 * 60000 })
    expect(scheduled.status).toBe('scheduled')
    const published = await api.publishPost(draft.id)
    expect(published.status).toBe('published')
    await api.updatePost(draft.id, { text: 'second wording' })
    await api.updatePost(draft.id, { text: 'third wording' })
    expect((await api.postHistory(draft.id)).map((v) => v.text)).toEqual(['third wording', 'second wording', 'secret #draft'])
    expect((await api.pinPost(draft.id)).pinned).toBe(true)
    expect((await api.listPosts({ author: 'alice' })).posts[0]).toMatchObject({ id: draft.id, pinned: true })
  })

  it('private accounts, follow requests and blocking', async () => {
    await signIn('alice')
    expect((await api.getProfile('hannah')).locked).toBe(true)
    expect((await api.listPosts({ author: 'hannah' })).locked).toBe(true)
    const requested = await api.toggleFollow('hannah')
    expect([requested.isFollowing, requested.requested]).toEqual([false, true])
    await signIn('hannah')
    expect((await api.followRequests()).map((u) => u.username)).toContain('alice')
    await api.answerFollowRequest('alice', 'accept')
    await signIn('alice')
    expect((await api.getProfile('hannah')).isFollowing).toBe(true)
    // block cuts follows and hides posts both ways
    await api.toggleFollow('marcus')
    const blocked = await api.toggleBlock('marcus')
    expect(blocked.blockedByMe).toBe(true)
    await signIn('marcus')
    expect((await api.getProfile('alice')).blockedByThem).toBe(true)
    await expect(api.sendMessage('alice', 'hi')).rejects.toMatchObject({ status: 403 })
    await expect(api.toggleFollow('alice')).rejects.toMatchObject({ status: 403 })
  })

  it('notification settings switch kinds off', async () => {
    await signIn('marcus')
    await api.updateSettings({ notifications: { like: false } })
    const before = (await api.notifications()).items.length
    const mine = await api.createPost({ text: 'quiet post' })
    await signIn('alice')
    await api.toggleLike(mine.id)
    await api.addComment(mine.id, { text: 'hello there' })
    await signIn('marcus')
    const items = (await api.notifications()).items
    expect(items.length).toBe(before + 1)
    expect(items[0].type).toBe('comment')
  })

  it('direct messages: send, unread, read, realtime events', async () => {
    await signIn('alice')
    const convs = await api.conversations()
    expect(convs.find((c) => c.with.username === 'marcus').unread).toBe(1)
    expect(await api.unreadMessages()).toBe(1)
    await expect(api.sendMessage('marcus', '')).rejects.toMatchObject({ status: 400 })
    await api.sendMessage('marcus', 'Sure, will do')
    expect(events.find(([e]) => e === 'message:new')[1].message.text).toBe('Sure, will do')
    const thread = await api.thread('marcus')
    expect(thread.messages.at(-1).text).toBe('Sure, will do')
    await api.markThreadRead('marcus')
    expect(await api.unreadMessages()).toBe(0)
    await signIn('marcus')
    expect((await api.conversations())[0].unread).toBe(1)
  })

  it('staff only: reports queue, hide/remove/restore, audit log', async () => {
    await signIn('alice')
    await expect(api.modReports()).rejects.toMatchObject({ status: 403 })
    await signIn('mod')
    const queue = await api.modReports()
    expect(queue.items.length).toBeGreaterThan(0)
    const target = queue.items[0]
    await expect(api.resolveReport(target.postId, { action: 'nuke' })).rejects.toMatchObject({ status: 400 })
    await api.resolveReport(target.postId, { action: 'remove', note: 'Spam' })
    await signIn('alice')
    await expect(api.getPost(target.postId)).rejects.toMatchObject({ status: 404 })
    await signIn('mod')
    expect((await api.modReports()).items.find((i) => i.postId === target.postId)).toBeUndefined()
    await api.setModState(target.postId, { state: 'ok' })
    await signIn('alice')
    expect((await api.getPost(target.postId)).modState).toBe('ok')
    await signIn('mod')
    const actions = (await api.auditLog()).items.map((a) => a.action)
    expect(actions.slice(0, 2)).toEqual(['post.restore', 'report.remove'])
  })

  it('user management: suspend lapses, bans need an admin, roles are admin only', async () => {
    await signIn('mod')
    const { items } = await api.modUsers({ q: 'omar' })
    const omar = items[0]
    expect(omar.email).toBeUndefined()
    await expect(api.setUserStatus(omar.id, { action: 'suspend', days: 3 })).rejects.toMatchObject({ status: 400 })
    await api.setUserStatus(omar.id, { action: 'suspend', days: 7, reason: 'Cooling off' })
    await expect(api.setUserStatus(omar.id, { action: 'ban' })).rejects.toMatchObject({ status: 403 })
    await signIn('omar')
    await expect(api.createPost({ text: 'can I post?' })).rejects.toMatchObject({ status: 403 })
    expect((await api.listPosts({ scope: 'explore' })).posts.length).toBeGreaterThan(0)
    const lapsed = createDemoApi({ storage, latency: false, now: () => Date.now() + 8 * 86400000 })
    expect((await lapsed.createPost({ text: 'back again' })).text).toBe('back again')
    await signIn('admin')
    await api.setUserStatus(omar.id, { action: 'ban', reason: 'Spam ring' })
    await expect(api.login('omar', DEMO_PASSWORD)).rejects.toMatchObject({ status: 403 })
    await api.setUserStatus(omar.id, { action: 'restore' })
    expect((await api.login('omar', DEMO_PASSWORD)).user.username).toBe('omar')
    await expect(api.setUserRole(omar.id, 'root')).rejects.toMatchObject({ status: 403 })
    expect((await api.setUserRole(omar.id, 'moderator')).role).toBe('moderator')
    await signIn('mod')
    await expect(api.setUserRole(omar.id, 'user')).rejects.toMatchObject({ status: 403 })
  })

  it('mention autocomplete, suggestions with reasons, connections', async () => {
    await signIn('alice')
    expect((await api.searchUsers('mar')).map((u) => u.username)).toContain('marcus')
    const sug = await api.suggestions({ limit: 6 })
    expect(sug.every((u) => u.reason && u.username !== 'alice')).toBe(true)
    expect((await api.listConnections('alice', 'following')).users.length).toBeGreaterThan(3)
  })

  it('emits a live notification event', async () => {
    await signIn('alice')
    const post = await api.createPost({ text: 'hello world' })
    await signIn('marcus')
    const fn = vi.fn()
    events.length = 0
    await api.toggleLike(post.id)
    fn(events.map(([e]) => e))
    expect(fn).toHaveBeenCalledWith(['notification:new'])
  })
})
