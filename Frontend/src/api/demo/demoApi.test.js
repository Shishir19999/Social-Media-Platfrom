import { beforeEach, describe, expect, it } from 'vitest'
import { createDemoApi } from './demoApi'
import { DEMO_PASSWORD } from './seed'
import { AUTH_KEY } from '../shared'

function memoryStorage() {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }
}

describe('demo backend', () => {
  let storage
  let api
  beforeEach(() => {
    storage = memoryStorage()
    api = createDemoApi({ storage, latency: false })
  })
  const signIn = async (name = 'alice') => {
    const data = await api.login(name, DEMO_PASSWORD)
    storage.setItem(AUTH_KEY, JSON.stringify({ token: data.token, user: data.user }))
    return data.user
  }

  it('rejects bad credentials and accepts the documented logins', async () => {
    await expect(api.login('alice', 'nope')).rejects.toMatchObject({ status: 401 })
    expect((await signIn()).username).toBe('alice')
  })

  it('creates posts with hashtags, likes, bookmarks and comment threads', async () => {
    await signIn()
    const post = await api.createPost({ text: 'Hello #World from @marcus', images: [] })
    expect(post.hashtags).toEqual(['world'])
    expect((await api.toggleLike(post.id)).likedByMe).toBe(true)
    expect((await api.toggleBookmark(post.id)).bookmarkedByMe).toBe(true)
    const c = await api.addComment(post.id, { text: 'first' })
    const r = await api.addComment(post.id, { text: 'reply', parentId: c.id })
    expect(r.parentId).toBe(c.id)
    const res = await api.deleteComment(post.id, c.id)
    expect(res.removed).toHaveLength(2)
    expect((await api.listPosts({ saved: true })).posts.map((p) => p.id)).toContain(post.id)
  })

  it('follow changes the following feed; hide removes posts for the viewer', async () => {
    await signIn('alice')
    const before = (await api.listPosts({ scope: 'following' })).total
    const profile = await api.toggleFollow('diego')
    expect(profile.isFollowing).toBe(true)
    expect((await api.listPosts({ scope: 'following' })).total).toBeGreaterThanOrEqual(before)
    const { posts } = await api.listPosts({ scope: 'explore' })
    await api.hidePost(posts[0].id)
    expect((await api.listPosts({ scope: 'explore' })).posts.map((p) => p.id)).not.toContain(posts[0].id)
  })

  it('only the owner may delete a post; search and trending work', async () => {
    await signIn('alice')
    const { posts } = await api.listPosts({ author: 'marcus' })
    await expect(api.deletePost(posts[0].id)).rejects.toMatchObject({ status: 403 })
    expect((await api.search('marcus')).users.length).toBeGreaterThan(0)
    expect((await api.trending()).length).toBeGreaterThan(0)
  })

  it('reset restores the seed', async () => {
    await signIn()
    const post = await api.createPost({ text: 'temporary', images: [] })
    await api.resetDemo()
    await expect(api.getPost(post.id)).rejects.toMatchObject({ status: 404 })
  })
})
