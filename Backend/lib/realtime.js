// Socket.IO hub: every signed-in browser joins a room named after its user id, so the API can push
// new messages, typing hints and notification pings to exactly the people concerned.
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

let io = null;

function attachRealtime(httpServer, corsOrigin) {
    io = new Server(httpServer, { cors: { origin: corsOrigin && corsOrigin.length ? corsOrigin : true } });
    io.use(async (socket, next) => {
        try {
            const payload = jwt.verify(socket.handshake.auth && socket.handshake.auth.token, process.env.JWT_SECRET);
            const user = await User.findById(payload.id).select('tokenVersion status');
            if (!user || (payload.tv ?? 0) !== (user.tokenVersion ?? 0) || user.status === 'banned') return next(new Error('unauthorized'));
            socket.data.userId = String(user._id);
            next();
        } catch {
            next(new Error('unauthorized'));
        }
    });
    io.on('connection', (socket) => {
        socket.join(`user:${socket.data.userId}`);
        // typing hint: forwarded to the other person only
        socket.on('typing', (to) => {
            if (typeof to === 'string' && to.length < 40) io.to(`user:${to}`).emit('typing', { from: socket.data.userId });
        });
    });
    return io;
}

function emitToUser(userId, event, payload) {
    if (io) io.to(`user:${userId}`).emit(event, payload);
}

function closeRealtime() {
    if (io) { io.close(); io = null; }
}

module.exports = { attachRealtime, emitToUser, closeRealtime };
