const mongoose = require('mongoose');

const ObjectId = mongoose.Schema.Types.ObjectId;

const postSchema = new mongoose.Schema({
    title: { type: String, default: '' },
    // empty for a plain repost (repostOf set) or a post that is only a poll or images
    content: { type: String, default: '' },
    file: String,
    images: [String],
    hashtags: { type: [String], index: true },
    editedAt: Date,
    editHistory: [{ text: String, at: { type: Date, default: Date.now }, _id: false }],
    author: { type: ObjectId, ref: 'User', required: true, index: true },
    // `likes` holds every user who reacted (any type); `reactions` keeps which type each one chose
    likes: [{ type: ObjectId, ref: 'User' }],
    reactions: [new mongoose.Schema({ user: { type: ObjectId, ref: 'User' }, type: { type: String } }, { _id: false })],
    poll: {
        type: {
            options: [{ text: String, votes: [{ type: ObjectId, ref: 'User' }] }],
            endsAt: Date,
        },
        default: undefined,
    },
    repostOf: { type: ObjectId, ref: 'Post', index: true },
    // published posts show at once, scheduled ones from visibleAt, drafts never
    status: { type: String, enum: ['published', 'scheduled', 'draft'], default: 'published' },
    visibleAt: Date,
    // moderation: hidden and removed posts are only visible to staff and the author
    modState: { type: String, enum: ['ok', 'hidden', 'removed'], default: 'ok' },
    modNote: { type: String, default: '' },
    comments: [{
        text: { type: String, required: true },
        author: { type: ObjectId, ref: 'User', required: true },
        parent: { type: ObjectId },
        likes: [{ type: ObjectId, ref: 'User' }],
        date: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

postSchema.index({ visibleAt: -1, _id: -1 });

postSchema.pre('validate', function () {
    if (!this.visibleAt && this.status !== 'draft') this.visibleAt = new Date();
});

module.exports = mongoose.models.Post || mongoose.model('Post', postSchema);
