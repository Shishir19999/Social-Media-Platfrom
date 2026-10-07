// Shapes sent to the browser by the social routes. Media is returned as /uploads/<file> paths.
const media = (f) => (f ? `/uploads/${f}` : null);
const isImage = (f) => /\.(jpe?g|png|webp)$/i.test(f || '');

function userBrief(u) {
    if (!u || !u.username) return { id: null, username: 'deleted', displayName: 'Deleted user', avatar: null };
    return {
        id: String(u._id),
        username: u.username,
        displayName: u.displayName || u.username,
        avatar: media(u.avatar),
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

function serializePost(p, viewer) {
    const viewerId = viewer ? String(viewer._id) : null;
    const images = [...(p.images || [])];
    if (p.file && isImage(p.file)) images.unshift(p.file);
    return {
        id: String(p._id),
        author: userBrief(p.author),
        title: p.title || '',
        text: p.content,
        images: images.map(media),
        attachment: p.file && !isImage(p.file) ? media(p.file) : null,
        hashtags: p.hashtags || [],
        createdAt: p.createdAt,
        edited: !!p.editedAt,
        likes: (p.likes || []).length,
        likedByMe: !!viewerId && (p.likes || []).some((u) => String(u) === viewerId),
        commentsCount: (p.comments || []).length,
        bookmarkedByMe: !!viewer && (viewer.bookmarks || []).some((b) => String(b) === String(p._id)),
    };
}

function serializeProfile(u, stats, viewer) {
    const viewerId = viewer ? String(viewer._id) : null;
    return {
        id: String(u._id),
        username: u.username,
        displayName: u.displayName || u.username,
        bio: u.bio || '',
        avatar: media(u.avatar),
        cover: media(u.cover),
        joined: u.createdAt,
        followers: stats.followers,
        following: (u.following || []).length,
        posts: stats.posts,
        isMe: viewerId === String(u._id),
        isFollowing: !!viewer && (viewer.following || []).some((f) => String(f) === String(u._id)),
    };
}

module.exports = { serializePost, serializeComment, serializeProfile, userBrief, media };
