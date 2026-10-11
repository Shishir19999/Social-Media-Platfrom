// Social features: profiles, follows, feeds, hashtags, threads, bookmarks, notifications, search.
// Runs against a throwaway database (sm_test_social_<pid>) and a temp uploads dir; both are removed afterwards.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.JWT_SECRET = 'test-secret';
process.env.UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'social2-uploads-'));
const BASE = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017';

const mongoose = require('mongoose');
const request = require('supertest');
const { createApp } = require('../app');
const User = require('../models/User');
const { extractHashtags, extractMentions } = require('../lib/text');

const app = createApp();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n');

before(async () => {
  await mongoose.connect(`${BASE}/sm_test_social_${process.pid}`);
  await mongoose.connection.dropDatabase();
  await User.syncIndexes();
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  fs.rmSync(process.env.UPLOADS_DIR, { recursive: true, force: true });
});

const h = (t) => ({ Authorization: `Bearer ${t}` });
const tokens = {};
const ids = {};
const uploads = () => fs.readdirSync(process.env.UPLOADS_DIR);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('hashtag and mention parsing', () => {
  assert.deepEqual(extractHashtags('Hello #Travel and #travel, #a #food_2 a#nope &#amp'), ['travel', 'food_2']);
  assert.deepEqual(extractMentions('hi @alice_1 and @bob, mail me@x.com @al'), ['alice_1', 'bob']);
  assert.deepEqual(extractHashtags(undefined), []);
});

test('setup users', async () => {
  for (const n of ['alice', 'bobby', 'carol']) {
    const r = await request(app).post('/api/auth/register').send({ username: n, email: `${n}@example.com`, password: 'secret12' });
    assert.equal(r.status, 201);
    assert.equal(r.body.user.displayName, n);
    tokens[n] = r.body.token;
    ids[n] = r.body.user.id;
  }
});

let p1;
test('posts: optional title, hashtags, several images, bad uploads cleaned up', async () => {
  const make = (t, text) => request(app).post('/api/posts').set(h(t)).field('content', text);
  const r1 = await make(tokens.alice, 'Sunrise run #Running #morning with @bobby');
  assert.equal(r1.status, 201);
  assert.deepEqual(r1.body.hashtags, ['running', 'morning']);
  assert.equal(r1.body.title, '');
  p1 = r1.body._id;

  const withImages = await request(app).post('/api/posts').set(h(tokens.alice)).field('content', 'Gallery #photos')
    .attach('images', PNG, { filename: 'a.png', contentType: 'image/png' })
    .attach('images', PNG, { filename: 'b.png', contentType: 'image/png' });
  assert.equal(withImages.status, 201);
  assert.equal(withImages.body.images.length, 2);
  assert.equal(uploads().length, 2);

  const blankTitle = await request(app).post('/api/posts').set(h(tokens.alice)).field('title', ' ').field('content', 'x');
  assert.equal(blankTitle.status, 400);

  const pdfAsImage = await request(app).post('/api/posts').set(h(tokens.alice)).field('content', 'x')
    .attach('images', PDF, { filename: 'a.pdf', contentType: 'application/pdf' })
    .attach('images', PNG, { filename: 'ok.png', contentType: 'image/png' });
  assert.equal(pdfAsImage.status, 400);
  assert.equal(uploads().length, 2, 'every file of a rejected request is removed');

  const feed = await request(app).get('/api/feed');
  const gallery = feed.body.posts.find((p) => p.id === withImages.body._id);
  assert.equal(gallery.images.length, 2);
  assert.match(gallery.images[0], /^\/uploads\/images-.*\.png$/);
  assert.equal(gallery.likedByMe, false);

  // deleting the post removes both files
  assert.equal((await request(app).delete(`/api/posts/${withImages.body._id}`).set(h(tokens.alice))).status, 200);
  await wait(150);
  assert.equal(uploads().length, 0);
});

test('mention creates a notification; edit recomputes hashtags', async () => {
  let n = await request(app).get('/api/notifications').set(h(tokens.bobby));
  assert.equal(n.body.unread, 1);
  assert.equal(n.body.items[0].type, 'mention');
  assert.equal(n.body.items[0].actor.username, 'alice');
  assert.equal(n.body.items[0].postId, p1);
  assert.equal((await request(app).post('/api/notifications/read').set(h(tokens.bobby))).status, 200);
  n = await request(app).get('/api/notifications').set(h(tokens.bobby));
  assert.equal(n.body.unread, 0);
  assert.equal((await request(app).get('/api/notifications')).status, 401);

  const edit = await request(app).put(`/api/posts/${p1}`).set(h(tokens.alice)).field('content', 'Sunrise run #cycling');
  assert.deepEqual(edit.body.hashtags, ['cycling']);
  const one = await request(app).get(`/api/posts/${p1}`);
  assert.equal(one.body.edited, true);
  assert.equal((await request(app).get('/api/posts/not-an-id')).status, 404);
});

test('follow / unfollow, following feed vs explore feed, profile counts', async () => {
  await request(app).post('/api/posts').set(h(tokens.carol)).send({ content: 'Carol writes about #cooking' });
  assert.equal((await request(app).get('/api/feed?scope=following')).status, 401);

  let f = await request(app).get('/api/feed?scope=following').set(h(tokens.bobby));
  assert.equal(f.body.total, 0, 'following nobody yet');

  let r = await request(app).post('/api/users/alice/follow').set(h(tokens.bobby));
  assert.equal(r.status, 200);
  assert.equal(r.body.isFollowing, true);
  assert.equal(r.body.followers, 1);
  assert.equal((await request(app).post('/api/users/bobby/follow').set(h(tokens.bobby))).status, 400);
  assert.equal((await request(app).post('/api/users/nobody/follow').set(h(tokens.bobby))).status, 404);

  f = await request(app).get('/api/feed?scope=following').set(h(tokens.bobby));
  assert.deepEqual(f.body.posts.map((p) => p.author.username), ['alice']);
  const explore = await request(app).get('/api/feed').set(h(tokens.bobby));
  assert.equal(explore.body.total, 2);

  const notif = await request(app).get('/api/notifications').set(h(tokens.alice));
  assert.ok(notif.body.items.some((i) => i.type === 'follow' && i.actor.username === 'bobby'));

  const prof = await request(app).get('/api/users/alice').set(h(tokens.bobby));
  assert.deepEqual([prof.body.followers, prof.body.following, prof.body.posts, prof.body.isFollowing, prof.body.isMe], [1, 0, 1, true, false]);
  assert.equal((await request(app).get('/api/users/alice')).body.isFollowing, false);

  r = await request(app).post('/api/users/alice/follow').set(h(tokens.bobby));
  assert.equal(r.body.isFollowing, false);
  assert.equal(r.body.followers, 0);

  const sugg = await request(app).get('/api/users/suggestions').set(h(tokens.alice));
  assert.ok(sugg.body.every((u) => u.username !== 'alice'));
  assert.equal((await request(app).get('/api/users/ghost')).status, 404);
});

test('profile update: bio, avatar and cover uploads, removal', async () => {
  const r = await request(app).put('/api/users/me').set(h(tokens.alice))
    .field('displayName', 'Alice A.').field('bio', 'Runner and baker')
    .attach('avatar', PNG, { filename: 'av.png', contentType: 'image/png' })
    .attach('cover', PNG, { filename: 'cv.png', contentType: 'image/png' });
  assert.equal(r.status, 200);
  assert.equal(r.body.displayName, 'Alice A.');
  assert.match(r.body.avatar, /^\/uploads\/avatar-/);
  assert.match(r.body.cover, /^\/uploads\/cover-/);
  const before = uploads().length;
  assert.equal(before, 2);

  const long = await request(app).put('/api/users/me').set(h(tokens.alice)).field('bio', 'x'.repeat(300));
  assert.equal(long.status, 400);
  const pdf = await request(app).put('/api/users/me').set(h(tokens.alice)).attach('avatar', PDF, { filename: 'a.pdf', contentType: 'application/pdf' });
  assert.equal(pdf.status, 400);
  assert.equal(uploads().length, 2);

  const removed = await request(app).put('/api/users/me').set(h(tokens.alice)).field('removeAvatar', 'true');
  assert.equal(removed.body.avatar, null);
  await wait(150);
  assert.equal(uploads().length, 1);
  assert.equal((await request(app).put('/api/users/me').send({ bio: 'x' })).status, 401);
});

test('comment threads: replies, likes, delete cascades, notifications', async () => {
  const c1 = await request(app).post(`/api/posts/${p1}/comments`).set(h(tokens.bobby)).send({ text: 'Nice run!' });
  assert.equal(c1.status, 201);
  assert.equal(c1.body.parentId, null);
  const reply = await request(app).post(`/api/posts/${p1}/comments`).set(h(tokens.alice)).send({ text: 'Thanks @bobby', parentId: c1.body.id });
  assert.equal(reply.body.parentId, c1.body.id);
  const reply2 = await request(app).post(`/api/posts/${p1}/comments`).set(h(tokens.carol)).send({ text: 'Agreed', parentId: reply.body.id });
  assert.equal(reply2.status, 201);
  assert.equal((await request(app).post(`/api/posts/${p1}/comments`).set(h(tokens.carol)).send({ text: 'x', parentId: '64b7f1c2a1b2c3d4e5f60718' })).status, 404);
  assert.equal((await request(app).post(`/api/posts/${p1}/comments`).set(h(tokens.carol)).send({ text: ' ' })).status, 400);
  assert.equal((await request(app).post(`/api/posts/${p1}/comments`).send({ text: 'x' })).status, 401);

  let like = await request(app).post(`/api/posts/${p1}/comments/${c1.body.id}/like`).set(h(tokens.alice));
  assert.deepEqual([like.body.likes, like.body.likedByMe], [1, true]);
  like = await request(app).post(`/api/posts/${p1}/comments/${c1.body.id}/like`).set(h(tokens.alice));
  assert.deepEqual([like.body.likes, like.body.likedByMe], [0, false]);

  const list = await request(app).get(`/api/posts/${p1}/comments`);
  assert.equal(list.body.length, 3);
  assert.equal(list.body[1].author.username, 'alice');

  const notif = await request(app).get('/api/notifications').set(h(tokens.bobby));
  assert.ok(notif.body.items.some((i) => i.type === 'reply' && i.actor.username === 'alice'));

  assert.equal((await request(app).delete(`/api/posts/${p1}/comments/${c1.body.id}`).set(h(tokens.carol))).status, 403);
  const del = await request(app).delete(`/api/posts/${p1}/comments/${c1.body.id}`).set(h(tokens.bobby));
  assert.equal(del.status, 200);
  assert.equal(del.body.removed.length, 3, 'replies are removed with the parent');
  assert.equal((await request(app).get(`/api/posts/${p1}/comments`)).body.length, 0);

  // the legacy comment endpoint still works and is visible in threads
  const legacy = await request(app).post(`/api/posts/comment/${p1}`).set(h(tokens.carol)).send({ text: 'legacy' });
  assert.equal(legacy.status, 200);
  const one = await request(app).get(`/api/posts/${p1}`);
  assert.equal(one.body.commentsCount, 1);
});

test('like, bookmark, hide and report are per viewer', async () => {
  let r = await request(app).post(`/api/posts/${p1}/like`).set(h(tokens.bobby));
  assert.deepEqual([r.body.likes, r.body.likedByMe], [1, true]);
  assert.equal((await request(app).get(`/api/posts/${p1}`)).body.likedByMe, false);
  r = await request(app).post(`/api/posts/${p1}/like`).set(h(tokens.bobby));
  assert.equal(r.body.likes, 0);

  r = await request(app).post(`/api/posts/${p1}/bookmark`).set(h(tokens.bobby));
  assert.equal(r.body.bookmarkedByMe, true);
  let saved = await request(app).get('/api/feed?saved=1').set(h(tokens.bobby));
  assert.deepEqual(saved.body.posts.map((p) => p.id), [p1]);
  assert.equal((await request(app).get('/api/feed?saved=1').set(h(tokens.carol))).body.total, 0);
  assert.equal((await request(app).get('/api/feed?saved=1')).status, 401);
  r = await request(app).post(`/api/posts/${p1}/bookmark`).set(h(tokens.bobby));
  assert.equal(r.body.bookmarkedByMe, false);
  saved = await request(app).get('/api/feed?saved=1').set(h(tokens.bobby));
  assert.equal(saved.body.total, 0);

  assert.equal((await request(app).post(`/api/posts/${p1}/report`).set(h(tokens.alice)).send({ reason: 'x' })).status, 400, 'own post');
  assert.equal((await request(app).post(`/api/posts/${p1}/report`).set(h(tokens.carol)).send({ reason: 'spam' })).status, 200);
  assert.equal((await request(app).post(`/api/posts/${p1}/report`).set(h(tokens.carol)).send({ reason: 'spam' })).status, 200, 'idempotent');
  assert.equal((await request(app).get('/api/feed').set(h(tokens.carol))).body.posts.some((p) => p.id === p1), false, 'reported post hidden for reporter');
  assert.equal((await request(app).get('/api/feed')).body.posts.some((p) => p.id === p1), true, 'still visible to others');
  assert.equal((await request(app).post(`/api/posts/${p1}/hide`).set(h(tokens.bobby))).status, 200);
  assert.equal((await request(app).get('/api/feed').set(h(tokens.bobby))).body.posts.some((p) => p.id === p1), false);
});

test('trending, search, tag and author filters', async () => {
  await request(app).post('/api/posts').set(h(tokens.carol)).send({ content: 'More #cooking tips and #baking' });
  await request(app).post('/api/posts').set(h(tokens.bobby)).send({ content: 'Dinner #cooking night' });
  const trending = await request(app).get('/api/trending');
  assert.deepEqual(trending.body[0], { tag: 'cooking', count: 3 });

  const tagFeed = await request(app).get('/api/feed?tag=%23Cooking');
  assert.equal(tagFeed.body.total, 3);
  const byAuthor = await request(app).get('/api/feed?author=carol');
  assert.equal(byAuthor.body.total, 2);
  assert.equal((await request(app).get('/api/feed?author=ghost')).body.total, 0);

  const s = await request(app).get('/api/search?q=cook');
  assert.equal(s.body.posts.length, 3);
  assert.deepEqual(s.body.tags.map((t) => t.tag), ['cooking']);
  const su = await request(app).get('/api/search?q=%40ali');
  assert.deepEqual(su.body.users.map((u) => u.username), ['alice']);
  assert.deepEqual((await request(app).get('/api/search?q=')).body, { users: [], posts: [], tags: [] });
  const weird = await request(app).get('/api/search?q=' + encodeURIComponent('(*[+'));
  assert.equal(weird.status, 200, 'regex characters are escaped');
});
