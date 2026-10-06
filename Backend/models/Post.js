const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    file: String,
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // per-user set of likes: one entry per user
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments: [{
        text: { type: String, required: true },
        author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        date: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

module.exports = mongoose.models.Post || mongoose.model('Post', postSchema);
