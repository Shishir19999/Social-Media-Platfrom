// Real mode: talks to the Express API (see Backend/).
import axios from 'axios'
import { API_URL } from '../config'
import { ApiError, getToken } from './shared'

const client = axios.create({ baseURL: API_URL })

client.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

async function call(config) {
  try {
    const { data } = await client(config)
    return data
  } catch (err) {
    const status = err.response?.status || 0
    // a revoked or expired token: let the auth context sign the visitor out
    if (status === 401 && getToken() && !String(config.url).startsWith('/api/auth/')) {
      window.dispatchEvent(new Event('auth:expired'))
    }
    const message = err.response?.data?.error
      || (status ? 'Something went wrong. Please try again.' : 'Cannot reach the server. Check your connection and try again.')
    throw new ApiError(message, status)
  }
}


const abs = (p) => (p && p.startsWith('/uploads/') ? `${API_URL}${p}` : p)

const fixUser = (u) => (u && 'avatar' in u ? { ...u, avatar: abs(u.avatar) } : u)
const fixPost = (p) => ({
  ...p,
  author: fixUser(p.author),
  images: (p.images || []).map(abs),
  attachment: abs(p.attachment),
  repostOf: p.repostOf && !p.repostOf.unavailable ? fixPost(p.repostOf) : p.repostOf,
})
const fixComment = (c) => ({ ...c, author: fixUser(c.author) })
const fixProfile = (p) => ({ ...fixUser(p), cover: abs(p.cover) })
const fixPage = (data, key) => ({ ...data, [key]: data[key].map(fixPost) })

function postForm({ text = '', images = [], poll, quoteOf, status, scheduleAt }) {
  const form = new FormData()
  form.append('content', text)
  images.forEach((file) => form.append('images', file))
  if (poll) form.append('poll', JSON.stringify(poll))
  if (quoteOf) form.append('quoteOf', quoteOf)
  if (status) form.append('status', status)
  if (scheduleAt) form.append('scheduleAt', new Date(scheduleAt).toISOString())
  return form
}

const enc = encodeURIComponent
const post = (url, data) => call({ method: 'post', url, data })

const http = {
  async login(identifier, password) {
    const data = await post('/api/auth/login', { identifier, password })
    return { ...data, user: fixUser(data.user) }
  },
  async register(username, email, password) {
    const data = await post('/api/auth/register', { username, email, password })
    return { ...data, user: fixUser(data.user) }
  },
  async me() {
    const data = await call({ method: 'get', url: '/api/auth/me' })
    return { user: fixUser(data.user) }
  },
  logout: () => post('/api/auth/logout'),

  async listPosts({ scope, tag, author, saved, media, page = 1, limit = 10 } = {}) {
    const data = await call({ method: 'get', url: '/api/feed', params: { scope, tag, author, saved: saved ? 1 : undefined, media: media ? 1 : undefined, page, limit } })
    return fixPage(data, 'posts')
  },
  async getPost(id) {
    return fixPost(await call({ method: 'get', url: `/api/posts/${id}` }))
  },
  async createPost(input) {
    const created = await call({ method: 'post', url: '/api/posts', data: postForm(input) })
    return http.getPost(created._id)
  },
  async updatePost(id, { text }) {
    await call({ method: 'put', url: `/api/posts/${id}`, data: postForm({ text }) })
    return http.getPost(id)
  },
  deletePost: (id) => call({ method: 'delete', url: `/api/posts/${id}` }),
  async myPosts(status) {
    return fixPage(await call({ method: 'get', url: '/api/posts/mine', params: { status } }), 'posts')
  },
  async publishPost(id, { scheduleAt } = {}) {
    return fixPost(await post(`/api/posts/${id}/publish`, { scheduleAt: scheduleAt ? new Date(scheduleAt).toISOString() : undefined }))
  },
  postHistory: (id) => call({ method: 'get', url: `/api/posts/${id}/history` }),
  async toggleLike(id) {
    return fixPost(await post(`/api/posts/${id}/like`))
  },
  async react(id, type) {
    return fixPost(await post(`/api/posts/${id}/react`, { type }))
  },
  async votePoll(id, optionId) {
    return fixPost(await post(`/api/posts/${id}/vote`, { optionId }))
  },
  async toggleRepost(id) {
    return fixPost(await post(`/api/posts/${id}/repost`))
  },
  pinPost: (id) => post(`/api/posts/${id}/pin`),
  async toggleBookmark(id) {
    return fixPost(await post(`/api/posts/${id}/bookmark`))
  },
  hidePost: (id) => post(`/api/posts/${id}/hide`),
  reportPost: (id, reason) => post(`/api/posts/${id}/report`, { reason }),

  async listComments(postId) {
    return (await call({ method: 'get', url: `/api/posts/${postId}/comments` })).map(fixComment)
  },
  async addComment(postId, { text, parentId }) {
    return fixComment(await post(`/api/posts/${postId}/comments`, { text, parentId }))
  },
  deleteComment: (postId, commentId) => call({ method: 'delete', url: `/api/posts/${postId}/comments/${commentId}` }),
  async toggleCommentLike(postId, commentId) {
    return fixComment(await post(`/api/posts/${postId}/comments/${commentId}/like`))
  },

  async getProfile(username) {
    return fixProfile(await call({ method: 'get', url: `/api/users/${enc(username)}` }))
  },
  async updateProfile({ displayName, bio, avatar, cover, removeAvatar, removeCover }) {
    const form = new FormData()
    form.append('displayName', displayName)
    form.append('bio', bio)
    if (avatar) form.append('avatar', avatar)
    if (cover) form.append('cover', cover)
    if (removeAvatar) form.append('removeAvatar', 'true')
    if (removeCover) form.append('removeCover', 'true')
    return fixProfile(await call({ method: 'put', url: '/api/users/me', data: form }))
  },
  async toggleFollow(username) {
    return fixProfile(await post(`/api/users/${enc(username)}/follow`))
  },
  async toggleBlock(username) {
    return fixProfile(await post(`/api/users/${enc(username)}/block`))
  },
  async toggleMute(username) {
    return fixProfile(await post(`/api/users/${enc(username)}/mute`))
  },
  async suggestions({ limit = 5 } = {}) {
    return (await call({ method: 'get', url: '/api/users/suggestions', params: { limit } })).map(fixUser)
  },
  async searchUsers(q) {
    return (await call({ method: 'get', url: '/api/users/search', params: { q } })).map(fixUser)
  },
  async listConnections(username, kind, page = 1) {
    const data = await call({ method: 'get', url: `/api/users/${enc(username)}/${kind}`, params: { page, limit: 20 } })
    return { ...data, users: data.users.map(fixUser) }
  },
  async relations() {
    const data = await call({ method: 'get', url: '/api/relations' })
    return { blocked: data.blocked.map(fixUser), muted: data.muted.map(fixUser) }
  },
  getSettings: () => call({ method: 'get', url: '/api/settings' }),
  updateSettings: (patch) => call({ method: 'put', url: '/api/settings', data: patch }),
  async followRequests() {
    return (await call({ method: 'get', url: '/api/follow-requests' })).map(fixUser)
  },
  answerFollowRequest: (username, action) => post(`/api/follow-requests/${enc(username)}/${action}`),

  async search(q) {
    const data = await call({ method: 'get', url: '/api/search', params: { q } })
    return { ...data, users: data.users.map(fixUser), posts: data.posts.map(fixPost) }
  },
  trending: () => call({ method: 'get', url: '/api/trending' }),
  async notifications() {
    const data = await call({ method: 'get', url: '/api/notifications' })
    return { ...data, items: data.items.map((n) => ({ ...n, actor: fixUser(n.actor) })) }
  },
  markNotificationsRead: () => post('/api/notifications/read'),

  async conversations() {
    return (await call({ method: 'get', url: '/api/messages/conversations' })).map((c) => ({ ...c, with: fixUser(c.with) }))
  },
  async thread(username, { before } = {}) {
    const data = await call({ method: 'get', url: `/api/messages/with/${enc(username)}`, params: { before } })
    return { ...data, with: fixUser(data.with) }
  },
  sendMessage: (username, text) => post(`/api/messages/with/${enc(username)}`, { text }),
  markThreadRead: (username) => post(`/api/messages/with/${enc(username)}/read`),
  unreadMessages: async () => (await call({ method: 'get', url: '/api/messages/unread' })).count,

  modStats: () => call({ method: 'get', url: '/api/mod/stats' }),
  async modReports({ status = 'open', page = 1 } = {}) {
    const data = await call({ method: 'get', url: '/api/mod/reports', params: { status, page } })
    return { ...data, items: data.items.map((i) => ({ ...i, post: i.post && fixPost(i.post), reports: i.reports.map((r) => ({ ...r, reporter: fixUser(r.reporter) })) })) }
  },
  resolveReport: (postId, { action, note }) => post(`/api/mod/reports/${postId}/resolve`, { action, note }),
  async modPosts({ page = 1 } = {}) {
    const data = await call({ method: 'get', url: '/api/mod/posts', params: { page } })
    return { ...data, items: data.items.map(fixPost) }
  },
  setModState: (postId, { state, note }) => post(`/api/mod/posts/${postId}/state`, { state, note }),
  async modUsers({ q, role, status, page = 1 } = {}) {
    const data = await call({ method: 'get', url: '/api/mod/users', params: { q, role, status, page } })
    return { ...data, items: data.items.map(fixUser) }
  },
  setUserStatus: (id, body) => post(`/api/mod/users/${id}/status`, body),
  setUserRole: (id, role) => call({ method: 'put', url: `/api/mod/users/${id}/role`, data: { role } }),
  async auditLog({ page = 1 } = {}) {
    const data = await call({ method: 'get', url: '/api/mod/audit', params: { page } })
    return { ...data, items: data.items.map((a) => ({ ...a, actor: fixUser(a.actor) })) }
  },
  resetDemo: async () => {},
}

export default http
