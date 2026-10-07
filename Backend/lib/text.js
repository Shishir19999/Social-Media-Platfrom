// Hashtag and @mention parsing shared by the post and comment routes.
const TAG_RE = /(?:^|[^\p{L}\p{N}_&])#([\p{L}\p{N}_]{2,40})/gu;
const MENTION_RE = /(?:^|[^\p{L}\p{N}_])@([A-Za-z0-9_]{3,30})/g;

function unique(list) {
    return [...new Set(list)];
}

function extractHashtags(text) {
    if (typeof text !== 'string') return [];
    return unique([...text.matchAll(TAG_RE)].map((m) => m[1].toLowerCase())).slice(0, 20);
}

function extractMentions(text) {
    if (typeof text !== 'string') return [];
    return unique([...text.matchAll(MENTION_RE)].map((m) => m[1])).slice(0, 20);
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const snippet = (text, n = 80) => {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

module.exports = { extractHashtags, extractMentions, escapeRegex, snippet };
