const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { isStaff } = require('../lib/rules');

function getSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is not set');
    return secret;
}

function signToken(user) {
    return jwt.sign(
        { id: user._id.toString(), username: user.username, tv: user.tokenVersion ?? 0 },
        getSecret(),
        { expiresIn: '7d' }
    );
}

// Verifies the Bearer token, then checks the user still exists and the token's version is current
// (logout bumps tokenVersion, which revokes every token issued before it). Banned accounts are locked out
// and suspended accounts may read but not write until the suspension ends.
async function auth(req, res, next) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    let payload;
    try {
        payload = jwt.verify(token, getSecret());
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
    try {
        const user = await User.findById(payload.id).select('username tokenVersion role status suspendedUntil statusReason');
        if (!user) return res.status(401).json({ error: 'User no longer exists' });
        if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) {
            return res.status(401).json({ error: 'Token has been revoked' });
        }
        if (user.status === 'suspended' && user.suspendedUntil && user.suspendedUntil.getTime() <= Date.now()) {
            user.status = 'active';
            user.suspendedUntil = undefined;
            user.statusReason = '';
            await user.save();
        }
        req.user = { id: user._id.toString(), username: user.username, role: user.role || 'user', status: user.status || 'active' };
        const leaving = req.originalUrl.split('?')[0].endsWith('/auth/logout');
        if (user.status === 'banned' && !leaving) {
            return res.status(403).json({ error: `Your account has been banned.${user.statusReason ? ` Reason: ${user.statusReason}` : ''}` });
        }
        if (user.status === 'suspended' && req.method !== 'GET' && !leaving) {
            return res.status(403).json({ error: `Your account is suspended until ${user.suspendedUntil.toISOString().slice(0, 10)}. You can read but not post.` });
        }
        next();
    } catch (err) {
        console.error('Auth lookup failed:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}

// Like auth, but requests without credentials continue anonymously (public routes with viewer-specific data).
function optionalAuth(req, res, next) {
    if (!req.headers.authorization) return next();
    return auth(req, res, next);
}

// Only staff (moderators and admins) may continue; `admin` restricts further to administrators.
const requireRole = (role) => (req, res, next) => {
    const ok = role === 'admin' ? req.user.role === 'admin' : isStaff(req.user.role);
    if (!ok) return res.status(403).json({ error: role === 'admin' ? 'Administrators only' : 'Moderators only' });
    next();
};

module.exports = { auth, optionalAuth, signToken, requireRole };
