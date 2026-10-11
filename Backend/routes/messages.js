// Direct messages: one conversation per pair of people, pushed in real time over Socket.IO.
const express = require('express');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { userBrief } = require('../lib/serialize');
const { validateMessage, LIMITS, clip } = require('../lib/rules');
const { emitToUser } = require('../lib/realtime');

const FIELDS = 'username displayName avatar role blocked status';
const keyOf = (a, b) => [String(a), String(b)].sort().join(':');
const has = (list, id) => (list || []).some((x) => String(x) === String(id));
const msg = (m) => ({ id: String(m._id), sender: String(m.sender), text: m.text, createdAt: m.createdAt });

module.exports = function createMessageRoutes({ auth }) {
    const router = express.Router();
    router.use(auth);

    const fail = (res, status, error) => res.status(status).json({ error });

    // Loads the other person; people who blocked each other cannot message.
    async function peer(req, res) {
        const other = await User.findOne({ username: String(req.params.username) }).select(FIELDS).lean();
        if (!other) { fail(res, 404, 'User not found'); return null; }
        if (String(other._id) === req.user.id) { fail(res, 400, 'You cannot message yourself'); return null; }
        const me = await User.findById(req.user.id).select('blocked').lean();
        if (has(other.blocked, req.user.id) || has(me.blocked, other._id)) { fail(res, 403, 'You cannot message this account'); return null; }
        if (other.status === 'banned') { fail(res, 404, 'User not found'); return null; }
        return other;
    }

    const unreadIn = (conv, userId) => {
        const since = conv.reads && conv.reads[userId] ? new Date(conv.reads[userId]) : new Date(0);
        return Message.countDocuments({ conversation: conv._id, sender: { $ne: userId }, createdAt: { $gt: since } });
    };

    router.get('/conversations', async (req, res) => {
        const me = await User.findById(req.user.id).select('blocked').lean();
        const convs = await Conversation.find({ participants: req.user.id, 'lastMessage.at': { $exists: true } })
            .sort({ 'lastMessage.at': -1 }).limit(100).lean();
        const otherIds = convs.map((c) => c.participants.find((p) => String(p) !== req.user.id));
        const others = new Map((await User.find({ _id: { $in: otherIds } }).select(FIELDS).lean()).map((u) => [String(u._id), u]));
        const out = [];
        for (const c of convs) {
            const other = others.get(String(c.participants.find((p) => String(p) !== req.user.id)));
            if (!other || has(me.blocked, other._id)) continue;
            out.push({
                id: String(c._id),
                with: userBrief(other),
                last: { text: c.lastMessage.text, at: c.lastMessage.at, mine: String(c.lastMessage.sender) === req.user.id },
                unread: await unreadIn(c, req.user.id),
            });
        }
        res.json(out);
    });

    router.get('/unread', async (req, res) => {
        const convs = await Conversation.find({ participants: req.user.id, 'lastMessage.at': { $exists: true } }).lean();
        let count = 0;
        for (const c of convs) if (String(c.lastMessage.sender) !== req.user.id && await unreadIn(c, req.user.id)) count += 1;
        res.json({ count });
    });

    router.get('/with/:username', async (req, res) => {
        const other = await peer(req, res);
        if (!other) return;
        const conv = await Conversation.findOne({ key: keyOf(req.user.id, other._id) }).lean();
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
        let messages = [];
        let hasMore = false;
        if (conv) {
            const filter = { conversation: conv._id, ...(req.query.before ? { _id: { $lt: req.query.before } } : {}) };
            const rows = await Message.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
            hasMore = rows.length > limit;
            messages = rows.slice(0, limit).reverse().map(msg);
        }
        res.json({ with: userBrief(other), messages, hasMore, otherRead: conv && conv.reads ? conv.reads[String(other._id)] || null : null });
    });

    router.post('/with/:username', async (req, res) => {
        const other = await peer(req, res);
        if (!other) return;
        const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
        const bad = validateMessage(text);
        if (bad) return fail(res, 400, bad);
        const key = keyOf(req.user.id, other._id);
        let conv = await Conversation.findOne({ key });
        if (!conv) conv = await Conversation.create({ key, participants: [req.user.id, other._id] });
        const message = await Message.create({ conversation: conv._id, sender: req.user.id, text });
        conv.lastMessage = { text: clip(text, 120), sender: req.user.id, at: message.createdAt };
        conv.reads = { ...(conv.reads || {}), [req.user.id]: message.createdAt.toISOString() };
        conv.markModified('reads');
        await conv.save();
        const payload = { conversationId: String(conv._id), from: req.user.id, to: String(other._id), message: msg(message) };
        emitToUser(req.user.id, 'message:new', payload);
        emitToUser(other._id, 'message:new', payload);
        res.status(201).json(msg(message));
    });

    router.post('/with/:username/read', async (req, res) => {
        const other = await peer(req, res);
        if (!other) return;
        const conv = await Conversation.findOne({ key: keyOf(req.user.id, other._id) });
        if (conv) {
            conv.reads = { ...(conv.reads || {}), [req.user.id]: new Date().toISOString() };
            conv.markModified('reads');
            await conv.save();
            emitToUser(other._id, 'message:read', { from: req.user.id });
        }
        res.json({ message: 'Marked as read' });
    });

    return router;
};

module.exports.MESSAGE_LIMIT = LIMITS.message;
