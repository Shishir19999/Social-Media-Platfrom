// Pieces shared by the real HTTP client and the in-browser demo backend.

export const AUTH_KEY = 'social_auth'

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function loadAuth(storage = globalThis.localStorage) {
  try {
    return JSON.parse(storage.getItem(AUTH_KEY)) || { token: null, user: null }
  } catch {
    return { token: null, user: null }
  }
}

export function saveAuth(data, storage = globalThis.localStorage) {
  try {
    if (data && data.token) storage.setItem(AUTH_KEY, JSON.stringify(data))
    else storage.removeItem(AUTH_KEY)
  } catch {
    /* storage unavailable (private mode): the session lasts until the tab closes */
  }
}

export function getToken() {
  return loadAuth().token
}

/**
 * The interface both back ends implement (src/api/http.js and src/api/demo/demoApi.js).
 * Shapes: user brief {id, username, displayName, avatar}; post {id, author, title, text, images[],
 * attachment, hashtags[], createdAt, edited, likes, likedByMe, commentsCount, bookmarkedByMe};
 * comment {id, parentId, author, text, createdAt, likes, likedByMe}; profile adds bio, cover, joined,
 * followers, following, posts, isMe, isFollowing; notification {id, type, actor, postId, snippet, read, createdAt}.
 */
export const API_METHODS = [
  'login', 'register', 'me', 'logout',
  'listPosts', 'getPost', 'createPost', 'updatePost', 'deletePost',
  'toggleLike', 'toggleBookmark', 'hidePost', 'reportPost',
  'listComments', 'addComment', 'deleteComment', 'toggleCommentLike',
  'getProfile', 'updateProfile', 'toggleFollow', 'suggestions',
  'search', 'trending', 'notifications', 'markNotificationsRead',
  'resetDemo',
]
