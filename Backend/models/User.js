const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES, DEFAULT_NOTIFICATION_PREFS } = require('../lib/rules');

const ref = (model) => [{ type: mongoose.Schema.Types.ObjectId, ref: model }];

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true, minlength: 6, select: false },
    displayName: { type: String, trim: true, maxlength: 50, default: '' },
    bio: { type: String, trim: true, maxlength: 280, default: '' },
    avatar: String,
    cover: String,
    role: { type: String, enum: ROLES, default: 'user', index: true },
    // moderation state: suspended users can read but not write until suspendedUntil; banned users cannot sign in
    status: { type: String, enum: ['active', 'suspended', 'banned'], default: 'active' },
    suspendedUntil: Date,
    statusReason: { type: String, default: '' },
    isPrivate: { type: Boolean, default: false },
    following: ref('User'),
    followRequests: ref('User'), // people waiting for this (private) account to approve them
    blocked: ref('User'),
    muted: ref('User'),
    bookmarks: ref('Post'),
    hidden: ref('Post'),
    pinnedPost: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
    notifPrefs: { type: Object, default: () => ({ ...DEFAULT_NOTIFICATION_PREFS }) },
    // Bumped on logout; tokens carry the version they were issued with
    tokenVersion: { type: Number, default: 0 }
}, { timestamps: true, minimize: false });

userSchema.index({ following: 1 });
userSchema.index({ blocked: 1 });

userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = function (plain) {
    return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
