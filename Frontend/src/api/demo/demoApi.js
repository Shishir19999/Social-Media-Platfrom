// Browser-only back end used for the Live preview on GitHub Pages. It implements the same interface as
// src/api/http.js, applies the same rules as the Express API (src/lib/rules.js is shared), keeps
// everything in localStorage and simulates network latency.
import { ApiError, AUTH_KEY, loadAuth } from '../shared'
import { buildSeed, STATE_VERSION } from './seed'
import { resolveMedia } from './art'
import { downsizeImage } from './image'
import { publishLocal } from '../realtime'
import {
  LIMITS, REACTION_TYPES, POLL_DURATIONS, SUSPEND_DAYS, DEFAULT_NOTIFICATION_PREFS, NOTIFICATION_PREFS, PREF_FOR_TYPE,
  extractHashtags, extractMentions, validateUsername, validateEmail, validatePassword, validateProfile, validatePost,
  validateComment, validateMessage, isStaff, canActOnUser, canChangeRole, linkPreview, clip,
} from '../../lib/rules'

export const STATE_KEY = 'orbit_demo_state_v2'

const has = (list, id) => (list || []).includes(id)
const DAY = 86400000
const DEDUPED = ['like', 'reaction', 'follow', 'request', 'repost']
const keyOf = (a, b) => [a, b].sort().join(':')

/**
 * @param {{storage?: Storage, now?: () => number, latency?: boolean, resizeImage?: Function, realtime?: Function}} opts
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
  // the sign-in of this tab (see shared.js); tests pass one storage for both
  const authStorage = new Proxy({}, {
    get(_, key) {
      const target = opts.authStorage ?? opts.storage ?? globalThis.sessionStorage
      const value = target[key]
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  const now = opts.now ?? (() => Date.now())
  const resizeImage = opts.resizeImage ?? downsizeImage
  const emitLive = opts.realtime ?? publishLocal
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
    if (!cache) {
      try {
        const parsed = JSON.parse(storage.getItem(STATE_KEY))
        if (parsed && parsed.version === STATE_VERSION) cache = parsed
      } catch { /* fall through to a fresh seed */ }
      if (!cache) { cache = buildSeed(now()); write() }
    }
    publishDue(cache)
    return cache
  }

  function write() {
    try {
      storage.setItem(STATE_KEY, JSON.stringify(cache))
    } catch {
      cache = null
      throw new ApiError('Live preview storage is full. Use "Reset data" to free up space.', 507)
    }
  }

  // ---- lookups ----
  const userById = (s, id) => s.users.find((u) => u.id === id)
  const userByName = (s, name) => s.users.find((u) => u.username.toLowerCase() === String(name).toLowerCase())
  const findPostRaw = (s, id) => s.posts.find((x) => x.id === id)

  function viewerFrom(s) {
    const { token } = loadAuth(authStorage)
    if (!token || !token.startsWith('demo.')) return null
    const u = userById(s, token.slice(5))
    if (!u || u.status === 'banned') return null
    if (u.status === 'suspended' && u.suspendedUntil && u.suspendedUntil <= now()) {
      u.status = 'active'; u.suspendedUntil = null; u.statusReason = ''
    }
    return u
  }

  function requireViewer(s, { write: writes = true } = {}) {
    const v = viewerFrom(s)
    if (!v) {
      if (loadAuth(authStorage).token && typeof window !== 'undefined') window.dispatchEvent(new Event('auth:expired'))
      throw new ApiError('Authentication required', 401)
    }
    if (writes && v.status === 'suspended') {
      throw new ApiError(`Your account is suspended until ${new Date(v.suspendedUntil).toISOString().slice(0, 10)}. You can read but not post.`, 403)
    }
    return v
  }

  function requireStaff(s) {
    const v = requireViewer(s, { write: false })
    if (!isStaff(v.role)) throw new ApiError('Moderators only', 403)
    return v
  }

  // ---- visibility (mirrors Backend/lib/posts.js) ----
  function relation(v, author) {
    if (!author || (v && v.id === author.id)) return ''
    if (v && isStaff(v.role)) return ''
    if (v && (has(author.blocked, v.id) || has(v.blocked, author.id))) return 'blocked'
    if (author.isPrivate && !(v && has(v.following, author.id))) return 'private'
    return ''
  }

  function excludedAuthors(s, v, { feed = false } = {}) {
    const out = new Set()
    for (const u of s.users) {
      if (v && u.id === v.id) continue
      if (u.isPrivate && !(v && has(v.following, u.id))) out.add(u.id)
      if (v && (has(v.blocked, u.id) || has(u.blocked, v.id) || (feed && has(v.muted, u.id)))) out.add(u.id)
    }
    return out
  }

  const isLive = (p) => p.status !== 'draft' && (p.visibleAt || p.createdAt) <= now() && p.modState === 'ok'

  // ---- serializers ----
  const brief = (u) => (u
    ? { id: u.id, username: u.username, displayName: u.displayName || u.username, avatar: resolveMedia(u.avatar), role: u.role || 'user' }
    : { id: null, username: 'deleted', displayName: 'Deleted user', avatar: null, role: 'user' })

  const publicUser = (u) => ({ ...brief(u), email: u.email, status: u.status, isPrivate: !!u.isPrivate })

  function serializePoll(p, v) {
    if (!p.poll) return null
    const total = p.poll.options.reduce((n, o) => n + o.votes.length, 0)
    const mine = v ? p.poll.options.find((o) => has(o.votes, v.id)) : null
    return {
      options: p.poll.options.map((o) => ({ id: o.id, text: o.text, votes: o.votes.length })),
      total,
      endsAt: new Date(p.poll.endsAt).toISOString(),
      ended: p.poll.endsAt <= now(),
      myVote: mine ? mine.id : null,
    }
  }

  function serializePost(s, p, v, depth = 0) {
    const reactions = Object.fromEntries(REACTION_TYPES.map((t) => [t, 0]))
    for (const t of Object.values(p.reactions)) if (t in reactions) reactions[t] += 1
    let original = null
    if (p.repostOf && !depth) {
      const o = findPostRaw(s, p.repostOf)
      const ok = o && isLive(o) && !excludedAuthors(s, v).has(o.authorId)
      original = ok ? serializePost(s, o, v, 1) : { unavailable: true, id: p.repostOf }
    }
    const mineOrStaff = v && (v.id === p.authorId || isStaff(v.role))
    return {
      id: p.id,
      author: brief(userById(s, p.authorId)),
      title: p.title || '',
      text: p.text,
      images: p.images.map(resolveMedia),
      attachment: null,
      hashtags: p.hashtags,
      createdAt: new Date(p.status === 'draft' ? p.createdAt : (p.visibleAt || p.createdAt)).toISOString(),
      edited: !!p.editedAt,
      likes: Object.keys(p.reactions).length,
      likedByMe: !!v && !!p.reactions[v.id],
      myReaction: v ? p.reactions[v.id] || null : null,
      reactions,
      commentsCount: p.comments.length,
      bookmarkedByMe: !!v && has(v.bookmarks, p.id),
      poll: serializePoll(p, v),
      repostOf: original,
      isRepost: !!p.repostOf && !p.text.trim(),
      reposts: s.posts.filter((x) => x.repostOf === p.id && x.status !== 'draft').length,
      repostedByMe: !!v && s.posts.some((x) => x.repostOf === p.id && x.authorId === v.id && !x.text),
      status: p.status,
      modState: p.modState,
      modNote: mineOrStaff ? p.modNote : '',
      link: linkPreview(p.text),
      pinned: false,
    }
  }

  function serializeComment(s, c, v) {
    return {
      id: c.id,
      parentId: c.parentId,
      author: brief(userById(s, c.authorId)),
      text: c.text,
      createdAt: new Date(c.createdAt).toISOString(),
      likes: c.likes.length,
      likedByMe: !!v && has(c.likes, v.id),
    }
  }

  function serializeProfile(s, u, v) {
    const isMe = !!v && v.id === u.id
    const isFollowing = !!v && has(v.following, u.id)
    const blockedByThem = !!v && has(u.blocked, v.id)
    const profile = {
      ...brief(u),
      bio: u.bio || '',
      cover: resolveMedia(u.cover),
      joined: new Date(u.createdAt).toISOString(),
      followers: s.users.filter((x) => has(x.following, u.id)).length,
      following: u.following.length,
      posts: s.posts.filter((p) => p.authorId === u.id && isLive(p)).length,
      isMe,
      isFollowing,
      requested: !!v && has(u.followRequests, v.id),
      isPrivate: !!u.isPrivate,
      locked: !!u.isPrivate && !isMe && !isFollowing && !(v && isStaff(v.role)),
      blockedByMe: !!v && has(v.blocked, u.id),
      blockedByThem,
      mutedByMe: !!v && has(v.muted, u.id),
      status: u.status,
      pinnedPostId: u.pinnedPostId,
    }
    if (blockedByThem) Object.assign(profile, { bio: '', cover: null, followers: 0, following: 0, posts: 0 })
    return profile
  }

  // ---- notifications ----
  function notify(s, userId, actorId, type, postId, text = '') {
    if (!userId || userId === actorId) return
    const to = userById(s, userId)
    if (!to || has(to.blocked, actorId)) return
    const pref = PREF_FOR_TYPE[type]
    if (pref && to.notifPrefs && to.notifPrefs[pref] === false) return
    if (DEDUPED.includes(type)
      && s.notifications.some((n) => n.userId === userId && n.actorId === actorId && n.type === type && n.postId === (postId || null) && !n.read)) return
    const note = { id: uid('n'), userId, actorId, type, postId: postId || null, snippet: clip(text), read: false, createdAt: now() }
    s.notifications.unshift(note)
    emitLive('notification:new', { userId, id: note.id, type })
  }

  function notifyMentions(s, text, actor, post, skip = []) {
    for (const name of extractMentions(text)) {
      const u = userByName(s, name)
      if (u && !skip.includes(u.id)) notify(s, u.id, actor.id, 'mention', post.id, text)
    }
  }

  // mentions, quotes and reposts notify once a post is visible
  function onPublished(s, p) {
    const author = userById(s, p.authorId)
    notifyMentions(s, p.text, author, p)
    if (p.repostOf) {
      const o = findPostRaw(s, p.repostOf)
      if (o) notify(s, o.authorId, p.authorId, p.text ? 'quote' : 'repost', p.id, p.text)
    }
  }

  function publishDue(s) {
    let changed = false
    for (const p of s.posts) {
      if (p.status === 'scheduled' && p.visibleAt <= now()) { p.status = 'published'; onPublished(s, p); changed = true }
    }
    if (changed) write()
  }

  // ---- loading posts the viewer may open (mirrors loadPost in the API) ----
  function loadPost(s, id, v, { allowOwnUnlisted = true } = {}) {
    const p = findPostRaw(s, id)
    if (!p) throw new ApiError('Post not found', 404)
    const author = userById(s, p.authorId)
    const mine = v && v.id === p.authorId
    const unlisted = p.status === 'draft' || (p.visibleAt || 0) > now()
    if (unlisted && !(allowOwnUnlisted && mine)) throw new ApiError('Post not found', 404)
    if (p.modState !== 'ok' && !(mine || (v && isStaff(v.role)))) throw new ApiError('Post not found', 404)
    const why = relation(v, author)
    if (why === 'blocked') throw new ApiError('Post not found', 404)
    if (why === 'private') throw new ApiError(`@${author.username} has a private account. Follow them to see their posts.`, 403)
    return p
  }

  function topTags(s, v, limit, filter, recentOnly) {
    const ex = excludedAuthors(s, v)
    const since = recentOnly ? now() - 30 * DAY : 0
    const counts = new Map()
    for (const p of s.posts) {
      if (!isLive(p) || ex.has(p.authorId) || (p.visibleAt || p.createdAt) < since) continue
      for (const t of p.hashtags) if (!filter || filter(t)) counts.set(t, (counts.get(t) || 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, limit).map(([tag, count]) => ({ tag, count }))
  }

  const page = (list, pageNo, size) => {
    const lim = Math.min(Math.max(size, 1), 50)
    const start = (Math.max(pageNo, 1) - 1) * lim
    return { slice: list.slice(start, start + lim), page: pageNo, limit: lim, total: list.length, pages: Math.max(Math.ceil(list.length / lim), 1) }
  }

  const byVisible = (a, b) => (b.visibleAt || b.createdAt) - (a.visibleAt || a.createdAt)

  function setReaction(s, v, p, requested) {
    const existing = p.reactions[v.id] || null
    const next = requested === existing ? null : requested
    delete p.reactions[v.id]
    if (next) p.reactions[v.id] = next
    if (next && !existing) notify(s, p.authorId, v.id, next === 'like' ? 'like' : 'reaction', p.id, p.text)
  }

  function log(s, actor, action, targetType, targetId, targetLabel, note = '') {
    s.audit.unshift({ id: uid('a'), actorId: actor.id, action, targetType, targetId, targetLabel: clip(targetLabel, 80), note: String(note).slice(0, LIMITS.modNote), createdAt: now() })
  }

  function moderatePost(s, actor, postId, state, note, action) {
    const p = findPostRaw(s, postId)
    if (!p) throw new ApiError('Post not found', 404)
    const author = userById(s, p.authorId)
    if (state !== 'ok' && author.id !== actor.id && isStaff(author.role) && !canActOnUser(actor, author)) {
      throw new ApiError('You cannot moderate posts by staff of an equal or higher role', 403)
    }
    const before = p.modState
    p.modState = state
    p.modNote = state === 'ok' ? '' : note
    if (state !== 'ok' && before !== state) notify(s, author.id, actor.id, 'moderation', p.id, `${state === 'removed' ? 'Removed' : 'Hidden'}: ${note || 'it breaks the community rules'}`)
    log(s, actor, action || (state === 'ok' ? 'post.restore' : state === 'removed' ? 'post.remove' : 'post.hide'), 'post', p.id, p.text || '(no text)', note)
    return p
  }

  const noteText = (n) => (typeof n === 'string' ? n.trim().slice(0, LIMITS.modNote) : '')

  const api = {
    // ---- auth ----
    async login(identifier, password) {
      await wait()
      const s = read()
      const id = String(identifier || '').trim().toLowerCase()
      const u = s.users.find((x) => x.username.toLowerCase() === id || x.email.toLowerCase() === id)
      if (!id || !password) throw new ApiError('Email/username and password are required', 400)
      if (!u || u.password !== password) throw new ApiError('Invalid credentials', 401)
      if (u.status === 'banned') throw new ApiError(`This account has been banned.${u.statusReason ? ` Reason: ${u.statusReason}` : ''}`, 403)
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
        password, avatar: null, cover: null, createdAt: now(), role: 'user', status: 'active', suspendedUntil: null, statusReason: '',
        isPrivate: false, following: [], followRequests: [], blocked: [], muted: [], notifPrefs: { ...DEFAULT_NOTIFICATION_PREFS },
        pinnedPostId: null, bookmarks: [], hidden: [],
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
    async listPosts({ scope, tag, author, saved, media, page: pageNo = 1, limit = 10 } = {}) {
      await wait()
      const s = read()
      const v = viewerFrom(s)
      const ex = excludedAuthors(s, v, { feed: scope === 'following' || scope === 'explore' })
      let list = s.posts.filter(isLive)
      if (v) list = list.filter((p) => !has(v.hidden, p.id))
      let pinned = null
      if (scope === 'following') {
        if (!v) throw new ApiError('Authentication required', 401)
        list = list.filter((p) => p.authorId === v.id || has(v.following, p.authorId))
      }
      if (saved) {
        if (!v) throw new ApiError('Authentication required', 401)
        list = list.filter((p) => has(v.bookmarks, p.id))
      }
      if (tag) list = list.filter((p) => has(p.hashtags, String(tag).replace(/^#/, '').toLowerCase()))
      if (media) list = list.filter((p) => p.images.length > 0)
      if (author) {
        const a = userByName(s, author)
        if (!a) list = []
        else {
          const why = relation(v, a)
          if (why) return { posts: [], page: pageNo, limit, total: 0, pages: 1, locked: why === 'private' }
          list = list.filter((p) => p.authorId === a.id)
          if (a.pinnedPostId && !tag && !media) pinned = list.find((p) => p.id === a.pinnedPostId) || null
          if (pinned) list = list.filter((p) => p.id !== pinned.id)
        }
      } else list = list.filter((p) => !ex.has(p.authorId))
      list = [...list].sort(byVisible)
      const pg = page(list, pageNo, limit)
      const shown = pinned && pageNo === 1 ? [pinned, ...pg.slice] : pg.slice
      return {
        posts: shown.map((p) => ({ ...serializePost(s, p, v), pinned: !!pinned && p.id === pinned.id })),
        page: pageNo, limit: pg.limit, total: pg.total + (pinned && pageNo === 1 ? 1 : 0), pages: pg.pages,
      }
    },

    async myPosts(status) {
      await wait(80, 200)
      const s = read()
      const v = requireViewer(s, { write: false })
      const want = status === 'scheduled' ? 'scheduled' : 'draft'
      const list = s.posts.filter((p) => p.authorId === v.id && p.status === want)
        .sort((a, b) => (want === 'scheduled' ? a.visibleAt - b.visibleAt : b.createdAt - a.createdAt))
      return { posts: list.map((p) => serializePost(s, p, v)) }
    },

    async getPost(id) {
      await wait(80, 200)
      const s = read()
      const v = viewerFrom(s)
      const p = loadPost(s, id, v)
      return { ...serializePost(s, p, v), pinned: userById(s, p.authorId)?.pinnedPostId === p.id }
    },

    async createPost({ text = '', images = [], poll, quoteOf, status = 'published', scheduleAt } = {}) {
      await wait(250, 500)
      const s = read()
      const v = requireViewer(s)
      const body = String(text || '').trim()
      const err = validatePost({ text: body, poll, images: images.length, scheduleAt: scheduleAt ? new Date(scheduleAt).getTime() : undefined, status }, now())
      if (err) throw new ApiError(err, 400)
      let repostOf = null
      if (quoteOf) {
        if (!body) throw new ApiError('Add your comment to quote a post', 400)
        const original = findPostRaw(s, quoteOf)
        if (!original || !isLive(original)) throw new ApiError('The post you are quoting is not available', 400)
        repostOf = original.repostOf && !original.text ? original.repostOf : original.id
      }
      const stored = []
      for (const file of images) stored.push(await resizeImage(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.7 }))
      const t = now()
      const post = {
        id: uid('p'), authorId: v.id, title: '', text: body, images: stored, hashtags: extractHashtags(body),
        createdAt: t, editedAt: null, reactions: {}, comments: [], repostOf, status, editHistory: [], modState: 'ok', modNote: '',
        visibleAt: status === 'draft' ? null : (status === 'scheduled' ? new Date(scheduleAt).getTime() : t),
        poll: poll ? {
          endsAt: t + POLL_DURATIONS[poll.duration] * 60000,
          options: poll.options.map((o) => String(o).trim()).filter(Boolean).map((text2) => ({ id: uid('o'), text: text2, votes: [] })),
        } : null,
      }
      s.posts.unshift(post)
      if (status === 'published') onPublished(s, post)
      write()
      return serializePost(s, post, v)
    },

    async updatePost(id, { text }) {
      await wait()
      const s = read()
      const v = requireViewer(s)
      const p = findPostRaw(s, id)
      if (!p) throw new ApiError('Post not found', 404)
      if (p.authorId !== v.id) throw new ApiError('You can only edit your own posts', 403)
      const body = String(text || '').trim()
      if (!body && !p.poll && !p.images.length) throw new ApiError('Content cannot be empty', 400)
      if (body.length > LIMITS.post) throw new ApiError(`Posts are limited to ${LIMITS.post} characters.`, 400)
      if (body !== p.text && p.status !== 'draft') p.editHistory.push({ text: p.text, at: p.editedAt || p.createdAt })
      p.text = body
      p.hashtags = extractHashtags(body)
      if (p.status !== 'draft') p.editedAt = now()
      write()
      return serializePost(s, p, v)
    },

    async deletePost(id) {
      await wait()
      const s = read()
      const v = requireViewer(s)
      const p = findPostRaw(s, id)
      if (!p) throw new ApiError('Post not found', 404)
      if (p.authorId !== v.id) throw new ApiError('You can only delete your own posts', 403)
      s.posts = s.posts.filter((x) => x.id !== id)
      s.notifications = s.notifications.filter((n) => n.postId !== id)
      s.reports = s.reports.filter((r) => r.postId !== id)
      s.users.forEach((u) => { if (u.pinnedPostId === id) u.pinnedPostId = null })
      write()
      return { message: 'Post deleted' }
    },

    async publishPost(id, { scheduleAt } = {}) {
      await wait()
      const s = read()
      const v = requireViewer(s)
      const p = loadPost(s, id, v)
      if (p.authorId !== v.id) throw new ApiError('You can only publish your own posts', 403)
      if (p.status === 'published') throw new ApiError('This post is already published', 400)
      const at = scheduleAt ? new Date(scheduleAt).getTime() : null
      const status = at ? 'scheduled' : 'published'
      const err = validatePost({ text: p.text, poll: p.poll ? { options: p.poll.options.map((o) => o.text), duration: '1d' } : undefined, images: p.images.length, scheduleAt: at, status }, now())
      if (err) throw new ApiError(err.replace(/\.$/, ''), 400)
      p.status = status
      p.visibleAt = at || now()
      if (status === 'published') onPublished(s, p)
      write()
      return serializePost(s, p, v)
    },

    async postHistory(id) {
      await wait(60, 160)
      const s = read()
      const p = loadPost(s, id, viewerFrom(s))
      return [{ text: p.text, at: new Date(p.editedAt || p.createdAt).toISOString(), current: true },
        ...[...p.editHistory].reverse().map((h) => ({ text: h.text, at: new Date(h.at).toISOString(), current: false }))]
    },

    async toggleLike(id) {
      await wait(60, 160)
      const s = read()
      const v = requireViewer(s)
      const p = loadPost(s, id, v, { allowOwnUnlisted: false })
      setReaction(s, v, p, 'like')
      write()
      return serializePost(s, p, v)
    },

    async react(id, type) {
      await wait(60, 160)
      const s = read()
      const v = requireViewer(s)
      if (!REACTION_TYPES.includes(type)) throw new ApiError('Unknown reaction', 400)
      const p = loadPost(s, id, v, { allowOwnUnlisted: false })
      setReaction(s, v, p, type)
      write()
      return serializePost(s, p, v)
    },

    async votePoll(id, optionId) {
      await wait(80, 200)
      const s = read()
      const v = requireViewer(s)
      const p = loadPost(s, id, v, { allowOwnUnlisted: false })
      if (!p.poll) throw new ApiError('This post has no poll', 400)
      if (p.poll.endsAt <= now()) throw new ApiError('This poll has ended', 400)
      const option = p.poll.options.find((o) => o.id === optionId)
      if (!option) throw new ApiError('Choose one of the options', 400)
      if (p.poll.options.some((o) => has(o.votes, v.id))) throw new ApiError('You already voted in this poll', 409)
      option.votes.push(v.id)
      write()
      return serializePost(s, p, v)
    },

    async toggleRepost(id) {
      await wait(80, 200)
      const s = read()
      const v = requireViewer(s)
      const p = loadPost(s, id, v, { allowOwnUnlisted: false })
      const target = p.repostOf && !p.text ? p.repostOf : p.id
      const existing = s.posts.find((x) => x.authorId === v.id && x.repostOf === target && !x.text)
      if (existing) s.posts = s.posts.filter((x) => x !== existing)
      else {
        const t = now()
        const created = { id: uid('p'), authorId: v.id, title: '', text: '', images: [], hashtags: [], createdAt: t, editedAt: null, reactions: {}, comments: [], poll: null, repostOf: target, status: 'published', visibleAt: t, editHistory: [], modState: 'ok', modNote: '' }
        s.posts.unshift(created)
        onPublished(s, created)
      }
      write()
      return serializePost(s, findPostRaw(s, target), v)
    },

    async pinPost(id) {
      await wait(60, 160)
      const s = read()
      const v = requireViewer(s)
      const p = loadPost(s, id, v, { allowOwnUnlisted: false })
      if (p.authorId !== v.id) throw new ApiError('You can only pin your own posts', 403)
      const pinned = v.pinnedPostId === p.id
      v.pinnedPostId = pinned ? null : p.id
      write()
      return { pinned: !pinned }
    },

    async toggleBookmark(id) {
      await wait(60, 160)
      const s = read()
      const v = requireViewer(s)
      const p = loadPost(s, id, v, { allowOwnUnlisted: false })
      v.bookmarks = has(v.bookmarks, id) ? v.bookmarks.filter((x) => x !== id) : [...v.bookmarks, id]
      write()
      return serializePost(s, p, v)
    },

    async hidePost(id) {
      await wait(60, 160)
      const s = read()
      const v = requireViewer(s)
      loadPost(s, id, v, { allowOwnUnlisted: false })
      if (!has(v.hidden, id)) v.hidden.push(id)
      write()
      return { message: 'Post hidden' }
    },

    async reportPost(id, reason) {
      await wait()
      const s = read()
      const v = requireViewer(s)
      const p = loadPost(s, id, v, { allowOwnUnlisted: false })
      if (p.authorId === v.id) throw new ApiError('You cannot report your own post', 400)
      const text = String(reason || '').slice(0, LIMITS.reportReason)
      const existing = s.reports.find((r) => r.postId === id && r.userId === v.id)
      if (existing) Object.assign(existing, { reason: text, status: 'open', createdAt: now(), resolvedBy: null, resolution: '' })
      else s.reports.push({ postId: id, userId: v.id, reason: text, status: 'open', createdAt: now() })
      if (!has(v.hidden, id)) v.hidden.push(id)
      write()
      return { message: 'Report received' }
    },

    // ---- comments ----
    async listComments(postId) {
      await wait(100, 240)
      const s = read()
      const v = viewerFrom(s)
      const p = loadPost(s, postId, v)
      return p.comments.filter((c) => !(v && has(v.blocked, c.authorId))).map((c) => serializeComment(s, c, v))
    },

    async addComment(postId, { text, parentId }) {
      await wait()
      const s = read()
      const v = requireViewer(s)
      const body = String(text || '').trim()
      const err = validateComment(body)
      if (err) throw new ApiError(err, 400)
      const p = loadPost(s, postId, v, { allowOwnUnlisted: false })
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
      const p = loadPost(s, postId, v)
      const c = p.comments.find((x) => x.id === commentId)
      if (!c) throw new ApiError('Comment not found', 404)
      if (c.authorId !== v.id && p.authorId !== v.id && !isStaff(v.role)) throw new ApiError('You can only delete your own comments', 403)
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
      const c = loadPost(s, postId, v, { allowOwnUnlisted: false }).comments.find((x) => x.id === commentId)
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
      const err = validateProfile({ displayName, bio })
      if (err) throw new ApiError(err.replace(/\.$/, ''), 400)
      if (displayName !== undefined) v.displayName = displayName.trim() || v.username
      if (bio !== undefined) v.bio = bio.trim()
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
      if (has(target.blocked, v.id) || has(v.blocked, target.id)) throw new ApiError('You cannot follow this account', 403)
      if (has(v.following, target.id)) v.following = v.following.filter((x) => x !== target.id)
      else if (has(target.followRequests, v.id)) target.followRequests = target.followRequests.filter((x) => x !== v.id)
      else if (target.isPrivate) { target.followRequests.push(v.id); notify(s, target.id, v.id, 'request') }
      else { v.following.push(target.id); notify(s, target.id, v.id, 'follow') }
      write()
      return serializeProfile(s, target, v)
    },

    async toggleBlock(username) {
      return api.toggleRelation(username, 'blocked')
    },
    async toggleMute(username) {
      return api.toggleRelation(username, 'muted')
    },
    async toggleRelation(username, field) {
      await wait(80, 200)
      const s = read()
      const v = requireViewer(s)
      const target = userByName(s, username)
      if (!target) throw new ApiError('User not found', 404)
      if (target.id === v.id) throw new ApiError(`You cannot ${field === 'blocked' ? 'block' : 'mute'} yourself`, 400)
      if (has(v[field], target.id)) v[field] = v[field].filter((x) => x !== target.id)
      else {
        v[field].push(target.id)
        if (field === 'blocked') {
          v.following = v.following.filter((x) => x !== target.id)
          v.followRequests = v.followRequests.filter((x) => x !== target.id)
          target.following = target.following.filter((x) => x !== v.id)
          target.followRequests = target.followRequests.filter((x) => x !== v.id)
        }
      }
      write()
      return serializeProfile(s, target, v)
    },

    async suggestions({ limit = 5 } = {}) {
      await wait(100, 220)
      const s = read()
      const v = viewerFrom(s)
      const exclude = new Set(v ? [v.id, ...v.following, ...v.blocked] : [])
      const scores = new Map()
      const why = new Map()
      if (v) {
        for (const f of s.users.filter((u) => has(v.following, u.id))) {
          for (const id of f.following) {
            scores.set(id, (scores.get(id) || 0) + 1)
            if (!why.has(id)) why.set(id, f.username)
          }
        }
      }
      const followers = (u) => s.users.filter((x) => has(x.following, u.id)).length
      const list = s.users
        .filter((u) => !exclude.has(u.id) && u.status !== 'banned' && !(v && has(u.blocked, v.id)))
        .map((u) => ({ u, score: scores.get(u.id) || 0, n: followers(u) }))
        .sort((a, b) => b.score - a.score || b.n - a.n || (a.u.id < b.u.id ? -1 : 1))
        .slice(0, Math.min(limit, 30))
      return list.map(({ u }) => ({ ...brief(u), bio: u.bio || '', reason: why.has(u.id) ? `Followed by @${why.get(u.id)}` : 'Popular on Orbit' }))
    },

    async searchUsers(q) {
      await wait(40, 110)
      const s = read()
      const v = viewerFrom(s)
      const term = String(q || '').trim().replace(/^@/, '').toLowerCase()
      const list = s.users
        .filter((u) => u.status !== 'banned' && !(v && (has(v.blocked, u.id) || has(u.blocked, v.id))))
        .filter((u) => !term || u.username.toLowerCase().startsWith(term) || (u.displayName || '').toLowerCase().startsWith(term))
        .sort((a, b) => (a.username < b.username ? -1 : 1))
      list.sort((a, b) => Number(!!v && has(v.following, b.id)) - Number(!!v && has(v.following, a.id)))
      return list.slice(0, 6).map(brief)
    },

    async listConnections(username, kind, pageNo = 1) {
      await wait(80, 200)
      const s = read()
      const v = viewerFrom(s)
      const u = userByName(s, username)
      if (!u) throw new ApiError('User not found', 404)
      if (relation(v, u)) throw new ApiError('This account is private.', 403)
      let list = kind === 'followers' ? s.users.filter((x) => has(x.following, u.id)) : s.users.filter((x) => has(u.following, x.id))
      if (v) list = list.filter((x) => !has(v.blocked, x.id))
      list.sort((a, b) => (a.username < b.username ? -1 : 1))
      const pg = page(list, pageNo, 20)
      return {
        users: pg.slice.map((x) => ({ ...brief(x), bio: x.bio || '', isFollowing: !!v && has(v.following, x.id), isMe: !!v && v.id === x.id })),
        page: pageNo, limit: pg.limit, total: pg.total, pages: pg.pages,
      }
    },

    async relations() {
      await wait(60, 160)
      const s = read()
      const v = requireViewer(s, { write: false })
      return {
        blocked: v.blocked.map((id) => userById(s, id)).filter(Boolean).map(brief),
        muted: v.muted.map((id) => userById(s, id)).filter(Boolean).map(brief),
      }
    },

    // ---- settings and follow requests ----
    async getSettings() {
      await wait(60, 160)
      const v = requireViewer(read(), { write: false })
      return { isPrivate: !!v.isPrivate, notifications: { ...DEFAULT_NOTIFICATION_PREFS, ...v.notifPrefs } }
    },

    async updateSettings({ isPrivate, notifications } = {}) {
      await wait(80, 200)
      const s = read()
      const v = requireViewer(s)
      if (notifications !== undefined) {
        if (typeof notifications !== 'object' || notifications === null) throw new ApiError('Invalid notification settings', 400)
        const prefs = { ...DEFAULT_NOTIFICATION_PREFS, ...v.notifPrefs }
        for (const key of NOTIFICATION_PREFS) if (typeof notifications[key] === 'boolean') prefs[key] = notifications[key]
        v.notifPrefs = prefs
      }
      if (typeof isPrivate === 'boolean') {
        if (!isPrivate && v.isPrivate && v.followRequests.length) {
          for (const id of v.followRequests) {
            const u = userById(s, id)
            if (u && !has(u.following, v.id)) u.following.push(v.id)
            notify(s, id, v.id, 'accepted')
          }
          v.followRequests = []
        }
        v.isPrivate = isPrivate
      }
      write()
      return { isPrivate: !!v.isPrivate, notifications: { ...DEFAULT_NOTIFICATION_PREFS, ...v.notifPrefs } }
    },

    async followRequests() {
      await wait(60, 160)
      const s = read()
      const v = requireViewer(s, { write: false })
      return v.followRequests.map((id) => userById(s, id)).filter(Boolean).map((u) => ({ ...brief(u), bio: u.bio || '' }))
    },

    async answerFollowRequest(username, action) {
      await wait(80, 200)
      const s = read()
      const v = requireViewer(s)
      const u = userByName(s, username)
      if (!u || !has(v.followRequests, u.id)) throw new ApiError('No such follow request', 404)
      v.followRequests = v.followRequests.filter((x) => x !== u.id)
      if (action === 'accept') { u.following.push(v.id); notify(s, u.id, v.id, 'accepted') }
      write()
      return { message: action === 'accept' ? 'Request accepted' : 'Request declined' }
    },

    // ---- discovery ----
    async search(q) {
      await wait()
      const s = read()
      const v = viewerFrom(s)
      const term = String(q || '').trim().replace(/^[#@]/, '').toLowerCase()
      if (!term) return { users: [], posts: [], tags: [] }
      const ex = excludedAuthors(s, v)
      const users = s.users
        .filter((u) => u.status !== 'banned' && !(v && (has(v.blocked, u.id) || has(u.blocked, v.id))))
        .filter((u) => u.username.toLowerCase().includes(term) || (u.displayName || '').toLowerCase().includes(term))
        .sort((a, b) => (a.username < b.username ? -1 : 1)).slice(0, 8)
      const posts = s.posts
        .filter((p) => isLive(p) && !ex.has(p.authorId) && p.text.toLowerCase().includes(term) && !(v && has(v.hidden, p.id)))
        .sort(byVisible).slice(0, 20)
      return {
        users: users.map((u) => ({ ...brief(u), bio: u.bio || '' })),
        posts: posts.map((p) => serializePost(s, p, v)),
        tags: topTags(s, v, 8, (t) => t.startsWith(term)),
      }
    },

    async trending() {
      await wait(80, 200)
      const s = read()
      const v = viewerFrom(s)
      const tags = topTags(s, v, 8, null, true)
      return tags.length ? tags : topTags(s, v, 8)
    },

    // ---- notifications ----
    async notifications() {
      await wait(80, 200)
      const s = read()
      const v = requireViewer(s, { write: false })
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
      const v = requireViewer(s, { write: false })
      s.notifications.forEach((n) => { if (n.userId === v.id) n.read = true })
      write()
      return { message: 'Notifications marked as read' }
    },

    // ---- direct messages ----
    async conversations() {
      await wait(80, 200)
      const s = read()
      const v = requireViewer(s, { write: false })
      const list = []
      for (const c of s.conversations) {
        if (!has(c.participants, v.id) || !c.messages.length) continue
        const other = userById(s, c.participants.find((id) => id !== v.id))
        if (!other || has(v.blocked, other.id)) continue
        const last = c.messages[c.messages.length - 1]
        const since = c.reads[v.id] || 0
        list.push({
          id: c.id,
          with: brief(other),
          last: { text: clip(last.text, 120), at: new Date(last.createdAt).toISOString(), mine: last.senderId === v.id },
          unread: c.messages.filter((m) => m.senderId !== v.id && m.createdAt > since).length,
          at: last.createdAt,
        })
      }
      return list.sort((a, b) => b.at - a.at).map((c) => { delete c.at; return c })
    },

    async thread(username, { before } = {}) {
      await wait(80, 200)
      const s = read()
      const v = requireViewer(s, { write: false })
      const other = peer(s, v, username)
      const c = s.conversations.find((x) => x.key === keyOf(v.id, other.id))
      let rows = c ? c.messages : []
      if (before) { const i = rows.findIndex((m) => m.id === before); if (i >= 0) rows = rows.slice(0, i) }
      const shown = rows.slice(-30)
      const toMsg = (m) => ({ id: m.id, sender: m.senderId, text: m.text, createdAt: new Date(m.createdAt).toISOString() })
      return {
        with: brief(other),
        messages: shown.map(toMsg),
        hasMore: rows.length > shown.length,
        otherRead: c && c.reads[other.id] ? new Date(c.reads[other.id]).toISOString() : null,
      }
    },

    async sendMessage(username, text) {
      await wait(80, 220)
      const s = read()
      const v = requireViewer(s)
      const other = peer(s, v, username)
      const body = String(text || '').trim()
      const err = validateMessage(body)
      if (err) throw new ApiError(err, 400)
      let c = s.conversations.find((x) => x.key === keyOf(v.id, other.id))
      if (!c) { c = { id: uid('m'), key: keyOf(v.id, other.id), participants: [v.id, other.id], messages: [], reads: {} }; s.conversations.push(c) }
      const m = { id: uid('x'), senderId: v.id, text: body, createdAt: now() }
      c.messages.push(m)
      c.reads[v.id] = m.createdAt
      write()
      const message = { id: m.id, sender: v.id, text: m.text, createdAt: new Date(m.createdAt).toISOString() }
      emitLive('message:new', { conversationId: c.id, from: v.id, to: other.id, message })
      return message
    },

    async markThreadRead(username) {
      await wait(30, 90)
      const s = read()
      const v = requireViewer(s, { write: false })
      const other = peer(s, v, username)
      const c = s.conversations.find((x) => x.key === keyOf(v.id, other.id))
      if (c) { c.reads[v.id] = now(); write(); emitLive('message:read', { from: v.id, to: other.id }) }
      return { message: 'Marked as read' }
    },

    async unreadMessages() {
      await wait(30, 90)
      const s = read()
      const v = requireViewer(s, { write: false })
      return s.conversations.filter((c) => has(c.participants, v.id) && c.messages.length
        && c.messages[c.messages.length - 1].senderId !== v.id
        && c.messages.some((m) => m.senderId !== v.id && m.createdAt > (c.reads[v.id] || 0))).length
    },

    // ---- staff: statistics, reports queue, post moderation, users, audit log ----
    async modStats() {
      await wait(100, 240)
      const s = read()
      requireStaff(s)
      const week = now() - 7 * DAY
      const counted = s.posts.filter((p) => p.status !== 'draft')
      const series = []
      for (let i = 6; i >= 0; i--) {
        const day = new Date(now() - i * DAY).toISOString().slice(0, 10)
        series.push({ day, posts: counted.filter((p) => new Date(p.createdAt).toISOString().slice(0, 10) === day).length })
      }
      return {
        users: s.users.length, posts: counted.length,
        openReports: new Set(s.reports.filter((r) => r.status === 'open').map((r) => r.postId)).size,
        moderated: s.posts.filter((p) => p.modState !== 'ok').length,
        suspended: s.users.filter((u) => u.status === 'suspended').length,
        banned: s.users.filter((u) => u.status === 'banned').length,
        newUsers: s.users.filter((u) => u.createdAt >= week).length,
        newPosts: counted.filter((p) => p.createdAt >= week).length,
        series,
      }
    },

    async modReports({ status = 'open', page: pageNo = 1 } = {}) {
      await wait(100, 240)
      const s = read()
      const v = requireStaff(s)
      const wanted = s.reports.filter((r) => (status === 'closed' ? r.status !== 'open' : r.status === 'open')).sort((a, b) => b.createdAt - a.createdAt)
      const groups = new Map()
      for (const r of wanted) {
        if (!groups.has(r.postId)) groups.set(r.postId, { postId: r.postId, reports: [], lastAt: r.createdAt })
        groups.get(r.postId).reports.push(r)
      }
      const pg = page([...groups.values()], pageNo, 10)
      return {
        items: pg.slice.map((g) => {
          const p = findPostRaw(s, g.postId)
          return {
            post: p ? serializePost(s, p, v) : null,
            postId: g.postId,
            count: g.reports.length,
            lastAt: new Date(g.lastAt).toISOString(),
            status: g.reports[0].status,
            resolution: g.reports[0].resolution || '',
            reports: g.reports.map((r) => ({ reporter: brief(userById(s, r.userId)), reason: r.reason, createdAt: new Date(r.createdAt).toISOString() })),
          }
        }),
        page: pageNo, total: pg.total, pages: pg.pages,
      }
    },

    async resolveReport(postId, { action, note }) {
      await wait(120, 260)
      const s = read()
      const v = requireStaff(s)
      if (!['dismiss', 'hide', 'remove'].includes(action)) throw new ApiError('Choose dismiss, hide or remove', 400)
      const text = noteText(note)
      if (action === 'dismiss') {
        const p = findPostRaw(s, postId)
        if (!p) throw new ApiError('Post not found', 404)
        log(s, v, 'report.dismiss', 'post', p.id, p.text || '(no text)', text)
      } else moderatePost(s, v, postId, action === 'hide' ? 'hidden' : 'removed', text, `report.${action}`)
      for (const r of s.reports) {
        if (r.postId === postId && r.status === 'open') {
          Object.assign(r, { status: action === 'dismiss' ? 'dismissed' : 'resolved', resolvedBy: v.id, resolvedAt: now(), resolution: action === 'dismiss' ? 'Dismissed' : `Post ${action === 'hide' ? 'hidden' : 'removed'}` })
        }
      }
      write()
      return { message: 'Report resolved' }
    },

    async modPosts({ page: pageNo = 1 } = {}) {
      await wait(100, 240)
      const s = read()
      const v = requireStaff(s)
      const pg = page(s.posts.filter((p) => p.modState !== 'ok').sort((a, b) => b.createdAt - a.createdAt), pageNo, 10)
      return { items: pg.slice.map((p) => serializePost(s, p, v)), page: pageNo, total: pg.total, pages: pg.pages }
    },

    async setModState(postId, { state, note }) {
      await wait(100, 240)
      const s = read()
      const v = requireStaff(s)
      if (!['ok', 'hidden', 'removed'].includes(state)) throw new ApiError('Unknown state', 400)
      const p = moderatePost(s, v, postId, state, noteText(note))
      write()
      return { id: p.id, modState: p.modState }
    },

    async modUsers({ q, role, status, page: pageNo = 1 } = {}) {
      await wait(100, 240)
      const s = read()
      const v = requireStaff(s)
      const term = String(q || '').trim().toLowerCase()
      const list = s.users
        .filter((u) => (!term || u.username.toLowerCase().includes(term) || (u.displayName || '').toLowerCase().includes(term)) && (!role || u.role === role) && (!status || u.status === status))
        .sort((a, b) => b.createdAt - a.createdAt)
      const pg = page(list, pageNo, 15)
      return {
        items: pg.slice.map((u) => ({
          ...brief(u), status: u.status, suspendedUntil: u.suspendedUntil ? new Date(u.suspendedUntil).toISOString() : null, statusReason: u.statusReason || '',
          joined: new Date(u.createdAt).toISOString(), posts: s.posts.filter((p) => p.authorId === u.id && p.status !== 'draft').length,
          ...(v.role === 'admin' ? { email: u.email } : {}),
        })),
        page: pageNo, total: pg.total, pages: pg.pages,
      }
    },

    async setUserStatus(id, { action, days, reason }) {
      await wait(120, 260)
      const s = read()
      const v = requireStaff(s)
      const t = userById(s, id)
      if (!t) throw new ApiError('User not found', 404)
      if (!canActOnUser(v, t)) throw new ApiError('You cannot act on this account', 403)
      const why = noteText(reason)
      if (action === 'suspend') {
        if (!SUSPEND_DAYS.includes(Number(days))) throw new ApiError(`Choose a suspension of ${SUSPEND_DAYS.join(', ')} days`, 400)
        Object.assign(t, { status: 'suspended', suspendedUntil: now() + Number(days) * DAY, statusReason: why })
      } else if (action === 'ban') {
        if (v.role !== 'admin') throw new ApiError('Only administrators can ban accounts', 403)
        Object.assign(t, { status: 'banned', suspendedUntil: null, statusReason: why })
      } else if (action === 'restore') Object.assign(t, { status: 'active', suspendedUntil: null, statusReason: '' })
      else throw new ApiError('Choose suspend, ban or restore', 400)
      log(s, v, `user.${action}`, 'user', t.id, `@${t.username}`, why)
      write()
      return { id: t.id, status: t.status, suspendedUntil: t.suspendedUntil ? new Date(t.suspendedUntil).toISOString() : null }
    },

    async setUserRole(id, role) {
      await wait(120, 260)
      const s = read()
      const v = requireViewer(s, { write: false })
      if (v.role !== 'admin') throw new ApiError('Administrators only', 403)
      const t = userById(s, id)
      if (!t) throw new ApiError('User not found', 404)
      if (!canChangeRole(v, t, role)) throw new ApiError('You cannot change this role', 403)
      const before = t.role
      t.role = role
      log(s, v, 'user.role', 'user', t.id, `@${t.username}`, `${before} to ${role}`)
      write()
      return { id: t.id, role: t.role }
    },

    async auditLog({ page: pageNo = 1 } = {}) {
      await wait(100, 240)
      const s = read()
      requireStaff(s)
      const pg = page([...s.audit].sort((a, b) => b.createdAt - a.createdAt), pageNo, 20)
      return {
        items: pg.slice.map((a) => ({ id: a.id, actor: brief(userById(s, a.actorId)), action: a.action, targetType: a.targetType, targetId: a.targetId, targetLabel: a.targetLabel, note: a.note, createdAt: new Date(a.createdAt).toISOString() })),
        page: pageNo, total: pg.total, pages: pg.pages,
      }
    },

    // ---- Live preview only ----
    async resetDemo() {
      await wait(120, 240)
      cache = null
      try {
        storage.removeItem(STATE_KEY)
        authStorage.removeItem(AUTH_KEY)
      } catch { /* ignore */ }
      read()
      return { message: 'Live preview data reset' }
    },
  }

  // the other person of a conversation; people who blocked each other cannot message
  function peer(s, v, username) {
    const other = userByName(s, username)
    if (!other || other.status === 'banned') throw new ApiError('User not found', 404)
    if (other.id === v.id) throw new ApiError('You cannot message yourself', 400)
    if (has(other.blocked, v.id) || has(v.blocked, other.id)) throw new ApiError('You cannot message this account', 403)
    return other
  }

  return api
}

export default createDemoApi()
