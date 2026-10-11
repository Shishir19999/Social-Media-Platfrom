// Rules shared by the API (Backend/lib/rules.js) and the browser-only Live preview
// (Frontend/src/lib/rules.js). The two files are identical except for the last statement;
// a test compares them, so edit this one and run `npm run sync-rules` in Backend.
const LIMITS = {
  post: 500,
  comment: 500,
  bio: 280,
  displayName: 50,
  usernameMin: 3,
  usernameMax: 30,
  passwordMin: 6,
  message: 1000,
  images: 6,
  imageBytes: 10 * 1024 * 1024,
  pollOptionsMin: 2,
  pollOptionsMax: 4,
  pollOption: 40,
  reportReason: 200,
  modNote: 300,
  scheduleMaxDays: 90,
};

const REACTIONS = [
  { type: 'like', label: 'Like', emoji: '❤️' },
  { type: 'laugh', label: 'Haha', emoji: '😂' },
  { type: 'wow', label: 'Wow', emoji: '😮' },
  { type: 'sad', label: 'Sad', emoji: '😢' },
  { type: 'celebrate', label: 'Applause', emoji: '👏' },
];
const REACTION_TYPES = REACTIONS.map((r) => r.type);

const ROLES = ['user', 'moderator', 'admin'];
const REPORT_REASONS = ['Spam or scam', 'Harassment or hate', 'Misleading information', 'Something else'];
const POLL_DURATIONS = { '1h': 60, '1d': 1440, '3d': 4320, '7d': 10080 };
const SUSPEND_DAYS = [1, 7, 30];

const NOTIFICATION_TYPES = ['like', 'reaction', 'comment', 'reply', 'mention', 'follow', 'request', 'accepted', 'repost', 'quote', 'moderation'];
const NOTIFICATION_PREFS = ['like', 'comment', 'mention', 'follow', 'repost'];
const DEFAULT_NOTIFICATION_PREFS = { like: true, comment: true, mention: true, follow: true, repost: true };
// which preference switches which notification type (moderation notices cannot be switched off)
const PREF_FOR_TYPE = { like: 'like', reaction: 'like', comment: 'comment', reply: 'comment', mention: 'mention', follow: 'follow', request: 'follow', accepted: 'follow', repost: 'repost', quote: 'repost' };

const TAG_RE = /(?:^|[^\p{L}\p{N}_&])#([\p{L}\p{N}_]{2,40})/gu;
const MENTION_RE = /(?:^|[^\p{L}\p{N}_])@([A-Za-z0-9_]{3,30})/g;
const URL_RE = /https?:\/\/[^\s<]+[^\s<.,;:!?)"']/;

function unique(list) {
  return [...new Set(list)];
}

function extractHashtags(text) {
  if (typeof text !== 'string') return [];
  return unique([...text.matchAll(TAG_RE)].map((m) => m[1].toLowerCase())).slice(0, 20);
}

function extractMentions(text) {
  if (typeof text !== 'string') return [];
  return unique([...text.matchAll(MENTION_RE)].map((m) => m[1])).slice(0, 20);
}

function validateUsername(v) {
  const s = String(v || '').trim();
  if (!s) return 'Choose a username.';
  if (s.length < LIMITS.usernameMin) return `Username must be at least ${LIMITS.usernameMin} characters.`;
  if (s.length > LIMITS.usernameMax) return `Username must be at most ${LIMITS.usernameMax} characters.`;
  if (!/^[A-Za-z0-9_]+$/.test(s)) return 'Use letters, numbers and underscores only.';
  return '';
}

function validateEmail(v) {
  const s = String(v || '').trim();
  if (!s) return 'Enter your email address.';
  if (!/^\S+@\S+\.\S+$/.test(s)) return 'Enter a valid email address.';
  return '';
}

function validatePassword(v) {
  if (!v) return 'Enter a password.';
  if (String(v).length < LIMITS.passwordMin) return `Password must be at least ${LIMITS.passwordMin} characters.`;
  return '';
}

function validateProfile({ displayName, bio } = {}) {
  if (displayName !== undefined && String(displayName).trim().length > LIMITS.displayName) return `Display name must be at most ${LIMITS.displayName} characters.`;
  if (bio !== undefined && String(bio).trim().length > LIMITS.bio) return `Bio must be at most ${LIMITS.bio} characters.`;
  return '';
}

/** Poll input: {options: string[], duration: '1h'|'1d'|'3d'|'7d'} */
function validatePoll(poll) {
  if (!poll) return '';
  const options = Array.isArray(poll.options) ? poll.options.map((o) => String(o).trim()).filter(Boolean) : [];
  if (options.length < LIMITS.pollOptionsMin) return `A poll needs at least ${LIMITS.pollOptionsMin} options.`;
  if (options.length > LIMITS.pollOptionsMax) return `A poll can have at most ${LIMITS.pollOptionsMax} options.`;
  if (options.some((o) => o.length > LIMITS.pollOption)) return `Poll options are limited to ${LIMITS.pollOption} characters.`;
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return 'Poll options must be different.';
  if (!POLL_DURATIONS[poll.duration]) return 'Choose how long the poll runs.';
  return '';
}

/**
 * Post input: {text, poll, images (count), scheduleAt (ms), status}.
 * A post needs text, a poll or images; a poll and images cannot be combined.
 */
function validatePost({ text, poll, images = 0, scheduleAt, status = 'published' } = {}, now = Date.now()) {
  const body = String(text || '').trim();
  if (body.length > LIMITS.post) return `Posts are limited to ${LIMITS.post} characters.`;
  if (!body && !poll && !images) return 'Write something before posting.';
  if (images > LIMITS.images) return `You can attach up to ${LIMITS.images} images.`;
  if (poll && images) return 'A post can have a poll or images, not both.';
  const pollError = validatePoll(poll);
  if (pollError) return pollError;
  if (status === 'scheduled') {
    if (!scheduleAt || Number.isNaN(Number(scheduleAt))) return 'Pick a date and time to schedule the post.';
    if (Number(scheduleAt) < now + 60 * 1000) return 'Schedule the post at least a minute from now.';
    if (Number(scheduleAt) > now + LIMITS.scheduleMaxDays * 86400000) return `Posts can be scheduled up to ${LIMITS.scheduleMaxDays} days ahead.`;
  }
  return '';
}

function validateComment(text) {
  const body = String(text || '').trim();
  if (!body) return 'Write a comment first.';
  if (body.length > LIMITS.comment) return `Comments are limited to ${LIMITS.comment} characters.`;
  return '';
}

function validateMessage(text) {
  const body = String(text || '').trim();
  if (!body) return 'Write a message first.';
  if (body.length > LIMITS.message) return `Messages are limited to ${LIMITS.message} characters.`;
  return '';
}

const rank = (role) => Math.max(ROLES.indexOf(role), 0);
const isStaff = (role) => rank(role) >= 1;

/** Moderators act on regular users; admins act on moderators and users. Nobody acts on themselves or an equal or higher role. */
function canActOnUser(actor, target) {
  if (!actor || !target || String(actor.id) === String(target.id)) return false;
  if (!isStaff(actor.role)) return false;
  return rank(actor.role) > rank(target.role);
}

/** Only admins change roles, never their own (the caller also protects the last admin). */
function canChangeRole(actor, target, newRole) {
  if (!actor || !target || actor.role !== 'admin') return false;
  if (String(actor.id) === String(target.id)) return false;
  return ROLES.includes(newRole);
}

/** Small link card derived from the first URL in a text (no network request is made). */
function linkPreview(text) {
  const m = typeof text === 'string' ? text.match(URL_RE) : null;
  if (!m) return null;
  let u;
  try { u = new URL(m[0]); } catch { return null; }
  const host = u.hostname.replace(/^www\./, '');
  let last = u.pathname.split('/').filter(Boolean).pop() || '';
  try { last = decodeURIComponent(last); } catch { /* keep the raw segment */ }
  last = last.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[-_+]+/g, ' ').trim();
  const title = last ? last.charAt(0).toUpperCase() + last.slice(1) : host;
  return { url: u.href, host, title: title.slice(0, 80) };
}

const clip = (text, n = 80) => {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export {
  LIMITS, REACTIONS, REACTION_TYPES, ROLES, REPORT_REASONS, POLL_DURATIONS, SUSPEND_DAYS, NOTIFICATION_TYPES, NOTIFICATION_PREFS, DEFAULT_NOTIFICATION_PREFS, PREF_FOR_TYPE, extractHashtags, extractMentions, validateUsername, validateEmail, validatePassword, validateProfile, validatePoll, validatePost, validateComment, validateMessage, isStaff, canActOnUser, canChangeRole, linkPreview, clip,
};
