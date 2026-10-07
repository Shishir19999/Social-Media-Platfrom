const jwt = require('jsonwebtoken');
const User = require('../models/User');

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
// (logout bumps tokenVersion, which revokes every token issued before it).
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
        const user = await User.findById(payload.id).select('username tokenVersion');
        if (!user) return res.status(401).json({ error: 'User no longer exists' });
        if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) {
            return res.status(401).json({ error: 'Token has been revoked' });
        }
        req.user = { id: user._id.toString(), username: user.username };
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

module.exports = { auth, optionalAuth, signToken };
