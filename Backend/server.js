require('dotenv').config({ quiet: true });
const http = require('http');
const mongoose = require('mongoose');
const { createApp } = require('./app');
const { attachRealtime } = require('./lib/realtime');
const { publishDue } = require('./lib/posts');
const Post = require('./models/Post');

if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is not set. Copy .env.example to .env and set it.');
    process.exit(1);
}

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0'; // reachable from other devices on the LAN

// Posts saved before scheduling existed get a visibility time (non-destructive, runs once per start).
async function backfill() {
    await Post.updateMany({ visibleAt: { $exists: false }, status: { $ne: 'draft' } }, [{ $set: { visibleAt: '$createdAt' } }], { updatePipeline: true });
}

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/socialMediaDB')
    .then(async () => {
        console.log('MongoDB connected');
        await backfill();
        // scheduled posts become published (and notify) when their time comes
        setInterval(() => publishDue().catch((e) => console.error('Scheduled publish failed:', e.message)), 30000).unref();
    })
    .catch((error) => console.error('MongoDB connection error:', error));

const origins = (process.env.CORS_ORIGIN || '').split(',').map((o) => o.trim()).filter(Boolean);
const server = http.createServer(createApp());
attachRealtime(server, origins);
server.listen(PORT, HOST, () => {
    console.log(`Server is running on ${HOST}:${PORT}`);
});
