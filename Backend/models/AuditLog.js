const mongoose = require('mongoose');

// Append-only record of every staff action (moderation, bans, role changes).
const auditSchema = new mongoose.Schema({
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    targetType: { type: String, enum: ['user', 'post'], required: true },
    targetId: String,
    targetLabel: { type: String, default: '' },
    note: { type: String, default: '' },
}, { timestamps: { createdAt: true, updatedAt: false } });

auditSchema.index({ createdAt: -1 });

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditSchema);
