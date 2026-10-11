const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, maxlength: 1000 },
}, { timestamps: { createdAt: true, updatedAt: false } });

messageSchema.index({ conversation: 1, _id: -1 });

module.exports = mongoose.models.Message || mongoose.model('Message', messageSchema);
