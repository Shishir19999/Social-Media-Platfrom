// Idempotent seed: node scripts/seed.js (or `npm run seed`). Upserts users by email and posts by title+author.
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const User = require('../models/User');
const Post = require('../models/Post');
const { faker } = require('@faker-js/faker');

faker.seed(20260601);
const REF = new Date('2026-09-30T12:00:00Z'); // fixed reference date for deterministic timestamps
const EXTRA_USERS = 22, EXTRA_POSTS = 96;

const PASSWORD = 'Password123!';
const users = [
    ['admin', 'admin@example.com'],
    ['user', 'user@example.com'],
    ['alice', 'alice@example.com'],
];

(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/socialMediaDB');
    const byName = {};
    for (const [username, email] of users) {
        let u = await User.findOne({ email });
        if (!u) u = await User.create({ username, email, password: PASSWORD }); // hashed by model hook
        byName[username] = u;
    }
    const posts = [
        ['admin', 'Welcome to the platform', 'This is the first post. Say hello!', ['user', 'alice'], [['user', 'Hello and thanks!'], ['alice', 'Glad to be here.']]],
        ['user', 'My first post', 'Testing the feed with a short update.', ['admin'], [['admin', 'Nice one.']]],
        ['alice', 'Weekend plans', 'Hiking if the weather holds. Any trail suggestions?', ['admin', 'user'], [['user', 'Try the ridge trail.'], ['admin', 'Bring water!']]],
        ['alice', 'Reading list', 'Currently reading three books at once. Not recommended.', [], []],
    ];
    for (const [author, title, content, likers, comments] of posts) {
        const a = byName[author]._id;
        if (await Post.exists({ author: a, title })) continue;
        await Post.create({
            title, content, author: a,
            likes: likers.map((n) => byName[n]._id),
            comments: comments.map(([n, text]) => ({ text, author: byName[n]._id })),
        });
    }
    // Extra deterministic users (upserted by email, never overwritten)
    const all = Object.values(byName);
    const used = new Set(Object.keys(byName));
    for (let i = 0; i < EXTRA_USERS; i++) {
        let username = faker.internet.username({ firstName: faker.person.firstName() }).replace(/[^A-Za-z0-9_]/g, '').slice(0, 20).toLowerCase();
        if (username.length < 3 || used.has(username)) username = `member${i + 1}`;
        used.add(username);
        const email = `${username}@example.com`;
        let u = await User.findOne({ email });
        if (!u) u = await User.create({ username, email, password: PASSWORD });
        all.push(u);
    }
    // Extra posts: upsert by author+title, backdated over ~120 days before REF
    const ops = [];
    for (let i = 0; i < EXTRA_POSTS; i++) {
        const author = faker.helpers.arrayElement(all);
        const title = `${faker.lorem.words({ min: 2, max: 5 })} (${i + 1})`;
        const content = faker.lorem.sentences({ min: 1, max: 4 });
        const created = faker.date.recent({ days: 120, refDate: REF });
        const likers = faker.helpers.arrayElements(all, { min: 0, max: Math.min(15, all.length) }).map((u) => u._id);
        const comments = Array.from({ length: faker.number.int({ min: 0, max: 8 }) }, () => ({
            text: faker.lorem.sentence({ min: 3, max: 12 }),
            author: faker.helpers.arrayElement(all)._id,
            date: faker.date.between({ from: created, to: REF }),
        }));
        ops.push({ updateOne: { filter: { author: author._id, title }, update: { $set: { content, likes: likers, comments, createdAt: created, updatedAt: created } }, upsert: true, timestamps: false } });
    }
    await Post.bulkWrite(ops);
    console.log(`Seeded: ${await User.countDocuments()} users, ${await Post.countDocuments()} posts`);
    console.log(`Demo logins (password ${PASSWORD}): admin@example.com, user@example.com, alice@example.com (or usernames admin/user/alice)`);
    await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
