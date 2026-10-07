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
})
const fixComment = (c) => ({ ...c, author: fixUser(c.author) })
const fixProfile = (p) => ({ ...fixUser(p), cover: abs(p.cover) })

function postForm({ text, images = [] }) {
  const form = new FormData()
  form.append('content', text)
  images.forEach((file) => form.append('images', file))
  return form
}

const http = {
  async login(identifier, password) {
    const data = await call({ method: 'post', url: '/api/auth/login', data: { identifier, password } })
    return { ...data, user: fixUser(data.user) }
  },
  async register(username, email, password) {
    const data = await call({ method: 'post', url: '/api/auth/register', data: { username, email, password } })
    return { ...data, user: fixUser(data.user) }
  },
  async me() {
    const data = await call({ method: 'get', url: '/api/auth/me' })
    return { user: fixUser(data.user) }
  },
  logout: () => call({ method: 'post', url: '/api/auth/logout' }),

  async listPosts({ scope, tag, author, saved, page = 1, limit = 10 } = {}) {
    const data = await call({ method: 'get', url: '/api/feed', params: { scope, tag, author, saved: saved ? 1 : undefined, page, limit } })
    return { ...data, posts: data.posts.map(fixPost) }
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
  async toggleLike(id) {
    return fixPost(await call({ method: 'post', url: `/api/posts/${id}/like` }))
  },
  async toggleBookmark(id) {
    return fixPost(await call({ method: 'post', url: `/api/posts/${id}/bookmark` }))
  },
  hidePost: (id) => call({ method: 'post', url: `/api/posts/${id}/hide` }),
  reportPost: (id, reason) => call({ method: 'post', url: `/api/posts/${id}/report`, data: { reason } }),

  async listComments(postId) {
    return (await call({ method: 'get', url: `/api/posts/${postId}/comments` })).map(fixComment)
  },
  async addComment(postId, { text, parentId }) {
    return fixComment(await call({ method: 'post', url: `/api/posts/${postId}/comments`, data: { text, parentId } }))
  },
  deleteComment: (postId, commentId) => call({ method: 'delete', url: `/api/posts/${postId}/comments/${commentId}` }),
  async toggleCommentLike(postId, commentId) {
    return fixComment(await call({ method: 'post', url: `/api/posts/${postId}/comments/${commentId}/like` }))
  },

  async getProfile(username) {
    return fixProfile(await call({ method: 'get', url: `/api/users/${encodeURIComponent(username)}` }))
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
    return fixProfile(await call({ method: 'post', url: `/api/users/${encodeURIComponent(username)}/follow` }))
  },
  async suggestions() {
    return (await call({ method: 'get', url: '/api/users/suggestions' })).map(fixUser)
  },

  async search(q) {
    const data = await call({ method: 'get', url: '/api/search', params: { q } })
    return { ...data, users: data.users.map(fixUser), posts: data.posts.map(fixPost) }
  },
  trending: () => call({ method: 'get', url: '/api/trending' }),
  async notifications() {
    const data = await call({ method: 'get', url: '/api/notifications' })
    return { ...data, items: data.items.map((n) => ({ ...n, actor: fixUser(n.actor) })) }
  },
  markNotificationsRead: () => call({ method: 'post', url: '/api/notifications/read' }),
  resetDemo: async () => {},
}

export default http
