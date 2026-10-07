const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, maxlength: 200, default: '' },
}, { timestamps: { createdAt: true, updatedAt: false } });

reportSchema.index({ post: 1, reporter: 1 }, { unique: true });

module.exports = mongoose.models.Report || mongoose.model('Report', reportSchema);
