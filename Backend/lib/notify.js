const Notification = require('../models/Notification');
const User = require('../models/User');
const { extractMentions, snippet } = require('./text');
const { PREF_FOR_TYPE } = require('./rules');
const { emitToUser } = require('./realtime');

const DEDUPED = ['like', 'reaction', 'follow', 'request', 'repost'];

// Creates a notification for `userId` unless the actor is the recipient, the recipient blocked the actor
// or switched that kind of notification off. Likes, follows and reposts are de-duplicated while the
// earlier one is still unread.
async function notify(userId, actorId, type, post, text) {
    if (!userId || String(userId) === String(actorId)) return;
    const recipient = await User.findById(userId).select('notifPrefs blocked').lean();
    if (!recipient) return;
    if ((recipient.blocked || []).some((b) => String(b) === String(actorId))) return;
    const pref = PREF_FOR_TYPE[type];
    if (pref && recipient.notifPrefs && recipient.notifPrefs[pref] === false) return;
    const base = { user: userId, actor: actorId, type, ...(post ? { post: post._id || post } : {}) };
    if (DEDUPED.includes(type) && await Notification.exists({ ...base, read: false })) return;
    const created = await Notification.create({ ...base, snippet: snippet(text) });
    emitToUser(userId, 'notification:new', { id: String(created._id), type });
}

// Notifies existing users mentioned (@username) in `text`.
async function notifyMentions(text, actorId, post, skipIds = []) {
    const names = extractMentions(text);
    if (!names.length) return;
    const skip = new Set(skipIds.map(String));
    const users = await User.find({ username: { $in: names } }).select('_id');
    for (const u of users) {
        if (skip.has(String(u._id))) continue;
        await notify(u._id, actorId, 'mention', post, text);
    }
}

module.exports = { notify, notifyMentions };
