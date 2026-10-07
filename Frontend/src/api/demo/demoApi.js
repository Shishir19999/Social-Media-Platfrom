// Browser-only back end used for the GitHub Pages demo. It implements the same interface as
// src/api/http.js, keeps everything in localStorage and simulates network latency.
import { ApiError, AUTH_KEY, loadAuth } from '../shared'
import { buildSeed, STATE_VERSION } from './seed'
import { resolveMedia } from './art'
import { downsizeImage } from './image'
import { extractHashtags, extractMentions } from '../../lib/richtext'
import { validateEmail, validatePassword, validateUsername, POST_LIMIT, COMMENT_LIMIT, BIO_LIMIT, MAX_IMAGES } from '../../lib/validate'

export const STATE_KEY = 'orbit_demo_state_v1'

const clip = (t, n = 80) => (t.length > n ? `${t.slice(0, n - 1)}…` : t)
const has = (list, id) => list.includes(id)

/**
 * @param {{storage?: Storage, now?: () => number, latency?: boolean, resizeImage?: Function}} opts
 */
export function createDemoApi(opts = {}) {
  // resolved lazily so importing this module never touches localStorage
  const storage = new Proxy({}, {
    get(_, key) {
      const target = opts.storage ?? globalThis.localStorage
      const value = target[key]
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  const now = opts.now ?? (() => Date.now())
  const resizeImage = opts.resizeImage ?? downsizeImage
  const wait = opts.latency === false
    ? async () => {}
    : (min = 140, max = 340) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min)))

  let cache = null
  let counter = 0
  const uid = (prefix) => `${prefix}${now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('storage', (e) => { if (e.key === STATE_KEY || e.key === null) cache = null })
  }

  function read() {
    if (cache) return cache
    try {
      const parsed = JSON.parse(storage.getItem(STATE_KEY))
      if (parsed && parsed.version === STATE_VERSION) { cache = parsed; return cache }
    } catch { /* fall through to a fresh seed */ }
    cache = buildSeed(now())
    write()
    return cache
  }

  function write() {
    try {
      storage.setItem(STATE_KEY, JSON.stringify(cache))
    } catch {
      cache = null
      throw new ApiError('Demo storage is full. Use "Reset demo data" to free up space.', 507)
    }
  }

  // ---- lookups and serializers ----
  const userById = (s, id) => s.users.find((u) => u.id === id)
  const userByName = (s, name) => s.users.find((u) => u.username.toLowerCase() === String(name).toLowerCase())

  function viewerFrom(s) {
    const { token } = loadAuth(storage)
    if (!token || !token.startsWith('demo.')) return null
    return userById(s, token.slice(5)) || null
  }

  function requireViewer(s) {
    const v = viewerFrom(s)
    if (!v) throw new ApiError('Authentication required', 401)
    return v
  }

  const brief = (u) => (u
    ? { id: u.id, username: u.username, displayName: u.displayName || u.username, avatar: resolveMedia(u.avatar) }
    : { id: null, username: 'deleted', displayName: 'Deleted user', avatar: null })

  const publicUser = (u) => ({ ...brief(u), email: u.email })

  function serializePost(s, p, viewer) {
    return {
      id: p.id,
      author: brief(userById(s, p.authorId)),
      title: p.title || '',
      text: p.text,
      images: p.images.map(resolveMedia),
      attachment: null,
      hashtags: p.hashtags,
      createdAt: new Date(p.createdAt).toISOString(),
      edited: !!p.editedAt,
      likes: p.likes.length,
      likedByMe: !!viewer && has(p.likes, viewer.id),
      commentsCount: p.comments.length,
      bookmarkedByMe: !!viewer && has(viewer.bookmarks, p.id),
    }
  }

  function serializeComment(s, c, viewer) {
    return {
      id: c.id,
      parentId: c.parentId,
      author: brief(userById(s, c.authorId)),
      text: c.text,
      createdAt: new Date(c.createdAt).toISOString(),
      likes: c.likes.length,
      likedByMe: !!viewer && has(c.likes, viewer.id),
    }
  }

  function serializeProfile(s, u, viewer) {
    return {
      ...brief(u),
      bio: u.bio || '',
      cover: resolveMedia(u.cover),
      joined: new Date(u.createdAt).toISOString(),
      followers: s.users.filter((x) => has(x.following, u.id)).length,
      following: u.following.length,
      posts: s.posts.filter((p) => p.authorId === u.id).length,
      isMe: !!viewer && viewer.id === u.id,
      isFollowing: !!viewer && has(viewer.following, u.id),
    }
  }

  function notify(s, userId, actorId, type, postId, text = '') {
    if (!userId || userId === actorId) return
    if ((type === 'like' || type === 'follow')
      && s.notifications.some((n) => n.userId === userId && n.actorId === actorId && n.type === type && n.postId === (postId || null) && !n.read)) return
    s.notifications.unshift({ id: uid('n'), userId, actorId, type, postId: postId || null, snippet: clip(text), read: false, createdAt: now() })
  }

  function notifyMentions(s, text, actor, post, skip = []) {
    for (const name of extractMentions(text)) {
      const u = userByName(s, name)
      if (u && !skip.includes(u.id)) notify(s, u.id, actor.id, 'mention', post.id, text)
    }
  }

  const findPost = (s, id) => {
    const p = s.posts.find((x) => x.id === id)
    if (!p) throw new ApiError('Post not found', 404)
    return p
  }

  function topTags(s, since, limit, filter) {
    const counts = new Map()
    for (const p of s.posts) {
      if (since && p.createdAt < since) continue
      for (const t of p.hashtags) if (!filter || filter(t)) counts.set(t, (counts.get(t) || 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, limit).map(([tag, count]) => ({ tag, count }))
  }

  const api = {
    // ---- auth ----
    async login(identifier, password) {
      await wait()
      const s = read()
      const id = String(identifier || '').trim().toLowerCase()
      const u = s.users.find((x) => x.username.toLowerCase() === id || x.email.toLowerCase() === id)
      if (!id || !password) throw new ApiError('Email/username and password are required', 400)
      if (!u || u.password !== password) throw new ApiError('Invalid credentials', 401)
      return { token: `demo.${u.id}`, user: publicUser(u) }
    },

    async register(username, email, password) {
      await wait()
      const s = read()
      const err = validateUsername(username) || validateEmail(email) || validatePassword(password)
      if (err) throw new ApiError(err, 400)
      if (userByName(s, username.trim()) || s.users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())) {
        throw new ApiError('Username or email already in use', 409)
      }
      const u = {
        id: uid('u'), username: username.trim(), displayName: username.trim(), bio: '', email: email.trim().toLowerCase(),
        password, avatar: null, cover: null, createdAt: now(), following: [], bookmarks: [], hidden: [],
      }
      s.users.push(u)
      write()
      return { token: `demo.${u.id}`, user: publicUser(u) }
    },

    async me() {
      await wait(60, 140)
      const s = read()
      const v = viewerFrom(s)
      if (!v) throw new ApiError('User no longer exists', 401)
      return { user: publicUser(v) }
    },

    async logout() {
      await wait(40, 90)
      return { message: 'Logged out' }
    },

    // ---- feed and posts ----
    async listPosts({ scope, tag, author, saved, page = 1, limit = 10 } = {}) {
      await wait()
      const s = read()
      const v = viewerFrom(s)
      let list = s.posts
      if (v) list = list.filter((p) => !has(v.hidden, p.id))
      if (scope === 'following') {
        if (!v) throw new ApiError('Authentication required', 401)
        list = list.filter((p) => p.authorId === v.id || has(v.following, p.authorId))
      }
      if (saved) {
        if (!v) throw new ApiError('Authentication required', 401)
        list = list.filter((p) => has(v.bookmarks, p.id))
      }
      if (tag) list = list.filter((p) => has(p.hashtags, String(tag).replace(/^#/, '').toLowerCase()))
      if (author) {
        const a = userByName(s, author)
        list = a ? list.filter((p) => p.authorId === a.id) : []
      }
      list = [...list].sort((a, b) => b.createdAt - a.createdAt)
      const total = list.length
      const lim = Math.min(Math.max(limit, 1), 50)
      const start = (Math.max(page, 1) - 1) * lim
      return {
        posts: list.slice(start, start + lim).map((p) => serializePost(s, p, v)),
        page, limit: lim, total, pages: Math.max(Math.ceil(total / lim), 1),
      }
    },

    async getPost(id) {
      await wait(80, 200)
      const s = read()
      return serializePost(s, findPost(s, id), viewerFrom(s))
    },

    async createPost({ text, images = [] }) {
      await wait(250, 500)
      const s = read()
      const v = requireViewer(s)
      const body = String(text || '').trim()
      if (!body) throw new ApiError('Write something before posting.', 400)
      if (body.length > POST_LIMIT) throw new ApiError(`Posts are limited to ${POST_LIMIT} characters.`, 400)
      if (images.length > MAX_IMAGES) throw new ApiError(`You can attach up to ${MAX_IMAGES} images.`, 400)
      const stored = []
      for (const file of images) stored.push(await resizeImage(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.7 }))
      const post = {
        id: uid('p'), authorId: v.id, title: '', text: body, images: stored, hashtags: extractHashtags(body),
        createdAt: now(), editedAt: null, likes: [], comments: [],
      }
      s.posts.unshift(post)
      notifyMentions(s, body, v, post)
      write()
      return serializePost(s, post, v)
    },

    async updatePost(id, { text }) {
      await wait()
      const s = read()
      const v = requireViewer(s)
      const p = findPost(s, id)
      if (p.authorId !== v.id) throw new ApiError('You can only edit your own posts', 403)
      const body = String(text || '').trim()
      if (!body) throw new ApiError('Content cannot be empty', 400)
      if (body.length > POST_LIMIT) throw new ApiError(`Posts are limited to ${POST_LIMIT} characters.`, 400)
      p.text = body
      p.hashtags = extractHashtags(body)
      p.editedAt = now()
      write()
      return serializePost(s, p, v)
    },

    async deletePost(id) {
      await wait()
      const s = read()
      const v = requireViewer(s)
      const p = findPost(s, id)
      if (p.authorId !== v.id) throw new ApiError('You can only delete your own posts', 403)
      s.posts = s.posts.filter((x) => x.id !== id)
      s.notifications = s.notifications.filter((n) => n.postId !== id)
      write()
      return { message: 'Post deleted' }
    },

    async toggleLike(id) {
      await wait(60, 160)
      const s = read()
      const v = requireViewer(s)
      const p = findPost(s, id)
      if (has(p.likes, v.id)) p.likes = p.likes.filter((x) => x !== v.id)
      else { p.likes.push(v.id); notify(s, p.authorId, v.id, 'like', p.id, p.text) }
      write()
      return serializePost(s, p, v)
    },

    async toggleBookmark(id) {
      await wait(60, 160)
      const s = read()
      const v = requireViewer(s)
      const p = findPost(s, id)
      v.bookmarks = has(v.bookmarks, id) ? v.bookmarks.filter((x) => x !== id) : [...v.bookmarks, id]
      write()
      return serializePost(s, p, v)
    },

    async hidePost(id) {
      await wait(60, 160)
      const s = read()
      const v = requireViewer(s)
      findPost(s, id)
      if (!has(v.hidden, id)) v.hidden.push(id)
      write()
      return { message: 'Post hidden' }
    },

    async reportPost(id, reason) {
      await wait()
      const s = read()
      const v = requireViewer(s)
      const p = findPost(s, id)
      if (p.authorId === v.id) throw new ApiError('You cannot report your own post', 400)
      if (!s.reports.some((r) => r.postId === id && r.userId === v.id)) s.reports.push({ postId: id, userId: v.id, reason: String(reason || '').slice(0, 200) })
      if (!has(v.hidden, id)) v.hidden.push(id)
      write()
      return { message: 'Report received' }
    },

    // ---- comments ----
    async listComments(postId) {
      await wait(100, 240)
      const s = read()
      const v = viewerFrom(s)
      return findPost(s, postId).comments.map((c) => serializeComment(s, c, v))
    },

    async addComment(postId, { text, parentId }) {
      await wait()
      const s = read()
      const v = requireViewer(s)
      const body = String(text || '').trim()
      if (!body) throw new ApiError('Comment text is required', 400)
      if (body.length > COMMENT_LIMIT) throw new ApiError(`Comments are limited to ${COMMENT_LIMIT} characters.`, 400)
      const p = findPost(s, postId)
      let parent = null
      if (parentId) {
        parent = p.comments.find((c) => c.id === parentId)
        if (!parent) throw new ApiError('Parent comment not found', 404)
      }
      const c = { id: uid('c'), authorId: v.id, text: body, parentId: parent ? parent.id : null, createdAt: now(), likes: [] }
      p.comments.push(c)
      const notified = [v.id]
      if (parent) { notify(s, parent.authorId, v.id, 'reply', p.id, body); notified.push(parent.authorId) }
      if (!notified.includes(p.authorId)) notify(s, p.authorId, v.id, 'comment', p.id, body)
      notifyMentions(s, body, v, p, notified)
      write()
      return serializeComment(s, c, v)
    },

    async deleteComment(postId, commentId) {
      await wait()
      const s = read()
      const v = requireViewer(s)
      const p = findPost(s, postId)
      const c = p.comments.find((x) => x.id === commentId)
      if (!c) throw new ApiError('Comment not found', 404)
      if (c.authorId !== v.id && p.authorId !== v.id) throw new ApiError('You can only delete your own comments', 403)
      const doomed = new Set([commentId])
      let grew = true
      while (grew) {
        grew = false
        for (const x of p.comments) {
          if (x.parentId && doomed.has(x.parentId) && !doomed.has(x.id)) { doomed.add(x.id); grew = true }
        }
      }
      p.comments = p.comments.filter((x) => !doomed.has(x.id))
      write()
      return { message: 'Comment deleted', removed: [...doomed] }
    },

    async toggleCommentLike(postId, commentId) {
      await wait(50, 140)
      const s = read()
      const v = requireViewer(s)
      const c = findPost(s, postId).comments.find((x) => x.id === commentId)
      if (!c) throw new ApiError('Comment not found', 404)
      c.likes = has(c.likes, v.id) ? c.likes.filter((x) => x !== v.id) : [...c.likes, v.id]
      write()
      return serializeComment(s, c, v)
    },

    // ---- people ----
    async getProfile(username) {
      await wait(100, 240)
      const s = read()
      const u = userByName(s, username)
      if (!u) throw new ApiError('User not found', 404)
      return serializeProfile(s, u, viewerFrom(s))
    },

    async updateProfile({ displayName, bio, avatar, cover, removeAvatar, removeCover }) {
      await wait(250, 450)
      const s = read()
      const v = requireViewer(s)
      if (displayName !== undefined) {
        if (displayName.trim().length > 50) throw new ApiError('Display name must be at most 50 characters', 400)
        v.displayName = displayName.trim() || v.username
      }
      if (bio !== undefined) {
        if (bio.trim().length > BIO_LIMIT) throw new ApiError(`Bio must be at most ${BIO_LIMIT} characters`, 400)
        v.bio = bio.trim()
      }
      if (avatar) v.avatar = await resizeImage(avatar, { maxWidth: 256, maxHeight: 256, quality: 0.8, square: true })
      else if (removeAvatar) v.avatar = null
      if (cover) v.cover = await resizeImage(cover, { maxWidth: 1200, maxHeight: 400, quality: 0.7 })
      else if (removeCover) v.cover = null
      write()
      return serializeProfile(s, v, v)
    },

    async toggleFollow(username) {
      await wait(80, 200)
      const s = read()
      const v = requireViewer(s)
      const target = userByName(s, username)
      if (!target) throw new ApiError('User not found', 404)
      if (target.id === v.id) throw new ApiError('You cannot follow yourself', 400)
      if (has(v.following, target.id)) v.following = v.following.filter((x) => x !== target.id)
      else { v.following.push(target.id); notify(s, target.id, v.id, 'follow') }
      write()
      return serializeProfile(s, target, v)
    },

    async suggestions() {
      await wait(100, 220)
      const s = read()
      const v = viewerFrom(s)
      const list = s.users
        .filter((u) => !v || (u.id !== v.id && !has(v.following, u.id)))
        .map((u) => ({ u, n: s.users.filter((x) => has(x.following, u.id)).length }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 5)
      return list.map(({ u }) => ({ ...brief(u), bio: u.bio || '' }))
    },

    // ---- discovery ----
    async search(q) {
      await wait()
      const s = read()
      const v = viewerFrom(s)
      const term = String(q || '').trim().replace(/^[#@]/, '').toLowerCase()
      if (!term) return { users: [], posts: [], tags: [] }
      const users = s.users
        .filter((u) => u.username.toLowerCase().includes(term) || (u.displayName || '').toLowerCase().includes(term))
        .sort((a, b) => (a.username < b.username ? -1 : 1)).slice(0, 8)
      const posts = s.posts
        .filter((p) => p.text.toLowerCase().includes(term) && !(v && has(v.hidden, p.id)))
        .sort((a, b) => b.createdAt - a.createdAt).slice(0, 20)
      return {
        users: users.map((u) => ({ ...brief(u), bio: u.bio || '' })),
        posts: posts.map((p) => serializePost(s, p, v)),
        tags: topTags(s, 0, 8, (t) => t.startsWith(term)),
      }
    },

    async trending() {
      await wait(80, 200)
      const s = read()
      const tags = topTags(s, now() - 30 * 24 * 3600 * 1000, 8)
      return tags.length ? tags : topTags(s, 0, 8)
    },

    // ---- notifications ----
    async notifications() {
      await wait(80, 200)
      const s = read()
      const v = requireViewer(s)
      const mine = s.notifications.filter((n) => n.userId === v.id).sort((a, b) => b.createdAt - a.createdAt)
      return {
        unread: mine.filter((n) => !n.read).length,
        items: mine.slice(0, 50).map((n) => ({
          id: n.id, type: n.type, actor: brief(userById(s, n.actorId)), postId: n.postId, snippet: n.snippet,
          read: n.read, createdAt: new Date(n.createdAt).toISOString(),
        })),
      }
    },

    async markNotificationsRead() {
      await wait(40, 120)
      const s = read()
      const v = requireViewer(s)
      s.notifications.forEach((n) => { if (n.userId === v.id) n.read = true })
      write()
      return { message: 'Notifications marked as read' }
    },

    // ---- demo only ----
    async resetDemo() {
      await wait(120, 240)
      cache = null
      try {
        storage.removeItem(STATE_KEY)
        storage.removeItem(AUTH_KEY)
      } catch { /* ignore */ }
      read()
      return { message: 'Demo data reset' }
    },
  }

  return api
}

export default createDemoApi()
