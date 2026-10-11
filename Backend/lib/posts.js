// Post loading, visibility and publishing helpers shared by the route modules.
const mongoose = require('mongoose');
const Post = require('../models/Post');
const User = require('../models/User');
const { serializePost } = require('./serialize');
const { isStaff } = require('./rules');
const { notify, notifyMentions } = require('./notify');

const AUTHOR_FIELDS = 'username displayName avatar role';
const AUTHOR_SELECT = `${AUTHOR_FIELDS} isPrivate blocked`;
const POPULATE = [
    { path: 'author', select: AUTHOR_SELECT },
    { path: 'comments.author', select: AUTHOR_FIELDS },
];
const VIEWER_FIELDS = 'following bookmarks hidden blocked muted role isPrivate pinnedPost followRequests';
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const has = (list, id) => (list || []).some((x) => String(x) === String(id));

// Authors whose posts this viewer must not see: private accounts they do not follow, people they blocked
// or who blocked them and, for feeds, muted accounts. The viewer's own posts are never excluded.
async function excludedAuthors(viewer, { feed = false } = {}) {
    const vid = viewer && viewer._id;
    const following = new Set((viewer ? viewer.following : []).map(String));
    const priv = await User.find({ isPrivate: true, ...(vid ? { _id: { $ne: vid } } : {}) }).select('_id').lean();
    const ids = priv.filter((u) => !following.has(String(u._id))).map((u) => u._id);
    if (viewer) {
        ids.push(...viewer.blocked);
        if (feed) ids.push(...viewer.muted);
        const blockers = await User.find({ blocked: vid }).select('_id').lean();
        ids.push(...blockers.map((b) => b._id));
    }
    return ids;
}

// Base filter for posts that appear in feeds and searches.
const liveFilter = (now = new Date()) => ({ status: { $ne: 'draft' }, visibleAt: { $lte: now }, modState: { $nin: ['hidden', 'removed'] } });

// Why a viewer cannot see this author's posts: 'blocked', 'private' or '' (visible).
function relation(viewer, author) {
    if (!author || !author._id) return '';
    const viewerId = viewer && String(viewer._id);
    if (viewerId === String(author._id)) return '';
    if (viewer && isStaff(viewer.role)) return '';
    if (viewerId && (has(author.blocked, viewerId) || has(viewer.blocked, author._id))) return 'blocked';
    if (author.isPrivate && !(viewer && has(viewer.following, author._id))) return 'private';
    return '';
}

// Turns post documents (lean, authors populated) into API objects, adding reposted originals and counts.
async function serializePosts(posts, viewer, { hiddenAuthors = [], pinnedId = null } = {}) {
    if (!posts.length) return [];
    const hidden = new Set(hiddenAuthors.map(String));
    const ids = posts.map((p) => p._id);
    const originalIds = [...new Set(posts.filter((p) => p.repostOf).map((p) => String(p.repostOf)))];
    const [originals, counts, mine] = await Promise.all([
        originalIds.length
            ? Post.find({ _id: { $in: originalIds }, ...liveFilter() }).populate(POPULATE).lean()
            : [],
        Post.aggregate([{ $match: { repostOf: { $in: ids }, status: { $ne: 'draft' } } }, { $group: { _id: '$repostOf', n: { $sum: 1 } } }]),
        viewer ? Post.find({ author: viewer._id, repostOf: { $in: ids }, content: '' }).select('repostOf').lean() : [],
    ]);
    const ctx = {
        originals: new Map(originals.filter((o) => !hidden.has(String(o.author._id))).map((o) => [String(o._id), o])),
        repostCounts: new Map(counts.map((c) => [String(c._id), c.n])),
        myReposts: new Set(mine.map((m) => String(m.repostOf))),
        pinnedId,
    };
    return posts.map((p) => serializePost(p, viewer, ctx));
}

async function serializeOne(post, viewer) {
    const plain = typeof post.toObject === 'function' ? post.toObject() : post;
    const [out] = await serializePosts([plain], viewer, { pinnedId: null });
    return out;
}

// Side effects once a post becomes visible: mention, quote and repost notifications.
async function onPublished(post) {
    const author = post.author._id || post.author;
    await notifyMentions(post.content, author, post);
    if (post.repostOf) {
        const original = await Post.findById(post.repostOf).select('author').lean();
        if (original) await notify(original.author, author, post.content ? 'quote' : 'repost', post, post.content);
    }
}

// Scheduled posts whose time has come become published (and notify). Run on a timer by the server.
async function publishDue(now = new Date()) {
    const due = await Post.find({ status: 'scheduled', visibleAt: { $lte: now } });
    for (const post of due) {
        post.status = 'published';
        await post.save();
        await onPublished(post);
    }
    return due.length;
}

module.exports = {
    AUTHOR_FIELDS, AUTHOR_SELECT, POPULATE, VIEWER_FIELDS, isValidId, has,
    excludedAuthors, liveFilter, relation, serializePosts, serializeOne, onPublished, publishDue,
};
