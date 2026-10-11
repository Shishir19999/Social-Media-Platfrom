// Staff tools: reports queue, post moderation, user management, audit log and statistics.
const express = require('express');
const Post = require('../models/Post');
const User = require('../models/User');
const Report = require('../models/Report');
const AuditLog = require('../models/AuditLog');
const { escapeRegex } = require('../lib/text');
const { notify } = require('../lib/notify');
const { userBrief } = require('../lib/serialize');
const { POPULATE, isValidId, serializePosts } = require('../lib/posts');
const { LIMITS, ROLES, SUSPEND_DAYS, canActOnUser, canChangeRole, clip, isStaff } = require('../lib/rules');

const USER_FIELDS = 'username displayName avatar role';
const pageParams = (req, def = 20) => ({
    page: Math.max(parseInt(req.query.page, 10) || 1, 1),
    limit: Math.min(Math.max(parseInt(req.query.limit, 10) || def, 1), 50),
});

module.exports = function createAdminRoutes({ auth, requireRole }) {
    const router = express.Router();
    router.use(auth, requireRole('staff'));

    const fail = (res, status, error) => res.status(status).json({ error });
    const log = (actor, action, targetType, targetId, targetLabel, note = '') => AuditLog.create({
        actor: actor.id, action, targetType, targetId: String(targetId), targetLabel: clip(targetLabel, 80), note: String(note).slice(0, LIMITS.modNote),
    });
    const noteOf = (req) => (typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, LIMITS.modNote) : '');
    const staffViewer = (req) => ({ _id: req.user.id, role: req.user.role, bookmarks: [], following: [], blocked: [] });

    // ---- Statistics ----
    router.get('/stats', async (req, res) => {
        const week = new Date(Date.now() - 7 * 86400000);
        const [users, posts, openReports, moderated, suspended, banned, newUsers, newPosts, perDay] = await Promise.all([
            User.countDocuments(),
            Post.countDocuments({ status: { $ne: 'draft' } }),
            Report.distinct('post', { status: 'open' }).then((l) => l.length),
            Post.countDocuments({ modState: { $in: ['hidden', 'removed'] } }),
            User.countDocuments({ status: 'suspended' }),
            User.countDocuments({ status: 'banned' }),
            User.countDocuments({ createdAt: { $gte: week } }),
            Post.countDocuments({ createdAt: { $gte: week }, status: { $ne: 'draft' } }),
            Post.aggregate([
                { $match: { createdAt: { $gte: week }, status: { $ne: 'draft' } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, n: { $sum: 1 } } },
            ]),
        ]);
        const byDay = new Map(perDay.map((d) => [d._id, d.n]));
        const series = [];
        for (let i = 6; i >= 0; i--) {
            const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
            series.push({ day, posts: byDay.get(day) || 0 });
        }
        res.json({ users, posts, openReports, moderated, suspended, banned, newUsers, newPosts, series });
    });

    // ---- Reports queue ----
    router.get('/reports', async (req, res) => {
        const status = req.query.status === 'closed' ? { $ne: 'open' } : 'open';
        const reports = await Report.find({ status }).sort({ createdAt: -1 }).limit(400).populate('reporter', USER_FIELDS).lean();
        const groups = new Map();
        for (const r of reports) {
            const key = String(r.post);
            if (!groups.has(key)) groups.set(key, { postId: key, reports: [], lastAt: r.createdAt });
            groups.get(key).reports.push(r);
        }
        const { page, limit } = pageParams(req, 10);
        const all = [...groups.values()];
        const slice = all.slice((page - 1) * limit, page * limit);
        const posts = await Post.find({ _id: { $in: slice.map((g) => g.postId) } }).populate(POPULATE).lean();
        const serialized = await serializePosts(posts, staffViewer(req));
        const byId = new Map(serialized.map((p) => [p.id, p]));
        res.json({
            items: slice.map((g) => ({
                post: byId.get(g.postId) || null,
                postId: g.postId,
                count: g.reports.length,
                lastAt: g.lastAt,
                status: g.reports[0].status,
                resolution: g.reports[0].resolution || '',
                reports: g.reports.map((r) => ({ reporter: userBrief(r.reporter), reason: r.reason, createdAt: r.createdAt })),
            })),
            page, total: all.length, pages: Math.max(Math.ceil(all.length / limit), 1),
        });
    });

    // Applies a decision to a post: ok (restore), hidden or removed. Notifies the author and writes the audit log.
    async function moderatePost(req, res, postId, state, note, reportAction) {
        const stop = (status, error) => { fail(res, status, error); return null; };
        if (!isValidId(postId)) return stop(404, 'Post not found');
        const post = await Post.findById(postId).populate('author', USER_FIELDS);
        if (!post) return stop(404, 'Post not found');
        if (state !== 'ok' && String(post.author._id) !== req.user.id && isStaff(post.author.role) && !canActOnUser(req.user, { id: post.author._id, role: post.author.role })) {
            return stop(403, 'You cannot moderate posts by staff of an equal or higher role');
        }
        const before = post.modState;
        post.modState = state;
        post.modNote = state === 'ok' ? '' : note;
        await post.save();
        if (state !== 'ok' && before !== state) await notify(post.author._id, req.user.id, 'moderation', post, `${state === 'removed' ? 'Removed' : 'Hidden'}: ${note || 'it breaks the community rules'}`);
        const action = reportAction || (state === 'ok' ? 'post.restore' : state === 'removed' ? 'post.remove' : 'post.hide');
        await log(req.user, action, 'post', post.id, post.content || '(no text)', note);
        return post;
    }

    router.post('/reports/:postId/resolve', async (req, res) => {
        const action = req.body && req.body.action;
        if (!['dismiss', 'hide', 'remove'].includes(action)) return fail(res, 400, 'Choose dismiss, hide or remove');
        const note = noteOf(req);
        if (action !== 'dismiss') {
            const post = await moderatePost(req, res, req.params.postId, action === 'hide' ? 'hidden' : 'removed', note, `report.${action}`);
            if (!post) return;
        } else {
            const post = isValidId(req.params.postId) && await Post.findById(req.params.postId).select('content');
            if (!post) return fail(res, 404, 'Post not found');
            await log(req.user, 'report.dismiss', 'post', post.id, post.content || '(no text)', note);
        }
        await Report.updateMany({ post: req.params.postId, status: 'open' }, {
            $set: { status: action === 'dismiss' ? 'dismissed' : 'resolved', resolvedBy: req.user.id, resolvedAt: new Date(), resolution: action === 'dismiss' ? 'Dismissed' : `Post ${action === 'hide' ? 'hidden' : 'removed'}` },
        });
        res.json({ message: 'Report resolved' });
    });

    // Posts currently hidden or removed (so they can be restored)
    router.get('/posts', async (req, res) => {
        const { page, limit } = pageParams(req, 10);
        const filter = { modState: { $in: ['hidden', 'removed'] } };
        const [posts, total] = await Promise.all([
            Post.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).populate(POPULATE).lean(),
            Post.countDocuments(filter),
        ]);
        res.json({ items: await serializePosts(posts, staffViewer(req)), page, total, pages: Math.max(Math.ceil(total / limit), 1) });
    });

    router.post('/posts/:id/state', async (req, res) => {
        const state = req.body && req.body.state;
        if (!['ok', 'hidden', 'removed'].includes(state)) return fail(res, 400, 'Unknown state');
        const post = await moderatePost(req, res, req.params.id, state, noteOf(req));
        if (post) res.json({ id: post.id, modState: post.modState });
    });

    // ---- Users ----
    router.get('/users', async (req, res) => {
        const { page, limit } = pageParams(req, 15);
        const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        const filter = {};
        if (q) { const rx = new RegExp(escapeRegex(q), 'i'); filter.$or = [{ username: rx }, { displayName: rx }]; }
        if (ROLES.includes(req.query.role)) filter.role = req.query.role;
        if (['active', 'suspended', 'banned'].includes(req.query.status)) filter.status = req.query.status;
        const [users, total] = await Promise.all([
            User.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).select(`${USER_FIELDS} status suspendedUntil statusReason createdAt email`).lean(),
            User.countDocuments(filter),
        ]);
        const counts = await Post.aggregate([{ $match: { author: { $in: users.map((u) => u._id) }, status: { $ne: 'draft' } } }, { $group: { _id: '$author', n: { $sum: 1 } } }]);
        const nPosts = new Map(counts.map((c) => [String(c._id), c.n]));
        const admin = req.user.role === 'admin';
        res.json({
            items: users.map((u) => ({
                ...userBrief(u), status: u.status || 'active', suspendedUntil: u.suspendedUntil || null, statusReason: u.statusReason || '',
                joined: u.createdAt, posts: nPosts.get(String(u._id)) || 0, ...(admin ? { email: u.email } : {}),
            })),
            page, total, pages: Math.max(Math.ceil(total / limit), 1),
        });
    });

    router.post('/users/:id/status', async (req, res) => {
        if (!isValidId(req.params.id)) return fail(res, 404, 'User not found');
        const target = await User.findById(req.params.id);
        if (!target) return fail(res, 404, 'User not found');
        if (!canActOnUser(req.user, { id: target._id, role: target.role })) return fail(res, 403, 'You cannot act on this account');
        const { action } = req.body || {};
        const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, LIMITS.modNote) : '';
        if (action === 'suspend') {
            const days = Number(req.body.days);
            if (!SUSPEND_DAYS.includes(days)) return fail(res, 400, `Choose a suspension of ${SUSPEND_DAYS.join(', ')} days`);
            target.status = 'suspended';
            target.suspendedUntil = new Date(Date.now() + days * 86400000);
            target.statusReason = reason;
        } else if (action === 'ban') {
            if (req.user.role !== 'admin') return fail(res, 403, 'Only administrators can ban accounts');
            target.status = 'banned';
            target.suspendedUntil = undefined;
            target.statusReason = reason;
            target.tokenVersion = (target.tokenVersion || 0) + 1; // signs the person out everywhere
        } else if (action === 'restore') {
            target.status = 'active';
            target.suspendedUntil = undefined;
            target.statusReason = '';
        } else return fail(res, 400, 'Choose suspend, ban or restore');
        await target.save();
        await log(req.user, `user.${action}`, 'user', target.id, `@${target.username}`, reason);
        res.json({ id: target.id, status: target.status, suspendedUntil: target.suspendedUntil || null });
    });

    router.put('/users/:id/role', requireRole('admin'), async (req, res) => {
        if (!isValidId(req.params.id)) return fail(res, 404, 'User not found');
        const target = await User.findById(req.params.id);
        if (!target) return fail(res, 404, 'User not found');
        const role = req.body && req.body.role;
        if (!canChangeRole(req.user, { id: target._id, role: target.role }, role)) return fail(res, 403, 'You cannot change this role');
        const before = target.role;
        target.role = role;
        await target.save();
        await log(req.user, 'user.role', 'user', target.id, `@${target.username}`, `${before} to ${role}`);
        res.json({ id: target.id, role: target.role });
    });

    // ---- Audit log ----
    router.get('/audit', async (req, res) => {
        const { page, limit } = pageParams(req, 20);
        const [rows, total] = await Promise.all([
            AuditLog.find().sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate('actor', USER_FIELDS).lean(),
            AuditLog.countDocuments(),
        ]);
        res.json({
            items: rows.map((a) => ({ id: String(a._id), actor: userBrief(a.actor), action: a.action, targetType: a.targetType, targetId: a.targetId, targetLabel: a.targetLabel, note: a.note, createdAt: a.createdAt })),
            page, total, pages: Math.max(Math.ceil(total / limit), 1),
        });
    });

    return router;
};
