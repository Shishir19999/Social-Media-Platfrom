const mongoose = require('mongoose');

const ObjectId = mongoose.Schema.Types.ObjectId;

// A one-to-one chat. `key` is the two participant ids sorted and joined, so each pair has exactly one conversation.
const conversationSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    participants: [{ type: ObjectId, ref: 'User', index: true }],
    lastMessage: { text: String, sender: { type: ObjectId, ref: 'User' }, at: Date },
    // when each participant last opened the conversation (ISO strings by user id)
    reads: { type: Object, default: () => ({}) },
}, { timestamps: true, minimize: false });

module.exports = mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);
