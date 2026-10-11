// Hashtag and @mention parsing shared by the post and comment routes (the rules live in ./rules).
const { extractHashtags, extractMentions, clip } = require('./rules');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { extractHashtags, extractMentions, escapeRegex, snippet: clip };
