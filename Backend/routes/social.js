const express = require('express');
const mongoose = require('mongoose');
const Post = require('../models/Post');
const User = require('../models/User');
const Report = require('../models/Report');
const Notification = require('../models/Notification');
const { escapeRegex } = require('../lib/text');
const { notify, notifyMentions } = require('../lib/notify');
const { serializePost, serializeComment, serializeProfile, userBrief } = require('../lib/serialize');

const AUTHOR_FIELDS = 'username displayName avatar';
const POPULATE = [
    { path: 'author', select: AUTHOR_FIELDS },
    { path: 'comments.author', select: AUTHOR_FIELDS },
];
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

module.exports = function createSocialRoutes({ auth, optionalAuth, uploadProfileFiles, removeUpload, filesOf }) {
    const router = express.Router();

    // Loads the signed-in user's follow/bookmark/hidden lists into req.viewer (anonymous: undefined).
    const withViewer = async (req, res, next) => {
        if (req.user) {
            const v = await User.findById(req.user.id).select('following bookmarks hidden').lean();
            req.viewer = v;
        }
        next();
    };
    const optional = [optionalAuth, withViewer];
    const required = [auth, withViewer];

    const loadPost = async (req, res) => {
        if (!isValidId(req.params.id)) { res.status(404).json({ error: 'Post not found' }); return null; }
        const post = await Post.findById(req.params.id).populate(POPULATE);
        if (!post) { res.status(404).json({ error: 'Post not found' }); return null; }
        return post;
    };
    const sendPost = (res, post, viewer) => res.json(serializePost(post.toObject(), viewer));

    // ---- Feed ----
    router.get('/feed', optional, async (req, res) => {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
        const viewer = req.viewer;
        const { scope, tag, author, saved, q } = req.query;
        const query = {};
        const idRules = {};
        if (viewer && viewer.hidden.length) idRules.$nin = viewer.hidden;

        if (scope === 'following') {
            if (!viewer) return res.status(401).json({ error: 'Authentication required' });
            query.author = { $in: [...viewer.following, viewer._id] };
        }
        if (saved === '1' || saved === 'true') {
            if (!viewer) return res.status(401).json({ error: 'Authentication required' });
            idRules.$in = viewer.bookmarks;
        }
        if (typeof tag === 'string' && tag.trim()) query.hashtags = tag.replace(/^#/, '').toLowerCase();
        if (typeof author === 'string' && author) {
            const u = await User.findOne({ username: author }).select('_id');
            query.author = u ? u._id : null;
        }
        if (typeof q === 'string' && q.trim()) {
            const rx = new RegExp(escapeRegex(q.trim()), 'i');
            query.$or = [{ content: rx }, { title: rx }];
        }
        if (Object.keys(idRules).length) query._id = idRules;

        const [posts, total] = await Promise.all([
            Post.find(query).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate(POPULATE).lean(),
            Post.countDocuments(query),
        ]);
        res.json({
            posts: posts.map((p) => serializePost(p, viewer)),
            page, limit, total, pages: Math.max(Math.ceil(total / limit), 1),
        });
    });

    router.get('/posts/:id', optional, async (req, res) => {
        const post = await loadPost(req, res);
        if (post) sendPost(res, post, req.viewer && { ...req.viewer });
    });

    // ---- Post actions ----
    router.post('/posts/:id/like', required, async (req, res) => {
        const post = await loadPost(req, res);
        if (!post) return;
        const idx = post.likes.findIndex((u) => u.toString() === req.user.id);
        if (idx === -1) post.likes.push(req.user.id);
        else post.likes.splice(idx, 1);
        await post.save();
        if (idx === -1) await notify(post.author._id, req.user.id, 'like', post, post.content);
        sendPost(res, post, req.viewer);
    });

    router.post('/posts/:id/bookmark', required, async (req, res) => {
        const post = await loadPost(req, res);
        if (!post) return;
        const has = req.viewer.bookmarks.some((b) => b.toString() === post.id);
        await User.updateOne({ _id: req.user.id }, has ? { $pull: { bookmarks: post._id } } : { $addToSet: { bookmarks: post._id } });
        const bookmarks = has ? req.viewer.bookmarks.filter((b) => b.toString() !== post.id) : [...req.viewer.bookmarks, post._id];
        sendPost(res, post, { ...req.viewer, bookmarks });
    });

    router.post('/posts/:id/hide', required, async (req, res) => {
        const post = await loadPost(req, res);
        if (!post) return;
        await User.updateOne({ _id: req.user.id }, { $addToSet: { hidden: post._id } });
        res.json({ message: 'Post hidden' });
    });

    router.post('/posts/:id/report', required, async (req, res) => {
        const post = await loadPost(req, res);
        if (!post) return;
        if (post.author._id.toString() === req.user.id) return res.status(400).json({ error: 'You cannot report your own post' });
        const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 200) : '';
        await Report.updateOne({ post: post._id, reporter: req.user.id }, { $set: { reason } }, { upsert: true });
        await User.updateOne({ _id: req.user.id }, { $addToSet: { hidden: post._id } });
        res.json({ message: 'Report received' });
    });

    // ---- Comment threads ----
    router.get('/posts/:id/comments', optional, async (req, res) => {
        const post = await loadPost(req, res);
        if (!post) return;
        res.json(post.comments.map((c) => serializeComment(c.toObject(), req.user && req.user.id)));
    });

    router.post('/posts/:id/comments', required, async (req, res) => {
        const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
        if (!text) return res.status(400).json({ error: 'Comment text is required' });
        if (text.length > 500) return res.status(400).json({ error: 'Comments are limited to 500 characters' });
        const post = await loadPost(req, res);
        if (!post) return;
        let parent;
        const parentId = req.body?.parentId;
        if (parentId) {
            parent = isValidId(parentId) && post.comments.id(parentId);
            if (!parent) return res.status(404).json({ error: 'Parent comment not found' });
        }
        post.comments.push({ text, author: req.user.id, parent: parent ? parent._id : undefined });
        await post.save();
        const created = post.comments[post.comments.length - 1];
        await post.populate('comments.author', AUTHOR_FIELDS);
        const notified = [req.user.id];
        if (parent) {
            const parentAuthor = String(parent.author._id || parent.author);
            await notify(parentAuthor, req.user.id, 'reply', post, text);
            notified.push(parentAuthor);
        }
        if (!notified.includes(post.author._id.toString())) await notify(post.author._id, req.user.id, 'comment', post, text);
        await notifyMentions(text, req.user.id, post, notified);
        res.status(201).json(serializeComment(created.toObject(), req.user.id));
    });

    router.delete('/posts/:id/comments/:cid', required, async (req, res) => {
        const post = await loadPost(req, res);
        if (!post) return;
        const comment = isValidId(req.params.cid) && post.comments.id(req.params.cid);
        if (!comment) return res.status(404).json({ error: 'Comment not found' });
        const authorId = String(comment.author._id || comment.author);
        if (authorId !== req.user.id && post.author._id.toString() !== req.user.id) {
            return res.status(403).json({ error: 'You can only delete your own comments' });
        }
        // Remove the comment and every reply below it.
        const doomed = new Set([comment.id]);
        let grew = true;
        while (grew) {
            grew = false;
            for (const c of post.comments) {
                if (c.parent && doomed.has(c.parent.toString()) && !doomed.has(c.id)) { doomed.add(c.id); grew = true; }
            }
        }
        post.comments = post.comments.filter((c) => !doomed.has(c.id));
        await post.save();
        res.json({ message: 'Comment deleted', removed: [...doomed] });
    });

    router.post('/posts/:id/comments/:cid/like', required, async (req, res) => {
        const post = await loadPost(req, res);
        if (!post) return;
        const comment = isValidId(req.params.cid) && post.comments.id(req.params.cid);
        if (!comment) return res.status(404).json({ error: 'Comment not found' });
        const idx = comment.likes.findIndex((u) => u.toString() === req.user.id);
        if (idx === -1) comment.likes.push(req.user.id);
        else comment.likes.splice(idx, 1);
        await post.save();
        res.json(serializeComment(comment.toObject(), req.user.id));
    });

    // ---- Users ----
    const profileStats = async (u) => ({
        followers: await User.countDocuments({ following: u._id }),
        posts: await Post.countDocuments({ author: u._id }),
    });
    const viewerOf = (id) => User.findById(id).select('following bookmarks hidden').lean();

    router.get('/users/suggestions', optional, async (req, res) => {
        const exclude = req.viewer ? [req.user.id, ...req.viewer.following] : [];
        const users = await User.find({ _id: { $nin: exclude } }).sort({ createdAt: 1, _id: 1 }).limit(5).select(`${AUTHOR_FIELDS} bio`);
        res.json(users.map((u) => ({ ...userBrief(u), bio: u.bio || '' })));
    });

    router.put('/users/me', required, uploadProfileFiles, async (req, res) => {
        const files = filesOf(req);
        const fail = (status, error) => { files.forEach((f) => removeUpload(f.filename)); return res.status(status).json({ error }); };
        const user = await User.findById(req.user.id);
        if (!user) return fail(401, 'User no longer exists');
        const { displayName, bio, removeAvatar, removeCover } = req.body || {};
        if (displayName !== undefined) {
            if (typeof displayName !== 'string' || displayName.trim().length > 50) return fail(400, 'Display name must be at most 50 characters');
            user.displayName = displayName.trim();
        }
        if (bio !== undefined) {
            if (typeof bio !== 'string' || bio.trim().length > 280) return fail(400, 'Bio must be at most 280 characters');
            user.bio = bio.trim();
        }
        const old = [];
        const avatar = req.files && req.files.avatar && req.files.avatar[0];
        const cover = req.files && req.files.cover && req.files.cover[0];
        if (avatar || removeAvatar === 'true') { old.push(user.avatar); user.avatar = avatar ? avatar.filename : undefined; }
        if (cover || removeCover === 'true') { old.push(user.cover); user.cover = cover ? cover.filename : undefined; }
        await user.save();
        old.forEach(removeUpload);
        res.json(serializeProfile(user.toObject(), await profileStats(user), await viewerOf(user._id)));
    });

    router.get('/users/:username', optional, async (req, res) => {
        const user = await User.findOne({ username: req.params.username }).lean();
        if (!user) return res.status(404).json({ error: 'User not found' });
        const viewer = req.viewer ? { ...req.viewer, _id: req.user.id } : undefined;
        res.json(serializeProfile(user, await profileStats(user), viewer));
    });

    router.post('/users/:username/follow', required, async (req, res) => {
        const target = await User.findOne({ username: req.params.username }).lean();
        if (!target) return res.status(404).json({ error: 'User not found' });
        if (String(target._id) === req.user.id) return res.status(400).json({ error: 'You cannot follow yourself' });
        const following = req.viewer.following.some((f) => f.toString() === String(target._id));
        await User.updateOne({ _id: req.user.id }, following ? { $pull: { following: target._id } } : { $addToSet: { following: target._id } });
        if (!following) await notify(target._id, req.user.id, 'follow');
        res.json(serializeProfile(target, await profileStats(target), await viewerOf(req.user.id)));
    });

    // ---- Search and trending ----
    const tagAggregate = (postMatch, tagMatch, limit) => Post.aggregate([
        { $match: postMatch },
        { $unwind: '$hashtags' },
        ...(tagMatch ? [{ $match: { hashtags: tagMatch } }] : []),
        { $group: { _id: '$hashtags', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: limit },
    ]).then((rows) => rows.map((r) => ({ tag: r._id, count: r.count })));

    router.get('/trending', async (req, res) => {
        const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
        let tags = await tagAggregate({ createdAt: { $gte: since } }, null, 8);
        if (!tags.length) tags = await tagAggregate({}, null, 8);
        res.json(tags);
    });

    router.get('/search', optional, async (req, res) => {
        const q = typeof req.query.q === 'string' ? req.query.q.trim().replace(/^[#@]/, '') : '';
        if (!q) return res.json({ users: [], posts: [], tags: [] });
        const rx = new RegExp(escapeRegex(q), 'i');
        const hidden = req.viewer ? req.viewer.hidden : [];
        const [users, posts, tags] = await Promise.all([
            User.find({ $or: [{ username: rx }, { displayName: rx }] }).sort({ username: 1 }).limit(8).select(`${AUTHOR_FIELDS} bio`),
            Post.find({ $or: [{ content: rx }, { title: rx }], _id: { $nin: hidden } }).sort({ createdAt: -1 }).limit(20).populate(POPULATE).lean(),
            tagAggregate({}, new RegExp(`^${escapeRegex(q.toLowerCase())}`), 8),
        ]);
        res.json({
            users: users.map((u) => ({ ...userBrief(u), bio: u.bio || '' })),
            posts: posts.map((p) => serializePost(p, req.viewer)),
            tags,
        });
    });

    // ---- Notifications ----
    router.get('/notifications', auth, async (req, res) => {
        const [items, unread] = await Promise.all([
            Notification.find({ user: req.user.id }).sort({ createdAt: -1, _id: -1 }).limit(50).populate('actor', AUTHOR_FIELDS).lean(),
            Notification.countDocuments({ user: req.user.id, read: false }),
        ]);
        res.json({
            unread,
            items: items.map((n) => ({
                id: String(n._id), type: n.type, actor: userBrief(n.actor), postId: n.post ? String(n.post) : null,
                snippet: n.snippet || '', read: n.read, createdAt: n.createdAt,
            })),
        });
    });

    router.post('/notifications/read', auth, async (req, res) => {
        await Notification.updateMany({ user: req.user.id, read: false }, { $set: { read: true } });
        res.json({ message: 'Notifications marked as read' });
    });

    return router;
};
