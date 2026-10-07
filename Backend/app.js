const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Post = require('./models/Post');
const User = require('./models/User');
const { auth, optionalAuth, signToken } = require('./middleware/auth');
const { extractHashtags } = require('./lib/text');
const { notify, notifyMentions } = require('./lib/notify');
const { media } = require('./lib/serialize');
const createSocialRoutes = require('./routes/social');

// Allowed uploads: mimetype -> extension. The extension on disk never comes from the client filename.
const FILE_TYPES = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
};

// Content sniffing (magic numbers): returns the real mimetype of the file, or null.
// The client-declared mimetype is only a hint: some browsers/OSes send application/octet-stream
// or nothing for valid files (e.g. .webp), and a forged one must not get through.
function sniffMime(buf) {
    const ascii = (from, to) => buf.toString('latin1', from, to);
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
    if (ascii(0, 5) === '%PDF-') return 'application/pdf';
    return null;
}
const UNKNOWN_MIMES = ['application/octet-stream', ''];

// CORS_ORIGIN: comma-separated allowed origins (e.g. http://localhost:5173,http://192.168.1.20:5173); unset = any origin.
function corsOptions() {
    const list = (process.env.CORS_ORIGIN || '').split(',').map((o) => o.trim()).filter(Boolean);
    return list.length ? { origin: list } : {};
}

const publicUser = (u) => ({
    id: u._id,
    username: u.username,
    email: u.email,
    displayName: u.displayName || u.username,
    avatar: media(u.avatar),
});

function createApp() {
    const app = express();

    const UPLOADS_DIR = process.env.UPLOADS_DIR
        ? path.resolve(process.env.UPLOADS_DIR)
        : path.join(__dirname, 'uploads');
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });

    app.use(cors(corsOptions()));
    app.use(express.json());
    app.use('/uploads', express.static(UPLOADS_DIR));

    const storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, UPLOADS_DIR),
        filename: (req, file, cb) => {
            // temporary extension; corrected after content sniffing in uploadFile
            cb(null, file.fieldname + '-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex') + (FILE_TYPES[file.mimetype] || '.upload'));
        },
    });

    const upload = multer({
        storage,
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
        fileFilter: (req, file, cb) => {
            const imageOnly = file.fieldname !== 'file';
            if ((imageOnly && file.mimetype === 'application/pdf') || (!FILE_TYPES[file.mimetype] && !UNKNOWN_MIMES.includes(file.mimetype))) {
                return cb(new Error('Invalid file type, only JPG, PNG, WebP, and PDF are allowed.'));
            }
            cb(null, true);
        },
    });

    function removeUpload(filename) {
        if (!filename) return;
        const target = path.join(UPLOADS_DIR, path.basename(filename));
        fs.unlink(target, (err) => {
            if (err && err.code !== 'ENOENT') console.error('Failed to remove upload:', err.message);
        });
    }

    // Multer for the given fields followed by a content (magic number) check; the stored extension
    // always comes from the sniffed type. Fields other than `file` accept images only (no PDF).
    // On any failure every file of the request is removed. req.file is the first `file` upload.
    const makeUploader = (fields) => (req, res, next) => {
        upload.fields(fields)(req, res, (err) => {
            const files = Object.values(req.files || {}).flat();
            const abort = (e) => {
                files.forEach((f) => removeUpload(f.filename));
                req.files = {};
                req.file = undefined;
                return next(e);
            };
            if (err) return abort(err);
            try {
                for (const f of files) {
                    const fd = fs.openSync(f.path, 'r');
                    const buf = Buffer.alloc(12);
                    const n = fs.readSync(fd, buf, 0, 12, 0);
                    fs.closeSync(fd);
                    const real = sniffMime(buf.subarray(0, n));
                    const declared = f.mimetype;
                    const imageOnly = f.fieldname !== 'file';
                    if (!real || (imageOnly && real === 'application/pdf') || (FILE_TYPES[declared] && declared !== real)) {
                        return abort(new Error('Invalid file type, only JPG, PNG, WebP, and PDF are allowed.'));
                    }
                    const finalName = f.filename.replace(/\.[^.]+$/, '') + FILE_TYPES[real];
                    if (finalName !== f.filename) {
                        fs.renameSync(f.path, path.join(UPLOADS_DIR, finalName));
                        f.filename = finalName;
                        f.path = path.join(UPLOADS_DIR, finalName);
                    }
                    f.mimetype = real;
                }
            } catch (e) {
                return abort(e);
            }
            req.file = req.files && req.files.file ? req.files.file[0] : undefined;
            next();
        });
    };
    const uploadFile = makeUploader([{ name: 'file', maxCount: 1 }]);
    const uploadPostFiles = makeUploader([{ name: 'file', maxCount: 1 }, { name: 'images', maxCount: 6 }]);
    const uploadProfileFiles = makeUploader([{ name: 'avatar', maxCount: 1 }, { name: 'cover', maxCount: 1 }]);
    const filesOf = (req) => Object.values(req.files || {}).flat();

    const POPULATE = [
        { path: 'author', select: 'username' },
        { path: 'comments.author', select: 'username' },
    ];
    const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

    // ---- Auth ----
    app.post('/api/auth/register', async (req, res) => {
        try {
            const { username, email, password } = req.body || {};
            if (!username || !email || !password) {
                return res.status(400).json({ error: 'username, email and password are required' });
            }
            if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
                return res.status(400).json({ error: 'Invalid input' });
            }
            if (username.trim().length < 3) {
                return res.status(400).json({ error: 'Username must be at least 3 characters' });
            }
            if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
                return res.status(400).json({ error: 'Invalid email address' });
            }
            if (password.length < 6) {
                return res.status(400).json({ error: 'Password must be at least 6 characters' });
            }
            const exists = await User.findOne({ $or: [{ username: username.trim() }, { email: email.trim().toLowerCase() }] });
            if (exists) {
                return res.status(409).json({ error: 'Username or email already in use' });
            }
            const user = await User.create({ username: username.trim(), email, password });
            res.status(201).json({ token: signToken(user), user: publicUser(user) });
        } catch (error) {
            if (error.code === 11000) return res.status(409).json({ error: 'Username or email already in use' });
            console.error('Error registering:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    app.post('/api/auth/login', async (req, res) => {
        try {
            const { identifier, email, username, password } = req.body || {};
            const id = identifier || email || username;
            if (!id || !password || typeof id !== 'string' || typeof password !== 'string') {
                return res.status(400).json({ error: 'Email/username and password are required' });
            }
            const user = await User.findOne({ $or: [{ email: id.trim().toLowerCase() }, { username: id.trim() }] }).select('+password');
            if (!user || !(await user.comparePassword(password))) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            res.json({ token: signToken(user), user: publicUser(user) });
        } catch (error) {
            console.error('Error logging in:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    app.get('/api/auth/me', auth, async (req, res) => {
        try {
            const user = await User.findById(req.user.id);
            if (!user) return res.status(401).json({ error: 'User no longer exists' });
            res.json({ user: publicUser(user) });
        } catch (error) {
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    // Revokes every token issued so far for this user (bumps tokenVersion).
    app.post('/api/auth/logout', auth, async (req, res) => {
        try {
            await User.updateOne({ _id: req.user.id }, { $inc: { tokenVersion: 1 } });
            res.json({ message: 'Logged out' });
        } catch (error) {
            console.error('Error logging out:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    // ---- Posts ----
    app.get('/api/posts', async (req, res) => {
        try {
            const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
            const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
            const [posts, total] = await Promise.all([
                Post.find().sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate(POPULATE),
                Post.countDocuments(),
            ]);
            res.json({ posts, page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) });
        } catch (error) {
            console.error('Error fetching posts:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    app.post('/api/posts', auth, uploadPostFiles, async (req, res) => {
        const file = req.file ? req.file.filename : undefined;
        const images = ((req.files && req.files.images) || []).map((f) => f.filename);
        const removeAll = () => [file, ...images].forEach(removeUpload);
        try {
            const { title, content } = req.body || {};

            const titleBad = title !== undefined && (typeof title !== 'string' || !title.trim());
            if (titleBad || typeof content !== 'string' || !content.trim()) {
                removeAll();
                return res.status(400).json({ error: 'Content is required, and the title cannot be blank' });
            }
            if (content.length > 2000 || (title || '').length > 120) {
                removeAll();
                return res.status(400).json({ error: 'Content is limited to 2000 characters and the title to 120' });
            }

            const post = new Post({
                title: title || '', content, file, images, author: req.user.id,
                hashtags: extractHashtags(`${title || ''} ${content}`),
            });
            await post.save();
            await notifyMentions(content, req.user.id, post);
            await post.populate(POPULATE);
            res.status(201).json(post);
        } catch (error) {
            removeAll();
            console.error('Error creating post:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    // Edit own post (title/content, optional replacement file)
    app.put('/api/posts/:postId', auth, uploadFile, async (req, res) => {
        const newFile = req.file ? req.file.filename : undefined;
        try {
            if (!isValidId(req.params.postId)) { removeUpload(newFile); return res.status(404).json({ error: 'Post not found' }); }
            const post = await Post.findById(req.params.postId);
            if (!post) { removeUpload(newFile); return res.status(404).json({ error: 'Post not found' }); }
            if (post.author.toString() !== req.user.id) {
                removeUpload(newFile);
                return res.status(403).json({ error: 'You can only edit your own posts' });
            }
            const { title, content } = req.body || {};
            if (title !== undefined) {
                if (typeof title !== 'string' || !title.trim()) { removeUpload(newFile); return res.status(400).json({ error: 'Title cannot be empty' }); }
                post.title = title;
            }
            if (content !== undefined) {
                if (typeof content !== 'string' || !content.trim()) { removeUpload(newFile); return res.status(400).json({ error: 'Content cannot be empty' }); }
                post.content = content;
            }
            if (title !== undefined || content !== undefined) {
                post.hashtags = extractHashtags(`${post.title || ''} ${post.content}`);
                post.editedAt = new Date();
            }
            let oldFile;
            if (newFile) { oldFile = post.file; post.file = newFile; }
            await post.save();
            removeUpload(oldFile);
            await post.populate(POPULATE);
            res.json(post);
        } catch (error) {
            removeUpload(newFile);
            console.error('Error updating post:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    app.delete('/api/posts/:postId', auth, async (req, res) => {
        try {
            if (!isValidId(req.params.postId)) return res.status(404).json({ error: 'Post not found' });
            const post = await Post.findById(req.params.postId);
            if (!post) return res.status(404).json({ error: 'Post not found' });
            if (post.author.toString() !== req.user.id) {
                return res.status(403).json({ error: 'You can only delete your own posts' });
            }
            await post.deleteOne();
            removeUpload(post.file);
            (post.images || []).forEach(removeUpload);
            res.json({ message: 'Post deleted' });
        } catch (error) {
            console.error('Error deleting post:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    // Toggle like for the current user (likes is a per-user set)
    app.post('/api/posts/like/:postId', auth, async (req, res) => {
        try {
            if (!isValidId(req.params.postId)) return res.status(404).json({ error: 'Post not found' });
            const post = await Post.findById(req.params.postId);
            if (!post) return res.status(404).json({ error: 'Post not found' });

            const idx = post.likes.findIndex((u) => u.toString() === req.user.id);
            if (idx === -1) post.likes.push(req.user.id);
            else post.likes.splice(idx, 1);
            await post.save();
            if (idx === -1) await notify(post.author, req.user.id, 'like', post, post.content);
            await post.populate(POPULATE);
            res.json(post);
        } catch (error) {
            console.error('Error liking post:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    app.post('/api/posts/comment/:postId', auth, async (req, res) => {
        try {
            if (!isValidId(req.params.postId)) return res.status(404).json({ error: 'Post not found' });
            const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
            if (!text) return res.status(400).json({ error: 'Comment text is required' });
            const post = await Post.findById(req.params.postId);
            if (!post) return res.status(404).json({ error: 'Post not found' });

            post.comments.push({ text, author: req.user.id });
            await post.save();
            await notify(post.author, req.user.id, 'comment', post, text);
            await post.populate(POPULATE);
            res.json(post);
        } catch (error) {
            console.error('Error adding comment:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    // ---- Profiles, follows, feeds, comments threads, notifications, search ----
    app.use('/api', createSocialRoutes({ auth, optionalAuth, uploadPostFiles, uploadProfileFiles, removeUpload, filesOf }));

    // Error handler (multer errors such as file too large / invalid type)
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
        if (err && err.type === 'entity.parse.failed') {
            return res.status(400).json({ error: 'Invalid JSON body' });
        }
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ error: err.message });
        }
        if (err && err.message && err.message.startsWith('Invalid file type')) {
            return res.status(400).json({ error: err.message });
        }
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    });

    return app;
}

module.exports = { createApp };
