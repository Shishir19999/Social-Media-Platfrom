const mongoose = require('mongoose');
const { NOTIFICATION_TYPES } = require('../lib/rules');

const notificationSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
    snippet: String,
    read: { type: Boolean, default: false },
}, { timestamps: { createdAt: true, updatedAt: false } });

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
