// Shapes sent to the browser by the social routes. Media is returned as /uploads/<file> paths.
const { REACTION_TYPES, linkPreview, isStaff } = require('./rules');

const media = (f) => (f ? `/uploads/${f}` : null);
const isImage = (f) => /\.(jpe?g|png|webp)$/i.test(f || '');
const sid = (v) => String(v && v._id ? v._id : v);

function userBrief(u) {
    if (!u || !u.username) return { id: null, username: 'deleted', displayName: 'Deleted user', avatar: null, role: 'user' };
    return {
        id: String(u._id),
        username: u.username,
        displayName: u.displayName || u.username,
        avatar: media(u.avatar),
        role: u.role || 'user',
    };
}

function serializeComment(c, viewerId) {
    return {
        id: String(c._id),
        parentId: c.parent ? String(c.parent) : null,
        author: userBrief(c.author),
        text: c.text,
        createdAt: c.date,
        likes: (c.likes || []).length,
        likedByMe: !!viewerId && (c.likes || []).some((u) => String(u) === viewerId),
    };
}

function serializePoll(poll, viewerId, now = Date.now()) {
    if (!poll || !poll.options) return null;
    const total = poll.options.reduce((n, o) => n + (o.votes || []).length, 0);
    const mine = poll.options.find((o) => viewerId && (o.votes || []).some((v) => String(v) === viewerId));
    return {
        options: poll.options.map((o) => ({ id: String(o._id), text: o.text, votes: (o.votes || []).length })),
        total,
        endsAt: poll.endsAt,
        ended: !!poll.endsAt && new Date(poll.endsAt).getTime() <= now,
        myVote: mine ? String(mine._id) : null,
    };
}

/**
 * ctx (all optional): originals Map(id -> post with populated author) for reposts, repostCounts Map(id -> n),
 * myReposts Set(id), pinnedId, depth (internal).
 */
function serializePost(p, viewer, ctx = {}) {
    const viewerId = viewer ? String(viewer._id) : null;
    const id = String(p._id);
    const images = [...(p.images || [])];
    if (p.file && isImage(p.file)) images.unshift(p.file);
    const reactions = {};
    for (const t of REACTION_TYPES) reactions[t] = 0;
    for (const r of p.reactions || []) if (reactions[r.type] !== undefined) reactions[r.type] += 1;
    // posts from before reactions existed only have `likes`
    if (!(p.reactions || []).length && (p.likes || []).length) reactions.like = p.likes.length;
    const mine = (p.reactions || []).find((r) => viewerId && String(r.user) === viewerId);
    const likedByMe = !!viewerId && (p.likes || []).some((u) => String(u) === viewerId);
    let original = null;
    if (p.repostOf && !ctx.depth) {
        const o = ctx.originals && ctx.originals.get(sid(p.repostOf));
        original = o && o.modState !== 'removed' ? serializePost(o, viewer, { ...ctx, depth: 1 }) : { unavailable: true, id: sid(p.repostOf) };
    }
    const author = userBrief(p.author);
    const staffOrAuthor = viewer && (isStaff(viewer.role) || viewerId === author.id);
    return {
        id,
        author,
        title: p.title || '',
        text: p.content || '',
        images: images.map(media),
        attachment: p.file && !isImage(p.file) ? media(p.file) : null,
        hashtags: p.hashtags || [],
        createdAt: p.status === 'draft' ? p.createdAt : (p.visibleAt || p.createdAt),
        edited: !!p.editedAt,
        likes: (p.likes || []).length,
        likedByMe,
        myReaction: mine ? mine.type : (likedByMe ? 'like' : null),
        reactions,
        commentsCount: (p.comments || []).length,
        bookmarkedByMe: !!viewer && (viewer.bookmarks || []).some((b) => String(b) === id),
        poll: serializePoll(p.poll, viewerId),
        repostOf: original,
        isRepost: !!p.repostOf && !(p.content || '').trim(),
        reposts: (ctx.repostCounts && ctx.repostCounts.get(id)) || 0,
        repostedByMe: !!(ctx.myReposts && ctx.myReposts.has(id)),
        status: p.status || 'published',
        modState: p.modState || 'ok',
        modNote: staffOrAuthor ? p.modNote || '' : '',
        link: linkPreview(p.content),
        pinned: !!ctx.pinnedId && String(ctx.pinnedId) === id,
    };
}

function serializeProfile(u, stats, viewer) {
    const viewerId = viewer ? String(viewer._id) : null;
    const uid = String(u._id);
    const isMe = viewerId === uid;
    const isFollowing = !!viewer && (viewer.following || []).some((f) => String(f) === uid);
    const requested = !!viewer && (u.followRequests || []).some((f) => String(f) === viewerId);
    const blockedByThem = !!viewer && (u.blocked || []).some((b) => String(b) === viewerId);
    return {
        id: uid,
        username: u.username,
        displayName: u.displayName || u.username,
        bio: u.bio || '',
        avatar: media(u.avatar),
        cover: media(u.cover),
        role: u.role || 'user',
        joined: u.createdAt,
        followers: stats.followers,
        following: (u.following || []).length,
        posts: stats.posts,
        isMe,
        isFollowing,
        requested,
        isPrivate: !!u.isPrivate,
        // a private account's posts are only visible to the owner and approved followers
        locked: !!u.isPrivate && !isMe && !isFollowing && !(viewer && isStaff(viewer.role)),
        blockedByMe: !!viewer && (viewer.blocked || []).some((b) => String(b) === uid),
        blockedByThem,
        mutedByMe: !!viewer && (viewer.muted || []).some((b) => String(b) === uid),
        status: u.status || 'active',
        pinnedPostId: u.pinnedPost ? String(u.pinnedPost) : null,
    };
}

module.exports = { serializePost, serializeComment, serializeProfile, serializePoll, userBrief, media };
