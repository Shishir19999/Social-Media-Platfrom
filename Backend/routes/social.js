const express = require('express');
const Post = require('../models/Post');
const User = require('../models/User');
const Report = require('../models/Report');
const Notification = require('../models/Notification');
const { escapeRegex } = require('../lib/text');
const { notify, notifyMentions } = require('../lib/notify');
const { serializePost, serializeComment, serializeProfile, userBrief } = require('../lib/serialize');
const {
    LIMITS, REACTION_TYPES, NOTIFICATION_PREFS, DEFAULT_NOTIFICATION_PREFS,
    validateComment, validateProfile, validatePost, isStaff,
} = require('../lib/rules');
const {
    AUTHOR_FIELDS, POPULATE, VIEWER_FIELDS, isValidId, has,
    excludedAuthors, liveFilter, relation, serializePosts, serializeOne, onPublished,
} = require('../lib/posts');

const pageParams = (req, max = 50, def = 10) => ({
    page: Math.max(parseInt(req.query.page, 10) || 1, 1),
    limit: Math.min(Math.max(parseInt(req.query.limit, 10) || def, 1), max),
});

module.exports = function createSocialRoutes({ auth, optionalAuth, uploadProfileFiles, removeUpload, filesOf }) {
    const router = express.Router();

    // Loads the signed-in user's lists into req.viewer (anonymous: undefined).
    const withViewer = async (req, res, next) => {
        if (req.user) req.viewer = await User.findById(req.user.id).select(VIEWER_FIELDS).lean();
        next();
    };
    const optional = [optionalAuth, withViewer];
    const required = [auth, withViewer];

    const fail = (res, status, error, extra = {}) => res.status(status).json({ error, ...extra });

    // Loads a post the viewer is allowed to see (or sends the matching error and returns null).
    const loadPost = async (req, res, { allowOwnUnlisted = true } = {}) => {
        if (!isValidId(req.params.id)) { fail(res, 404, 'Post not found'); return null; }
        const post = await Post.findById(req.params.id).populate(POPULATE);
        if (!post) { fail(res, 404, 'Post not found'); return null; }
        const viewer = req.viewer;
        const mineOrStaff = viewer && (String(viewer._id) === String(post.author._id) || isStaff(viewer.role));
        const unlisted = post.status === 'draft' || (post.visibleAt && post.visibleAt > new Date());
        if (unlisted && !(allowOwnUnlisted && viewer && String(viewer._id) === String(post.author._id))) { fail(res, 404, 'Post not found'); return null; }
        if (post.modState !== 'ok' && !mineOrStaff) { fail(res, 404, 'Post not found'); return null; }
        const why = relation(viewer, post.author);
        if (why === 'blocked') { fail(res, 404, 'Post not found'); return null; }
        if (why === 'private') { fail(res, 403, `@${post.author.username} has a private account. Follow them to see their posts.`, { locked: true }); return null; }
        return post;
    };
    const sendPost = async (res, post, viewer) => res.json(await serializeOne(post, viewer));

    // ---- Feed ----
    router.get('/feed', optional, async (req, res) => {
        const { page, limit } = pageParams(req);
        const viewer = req.viewer;
        const { scope, tag, author, saved, q, media } = req.query;
        const hiddenAuthors = await excludedAuthors(viewer, { feed: scope === 'following' || scope === 'explore' });
        const and = [liveFilter()];
        const idRules = {};
        if (viewer && viewer.hidden.length) idRules.$nin = viewer.hidden;
        let pinned = null;

        if (scope === 'following') {
            if (!viewer) return fail(res, 401, 'Authentication required');
            and.push({ author: { $in: [...viewer.following, viewer._id] } });
        }
        if (saved === '1' || saved === 'true') {
            if (!viewer) return fail(res, 401, 'Authentication required');
            idRules.$in = viewer.bookmarks;
        }
        if (typeof tag === 'string' && tag.trim()) and.push({ hashtags: tag.replace(/^#/, '').toLowerCase() });
        if (media === '1') and.push({ $or: [{ 'images.0': { $exists: true } }, { file: /\.(jpe?g|png|webp)$/i }] });
        if (typeof author === 'string' && author) {
            const u = await User.findOne({ username: author }).select('isPrivate blocked pinnedPost').lean();
            if (!u) { and.push({ author: null }); } else {
                const why = relation(viewer, u);
                if (why) return res.json({ posts: [], page, limit, total: 0, pages: 1, locked: why === 'private' });
                and.push({ author: u._id });
                if (u.pinnedPost && !tag && media !== '1') pinned = u.pinnedPost;
            }
        } else if (hiddenAuthors.length) and.push({ author: { $nin: hiddenAuthors } });
        if (typeof q === 'string' && q.trim()) {
            const rx = new RegExp(escapeRegex(q.trim()), 'i');
            and.push({ $or: [{ content: rx }, { title: rx }] });
        }
        if (pinned) idRules.$nin = [...(idRules.$nin || []), pinned];
        if (Object.keys(idRules).length) and.push({ _id: idRules });
        const query = { $and: and };

        const [posts, total] = await Promise.all([
            Post.find(query).sort({ visibleAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate(POPULATE).lean(),
            Post.countDocuments(query),
        ]);
        let pinnedDoc = null;
        if (pinned && page === 1) {
            pinnedDoc = await Post.findOne({ _id: pinned, $and: [liveFilter()] }).populate(POPULATE).lean();
        }
        const list = pinnedDoc ? [pinnedDoc, ...posts] : posts;
        res.json({
            posts: await serializePosts(list, viewer, { hiddenAuthors, pinnedId: pinnedDoc && pinnedDoc._id }),
            page, limit, total: total + (pinnedDoc ? 1 : 0), pages: Math.max(Math.ceil(total / limit), 1),
        });
    });

    // The viewer's own drafts and scheduled posts
    router.get('/posts/mine', required, async (req, res) => {
        const status = req.query.status === 'scheduled' ? 'scheduled' : 'draft';
        const posts = await Post.find({ author: req.user.id, status }).sort({ visibleAt: 1, updatedAt: -1 }).limit(50).populate(POPULATE).lean();
        res.json({ posts: await serializePosts(posts, req.viewer) });
    });

    router.get('/posts/:id', optional, async (req, res) => {
        const post = await loadPost(req, res);
        if (post) await sendPost(res, post, req.viewer);
    });

    router.get('/posts/:id/history', optional, async (req, res) => {
        const post = await loadPost(req, res);
        if (!post) return;
        const versions = [{ text: post.content, at: post.editedAt || post.createdAt, current: true }];
        for (const h of [...post.editHistory].reverse()) versions.push({ text: h.text, at: h.at, current: false });
        res.json(versions);
    });

    // ---- Post actions ----
    const setReaction = async (req, res, requested) => {
        const post = await loadPost(req, res, { allowOwnUnlisted: false });
        if (!post) return;
        const uid = req.user.id;
        const entry = post.reactions.find((r) => String(r.user) === uid);
        const existing = entry ? entry.type : (has(post.likes, uid) ? 'like' : null);
        const next = requested === existing ? null : requested;
        post.reactions = post.reactions.filter((r) => String(r.user) !== uid);
        post.likes = post.likes.filter((u) => String(u) !== uid);
        if (next) { post.reactions.push({ user: uid, type: next }); post.likes.push(uid); }
        await post.save();
        if (next && !existing) await notify(post.author._id, uid, next === 'like' ? 'like' : 'reaction', post, post.content);
        await sendPost(res, post, req.viewer);
    };
    router.post('/posts/:id/like', required, (req, res) => setReaction(req, res, 'like'));
    router.post('/posts/:id/react', required, (req, res) => {
        const type = req.body && req.body.type;
        if (!REACTION_TYPES.includes(type)) return fail(res, 400, 'Unknown reaction');
        return setReaction(req, res, type);
    });

    router.post('/posts/:id/vote', required, async (req, res) => {
        const post = await loadPost(req, res, { allowOwnUnlisted: false });
        if (!post) return;
        if (!post.poll) return fail(res, 400, 'This post has no poll');
        if (post.poll.endsAt && post.poll.endsAt <= new Date()) return fail(res, 400, 'This poll has ended');
        const option = isValidId(req.body && req.body.optionId) && post.poll.options.id(req.body.optionId);
        if (!option) return fail(res, 400, 'Choose one of the options');
        if (post.poll.options.some((o) => has(o.votes, req.user.id))) return fail(res, 409, 'You already voted in this poll');
        option.votes.push(req.user.id);
        await post.save();
        await sendPost(res, post, req.viewer);
    });

    router.post('/posts/:id/bookmark', required, async (req, res) => {
        const post = await loadPost(req, res, { allowOwnUnlisted: false });
        if (!post) return;
        const had = has(req.viewer.bookmarks, post.id);
        await User.updateOne({ _id: req.user.id }, had ? { $pull: { bookmarks: post._id } } : { $addToSet: { bookmarks: post._id } });
        const bookmarks = had ? req.viewer.bookmarks.filter((b) => String(b) !== post.id) : [...req.viewer.bookmarks, post._id];
        await sendPost(res, post, { ...req.viewer, bookmarks });
    });

    // Plain repost toggle; the response is the (updated) original post.
    router.post('/posts/:id/repost', required, async (req, res) => {
        const post = await loadPost(req, res, { allowOwnUnlisted: false });
        if (!post) return;
        const target = post.repostOf && !post.content ? post.repostOf : post._id;
        const existing = await Post.findOne({ author: req.user.id, repostOf: target, content: '' });
        if (existing) await existing.deleteOne();
        else {
            const created = await Post.create({ author: req.user.id, repostOf: target, content: '' });
            await onPublished(created);
        }
        const original = target.equals(post._id) ? post : await Post.findById(target).populate(POPULATE);
        await sendPost(res, original, req.viewer);
    });

    router.post('/posts/:id/pin', required, async (req, res) => {
        const post = await loadPost(req, res, { allowOwnUnlisted: false });
        if (!post) return;
        if (String(post.author._id) !== req.user.id) return fail(res, 403, 'You can only pin your own posts');
        const pinned = String(req.viewer.pinnedPost || '') === post.id;
        await User.updateOne({ _id: req.user.id }, pinned ? { $unset: { pinnedPost: 1 } } : { $set: { pinnedPost: post._id } });
        res.json({ pinned: !pinned });
    });

    // Publish a draft now, or schedule a draft / scheduled post for later (scheduleAt: ISO date or ms).
    router.post('/posts/:id/publish', required, async (req, res) => {
        const post = await loadPost(req, res);
        if (!post) return;
        if (String(post.author._id) !== req.user.id) return fail(res, 403, 'You can only publish your own posts');
        if (post.status === 'published') return fail(res, 400, 'This post is already published');
        const at = req.body && req.body.scheduleAt ? new Date(req.body.scheduleAt).getTime() : null;
        const status = at ? 'scheduled' : 'published';
        const err = validatePost({ text: post.content, poll: post.poll ? { options: post.poll.options.map((o) => o.text), duration: '1d' } : undefined, images: (post.images || []).length, scheduleAt: at, status });
        if (err) return fail(res, 400, err);
        post.status = status;
        post.visibleAt = at ? new Date(at) : new Date();
        await post.save();
        if (status === 'published') await onPublished(post);
        await sendPost(res, post, req.viewer);
    });

    router.post('/posts/:id/hide', required, async (req, res) => {
        const post = await loadPost(req, res, { allowOwnUnlisted: false });
        if (!post) return;
        await User.updateOne({ _id: req.user.id }, { $addToSet: { hidden: post._id } });
        res.json({ message: 'Post hidden' });
    });

    router.post('/posts/:id/report', required, async (req, res) => {
        const post = await loadPost(req, res, { allowOwnUnlisted: false });
        if (!post) return;
        if (post.author._id.toString() === req.user.id) return fail(res, 400, 'You cannot report your own post');
        const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, LIMITS.reportReason) : '';
        await Report.updateOne({ post: post._id, reporter: req.user.id }, { $set: { reason, status: 'open' }, $unset: { resolvedBy: 1, resolvedAt: 1, resolution: 1 } }, { upsert: true });
        await User.updateOne({ _id: req.user.id }, { $addToSet: { hidden: post._id } });
        res.json({ message: 'Report received' });
    });

    // ---- Comment threads ----
    router.get('/posts/:id/comments', optional, async (req, res) => {
        const post = await loadPost(req, res);
        if (!post) return;
        const blocked = new Set([...(req.viewer ? req.viewer.blocked : [])].map(String));
        res.json(post.comments
            .filter((c) => !blocked.has(String(c.author._id)))
            .map((c) => serializeComment(c.toObject(), req.user && req.user.id)));
    });

    router.post('/posts/:id/comments', required, async (req, res) => {
        const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
        const bad = validateComment(text);
        if (bad) return fail(res, 400, bad.replace(' first.', '.').replace('Write a comment', 'Comment text is required'));
        const post = await loadPost(req, res, { allowOwnUnlisted: false });
        if (!post) return;
        let parent;
        const parentId = req.body?.parentId;
        if (parentId) {
            parent = isValidId(parentId) && post.comments.id(parentId);
            if (!parent) return fail(res, 404, 'Parent comment not found');
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
        if (!comment) return fail(res, 404, 'Comment not found');
        const authorId = String(comment.author._id || comment.author);
        if (authorId !== req.user.id && post.author._id.toString() !== req.user.id && !isStaff(req.user.role)) {
            return fail(res, 403, 'You can only delete your own comments');
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
        const post = await loadPost(req, res, { allowOwnUnlisted: false });
        if (!post) return;
        const comment = isValidId(req.params.cid) && post.comments.id(req.params.cid);
        if (!comment) return fail(res, 404, 'Comment not found');
        const idx = comment.likes.findIndex((u) => u.toString() === req.user.id);
        if (idx === -1) comment.likes.push(req.user.id);
        else comment.likes.splice(idx, 1);
        await post.save();
        res.json(serializeComment(comment.toObject(), req.user.id));
    });

    // ---- Users ----
    const profileStats = async (u) => ({
        followers: await User.countDocuments({ following: u._id }),
        posts: await Post.countDocuments({ author: u._id, ...liveFilter() }),
    });
    const viewerOf = (id) => User.findById(id).select(VIEWER_FIELDS).lean();
    const briefWithBio = (u) => ({ ...userBrief(u), bio: u.bio || '' });
    const findUser = (username) => User.findOne({ username: String(username) }).lean();

    // Followed-by-people-you-follow first, then the most followed accounts.
    router.get('/users/suggestions', optional, async (req, res) => {
        const { limit } = pageParams(req, 30, 5);
        const viewer = req.viewer;
        const blockedIds = viewer ? viewer.blocked : [];
        const exclude = viewer ? [viewer._id, ...viewer.following, ...blockedIds] : [];
        const scores = new Map();
        const why = new Map();
        if (viewer && viewer.following.length) {
            const friends = await User.find({ _id: { $in: viewer.following } }).select('username following').lean();
            for (const f of friends) {
                for (const id of f.following) {
                    const k = String(id);
                    scores.set(k, (scores.get(k) || 0) + 1);
                    if (!why.has(k)) why.set(k, f.username);
                }
            }
        }
        const popular = await User.aggregate([
            { $match: { _id: { $nin: exclude }, status: { $ne: 'banned' } } },
            { $lookup: { from: 'users', localField: '_id', foreignField: 'following', as: 'f' } },
            { $project: { n: { $size: '$f' } } },
            { $sort: { n: -1, _id: 1 } },
            { $limit: 60 },
        ]);
        const excludeSet = new Set(exclude.map(String));
        const order = new Map();
        for (const p of popular) order.set(String(p._id), p.n);
        const ids = [...new Set([...scores.keys(), ...order.keys()])].filter((id) => !excludeSet.has(id));
        ids.sort((a, b) => (scores.get(b) || 0) - (scores.get(a) || 0) || (order.get(b) || 0) - (order.get(a) || 0) || (a < b ? -1 : 1));
        const users = await User.find({ _id: { $in: ids.slice(0, limit) } }).select(`${AUTHOR_FIELDS} bio isPrivate`).lean();
        const byId = new Map(users.map((u) => [String(u._id), u]));
        res.json(ids.slice(0, limit).map((id) => byId.get(id)).filter(Boolean).map((u) => ({
            ...briefWithBio(u),
            reason: why.has(String(u._id)) ? `Followed by @${why.get(String(u._id))}` : 'Popular on Orbit',
        })));
    });

    // Autocomplete for @mentions and the message composer
    router.get('/users/search', optional, async (req, res) => {
        const q = typeof req.query.q === 'string' ? req.query.q.trim().replace(/^@/, '') : '';
        const viewer = req.viewer;
        const hide = viewer ? [...viewer.blocked, ...(await User.find({ blocked: viewer._id }).select('_id').lean()).map((b) => b._id)] : [];
        const rx = new RegExp(`^${escapeRegex(q)}`, 'i');
        const users = await User.find({ _id: { $nin: hide }, status: { $ne: 'banned' }, ...(q ? { $or: [{ username: rx }, { displayName: rx }] } : {}) })
            .sort({ username: 1 }).limit(30).select(AUTHOR_FIELDS).lean();
        const following = new Set((viewer ? viewer.following : []).map(String));
        users.sort((a, b) => Number(following.has(String(b._id))) - Number(following.has(String(a._id))));
        res.json(users.slice(0, 6).map(userBrief));
    });

    router.put('/users/me', required, uploadProfileFiles, async (req, res) => {
        const files = filesOf(req);
        const bail = (status, error) => { files.forEach((f) => removeUpload(f.filename)); return fail(res, status, error); };
        const user = await User.findById(req.user.id);
        if (!user) return bail(401, 'User no longer exists');
        const { displayName, bio, removeAvatar, removeCover } = req.body || {};
        const problem = validateProfile({ displayName, bio });
        if ((displayName !== undefined && typeof displayName !== 'string') || (bio !== undefined && typeof bio !== 'string')) return bail(400, 'Invalid input');
        if (problem) return bail(400, problem.replace(/\.$/, ''));
        if (displayName !== undefined) user.displayName = displayName.trim();
        if (bio !== undefined) user.bio = bio.trim();
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
        const user = await findUser(req.params.username);
        if (!user) return fail(res, 404, 'User not found');
        const viewer = req.viewer;
        const profile = serializeProfile(user, await profileStats(user), viewer);
        if (profile.blockedByThem) { profile.bio = ''; profile.cover = null; profile.followers = 0; profile.following = 0; profile.posts = 0; }
        res.json(profile);
    });

    // followers / following lists (hidden for locked private accounts)
    const listConnections = (kind) => async (req, res) => {
        const user = await findUser(req.params.username);
        if (!user) return fail(res, 404, 'User not found');
        const viewer = req.viewer;
        if (relation(viewer, user)) return fail(res, 403, 'This account is private.', { locked: true });
        const { page, limit } = pageParams(req, 50, 20);
        const filter = kind === 'followers' ? { following: user._id } : { _id: { $in: user.following } };
        const hide = viewer ? viewer.blocked : [];
        const query = { ...filter, _id: { ...(filter._id || {}), $nin: hide } };
        const [users, total] = await Promise.all([
            User.find(query).sort({ username: 1 }).skip((page - 1) * limit).limit(limit).select(`${AUTHOR_FIELDS} bio`).lean(),
            User.countDocuments(query),
        ]);
        const mine = new Set((viewer ? viewer.following : []).map(String));
        res.json({
            users: users.map((u) => ({ ...briefWithBio(u), isFollowing: mine.has(String(u._id)), isMe: !!viewer && String(viewer._id) === String(u._id) })),
            page, limit, total, pages: Math.max(Math.ceil(total / limit), 1),
        });
    };
    router.get('/users/:username/followers', optional, listConnections('followers'));
    router.get('/users/:username/following', optional, listConnections('following'));

    router.post('/users/:username/follow', required, async (req, res) => {
        const target = await findUser(req.params.username);
        if (!target) return fail(res, 404, 'User not found');
        const me = req.viewer;
        if (String(target._id) === req.user.id) return fail(res, 400, 'You cannot follow yourself');
        if (has(target.blocked, req.user.id) || has(me.blocked, target._id)) return fail(res, 403, 'You cannot follow this account');
        const following = has(me.following, target._id);
        const requested = has(target.followRequests, req.user.id);
        if (following) await User.updateOne({ _id: req.user.id }, { $pull: { following: target._id } });
        else if (requested) await User.updateOne({ _id: target._id }, { $pull: { followRequests: req.user.id } });
        else if (target.isPrivate) {
            await User.updateOne({ _id: target._id }, { $addToSet: { followRequests: req.user.id } });
            await notify(target._id, req.user.id, 'request');
        } else {
            await User.updateOne({ _id: req.user.id }, { $addToSet: { following: target._id } });
            await notify(target._id, req.user.id, 'follow');
        }
        const fresh = await findUser(req.params.username);
        res.json(serializeProfile(fresh, await profileStats(fresh), await viewerOf(req.user.id)));
    });

    const relationToggle = (field) => async (req, res) => {
        const target = await findUser(req.params.username);
        if (!target) return fail(res, 404, 'User not found');
        if (String(target._id) === req.user.id) return fail(res, 400, `You cannot ${field === 'blocked' ? 'block' : 'mute'} yourself`);
        const on = has(req.viewer[field], target._id);
        await User.updateOne({ _id: req.user.id }, on ? { $pull: { [field]: target._id } } : { $addToSet: { [field]: target._id } });
        if (!on && field === 'blocked') {
            // blocking cuts every follow link and pending request in both directions
            await User.updateOne({ _id: req.user.id }, { $pull: { following: target._id, followRequests: target._id } });
            await User.updateOne({ _id: target._id }, { $pull: { following: req.user.id, followRequests: req.user.id } });
        }
        const fresh = await findUser(req.params.username);
        res.json(serializeProfile(fresh, await profileStats(fresh), await viewerOf(req.user.id)));
    };
    router.post('/users/:username/block', required, relationToggle('blocked'));
    router.post('/users/:username/mute', required, relationToggle('muted'));

    // Blocked and muted accounts
    router.get('/relations', required, async (req, res) => {
        const [blocked, muted] = await Promise.all([
            User.find({ _id: { $in: req.viewer.blocked } }).select(AUTHOR_FIELDS).lean(),
            User.find({ _id: { $in: req.viewer.muted } }).select(AUTHOR_FIELDS).lean(),
        ]);
        res.json({ blocked: blocked.map(userBrief), muted: muted.map(userBrief) });
    });

    // ---- Settings and follow requests ----
    const settingsOf = (u) => ({
        isPrivate: !!u.isPrivate,
        notifications: { ...DEFAULT_NOTIFICATION_PREFS, ...(u.notifPrefs || {}) },
    });

    router.get('/settings', required, async (req, res) => {
        res.json(settingsOf(await User.findById(req.user.id).lean()));
    });

    router.put('/settings', required, async (req, res) => {
        const user = await User.findById(req.user.id);
        const { isPrivate, notifications } = req.body || {};
        if (notifications !== undefined) {
            if (typeof notifications !== 'object' || notifications === null) return fail(res, 400, 'Invalid notification settings');
            const prefs = { ...DEFAULT_NOTIFICATION_PREFS, ...(user.notifPrefs || {}) };
            for (const key of NOTIFICATION_PREFS) if (typeof notifications[key] === 'boolean') prefs[key] = notifications[key];
            user.notifPrefs = prefs;
        }
        if (typeof isPrivate === 'boolean') {
            // opening a private account approves everyone who was waiting
            if (!isPrivate && user.isPrivate && user.followRequests.length) {
                const waiting = user.followRequests;
                await User.updateMany({ _id: { $in: waiting } }, { $addToSet: { following: user._id } });
                for (const id of waiting) await notify(id, user._id, 'accepted');
                user.followRequests = [];
            }
            user.isPrivate = isPrivate;
        }
        await user.save();
        res.json(settingsOf(user));
    });

    router.get('/follow-requests', required, async (req, res) => {
        const me = await User.findById(req.user.id).select('followRequests').lean();
        const users = await User.find({ _id: { $in: me.followRequests } }).select(`${AUTHOR_FIELDS} bio`).lean();
        res.json(users.map(briefWithBio));
    });

    router.post('/follow-requests/:username/:action', required, async (req, res) => {
        if (!['accept', 'decline'].includes(req.params.action)) return fail(res, 404, 'Not found');
        const requester = await findUser(req.params.username);
        const me = await User.findById(req.user.id);
        if (!requester || !has(me.followRequests, requester._id)) return fail(res, 404, 'No such follow request');
        me.followRequests = me.followRequests.filter((id) => String(id) !== String(requester._id));
        await me.save();
        if (req.params.action === 'accept') {
            await User.updateOne({ _id: requester._id }, { $addToSet: { following: me._id } });
            await notify(requester._id, me._id, 'accepted');
        }
        res.json({ message: req.params.action === 'accept' ? 'Request accepted' : 'Request declined' });
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

    router.get('/trending', optional, async (req, res) => {
        const hiddenAuthors = await excludedAuthors(req.viewer);
        const base = { ...liveFilter(), author: { $nin: hiddenAuthors } };
        const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
        let tags = await tagAggregate({ ...base, visibleAt: { $gte: since, $lte: new Date() } }, null, 8);
        if (!tags.length) tags = await tagAggregate(base, null, 8);
        res.json(tags);
    });

    router.get('/search', optional, async (req, res) => {
        const q = typeof req.query.q === 'string' ? req.query.q.trim().replace(/^[#@]/, '') : '';
        if (!q) return res.json({ users: [], posts: [], tags: [] });
        const viewer = req.viewer;
        const rx = new RegExp(escapeRegex(q), 'i');
        const hiddenAuthors = await excludedAuthors(viewer);
        const blocked = viewer ? [...viewer.blocked, ...(await User.find({ blocked: viewer._id }).select('_id').lean()).map((b) => b._id)] : [];
        const base = { ...liveFilter(), author: { $nin: hiddenAuthors } };
        const [users, posts, tags] = await Promise.all([
            User.find({ _id: { $nin: blocked }, status: { $ne: 'banned' }, $or: [{ username: rx }, { displayName: rx }] }).sort({ username: 1 }).limit(8).select(`${AUTHOR_FIELDS} bio`),
            Post.find({ ...base, $or: [{ content: rx }, { title: rx }], _id: { $nin: viewer ? viewer.hidden : [] } }).sort({ visibleAt: -1 }).limit(20).populate(POPULATE).lean(),
            tagAggregate(base, new RegExp(`^${escapeRegex(q.toLowerCase())}`), 8),
        ]);
        res.json({
            users: users.map(briefWithBio),
            posts: await serializePosts(posts, viewer, { hiddenAuthors }),
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

