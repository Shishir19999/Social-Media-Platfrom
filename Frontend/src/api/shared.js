// Pieces shared by the real HTTP client and the in-browser demo backend.

export const AUTH_KEY = 'social_auth'

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// Real mode remembers the sign-in on this device. The Live preview keeps it per tab (sessionStorage) while the
// data lives in localStorage, so two tabs can be signed in as two different people and chat with each other.
const authStore = () => (typeof __DEMO__ !== 'undefined' && __DEMO__ ? globalThis.sessionStorage : globalThis.localStorage)

export function loadAuth(storage = authStore()) {
  try {
    return JSON.parse(storage.getItem(AUTH_KEY)) || { token: null, user: null }
  } catch {
    return { token: null, user: null }
  }
}

export function saveAuth(data, storage = authStore()) {
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
 * Shapes: user brief {id, username, displayName, avatar, role}; post {id, author, title, text, images[], attachment,
 * hashtags[], createdAt, edited, likes, likedByMe, myReaction, reactions{type: n}, commentsCount, bookmarkedByMe,
 * poll {options[{id,text,votes}], total, endsAt, ended, myVote}, repostOf (embedded post), isRepost, reposts,
 * repostedByMe, status, modState, modNote, link {url, host, title}, pinned}; comment {id, parentId, author, text,
 * createdAt, likes, likedByMe}; profile adds bio, cover, joined, followers, following, posts, isMe, isFollowing,
 * requested, isPrivate, locked, blockedByMe, blockedByThem, mutedByMe, status; notification {id, type, actor,
 * postId, snippet, read, createdAt}; message {id, sender, text, createdAt}.
 */
export const API_METHODS = [
  'login', 'register', 'me', 'logout',
  'listPosts', 'getPost', 'createPost', 'updatePost', 'deletePost', 'myPosts', 'publishPost', 'postHistory',
  'toggleLike', 'react', 'votePoll', 'toggleRepost', 'pinPost', 'toggleBookmark', 'hidePost', 'reportPost',
  'listComments', 'addComment', 'deleteComment', 'toggleCommentLike',
  'getProfile', 'updateProfile', 'toggleFollow', 'toggleBlock', 'toggleMute', 'suggestions', 'searchUsers',
  'listConnections', 'relations', 'getSettings', 'updateSettings', 'followRequests', 'answerFollowRequest',
  'search', 'trending', 'notifications', 'markNotificationsRead',
  'conversations', 'thread', 'sendMessage', 'markThreadRead', 'unreadMessages',
  'modStats', 'modReports', 'resolveReport', 'modPosts', 'setModState', 'modUsers', 'setUserStatus', 'setUserRole', 'auditLog',
  'resetDemo',
]
