// Roles and moderation, polls, reactions, reposts, drafts and scheduling, private accounts, blocking,
// direct messages (REST and Socket.IO), notification settings, edit history and pinned posts.
// Runs against a throwaway database (sm_test_features_<pid>) and a temp uploads dir; both are removed afterwards.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

process.env.JWT_SECRET = 'test-secret';
process.env.UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-feat-uploads-'));
const BASE = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017';

const mongoose = require('mongoose');
const request = require('supertest');
const { io: ioClient } = require('socket.io-client');
const { createApp } = require('../app');
const { attachRealtime, closeRealtime } = require('../lib/realtime');
const { publishDue } = require('../lib/posts');
const rules = require('../lib/rules');
const User = require('../models/User');
const Post = require('../models/Post');

const app = createApp();
let server;
let port;

before(async () => {
  await mongoose.connect(`${BASE}/sm_test_features_${process.pid}`);
  await mongoose.connection.dropDatabase();
  await User.syncIndexes();
  server = http.createServer(app);
  attachRealtime(server, []);
  await new Promise((r) => server.listen(Number(process.env.TEST_PORT) || 5101, '127.0.0.1', r));
  port = server.address().port;
});
after(async () => {
  closeRealtime();
  await new Promise((r) => server.close(r));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  fs.rmSync(process.env.UPLOADS_DIR, { recursive: true, force: true });
});

const h = (t) => ({ Authorization: `Bearer ${t}` });
const T = {};
const ID = {};
const post = (name, url, body) => request(app).post(url).set(h(T[name])).send(body || {});
const get = (name, url) => request(app).get(url).set(h(T[name]));
const make = async (text, name = 'alice') => (await request(app).post('/api/posts').set(h(T[name])).field('content', text)).body._id;

test('setup: users and staff roles', async () => {
  for (const n of ['alice', 'bobby', 'carol', 'modmo', 'adminn']) {
    const r = await request(app).post('/api/auth/register').send({ username: n, email: `${n}@example.com`, password: 'secret12' });
    assert.equal(r.status, 201);
    assert.equal(r.body.user.role, 'user');
    T[n] = r.body.token;
    ID[n] = r.body.user.id;
  }
  await User.updateOne({ username: 'modmo' }, { role: 'moderator' });
  await User.updateOne({ username: 'adminn' }, { role: 'admin' });
  const me = await get('modmo', '/api/auth/me');
  assert.equal(me.body.user.role, 'moderator');
});

test('shared rules: validation, permissions and link cards', () => {
  assert.match(rules.validatePost({ text: '' }), /Write something/);
  assert.equal(rules.validatePost({ text: '', poll: { options: ['a', 'b'], duration: '1d' } }), '');
  assert.match(rules.validatePost({ text: 'x'.repeat(501) }), /limited to 500/);
  assert.match(rules.validatePoll({ options: ['a'], duration: '1d' }), /at least 2/);
  assert.match(rules.validatePoll({ options: ['a', 'A'], duration: '1d' }), /different/);
  assert.match(rules.validatePost({ text: 'hi', status: 'scheduled', scheduleAt: Date.now() }), /at least a minute/);
  assert.ok(rules.canActOnUser({ id: '1', role: 'admin' }, { id: '2', role: 'moderator' }));
  assert.ok(!rules.canActOnUser({ id: '1', role: 'moderator' }, { id: '2', role: 'moderator' }));
  assert.ok(!rules.canActOnUser({ id: '1', role: 'admin' }, { id: '1', role: 'user' }));
  assert.ok(!rules.canChangeRole({ id: '1', role: 'moderator' }, { id: '2', role: 'user' }, 'admin'));
  assert.deepEqual(rules.linkPreview('see https://www.example.com/blog/my-first-post.html now'), { url: 'https://www.example.com/blog/my-first-post.html', host: 'example.com', title: 'My first post' });
  assert.equal(rules.linkPreview('no link'), null);
});

test('reactions: one per user, switch and remove, counts per type', async () => {
  const id = await make('React to me #hello');
  let r = await post('bobby', `/api/posts/${id}/react`, { type: 'laugh' });
  assert.equal(r.body.myReaction, 'laugh');
  assert.equal(r.body.reactions.laugh, 1);
  r = await post('bobby', `/api/posts/${id}/react`, { type: 'wow' });
  assert.deepEqual([r.body.reactions.laugh, r.body.reactions.wow, r.body.likes], [0, 1, 1]);
  r = await post('carol', `/api/posts/${id}/like`);
  assert.equal(r.body.likes, 2);
  r = await post('bobby', `/api/posts/${id}/react`, { type: 'wow' });
  assert.deepEqual([r.body.myReaction, r.body.likes], [null, 1]);
  assert.equal((await post('bobby', `/api/posts/${id}/react`, { type: 'nope' })).status, 400);
  const notes = (await get('alice', '/api/notifications')).body.items.map((n) => n.type);
  assert.ok(notes.includes('reaction') && notes.includes('like'));
});

test('polls: validated, one vote each, results and closing', async () => {
  const bad = await post('alice', '/api/posts', { content: 'Poll?', poll: { options: ['one'], duration: '1d' } });
  assert.equal(bad.status, 400);
  const created = await post('alice', '/api/posts', { content: 'Best colour?', poll: { options: ['Red', 'Blue', 'Green'], duration: '1d' } });
  assert.equal(created.status, 201);
  const id = created.body._id;
  const view = (await get('bobby', `/api/posts/${id}`)).body;
  assert.equal(view.poll.options.length, 3);
  assert.equal(view.poll.myVote, null);
  const optionId = view.poll.options[1].id;
  let r = await post('bobby', `/api/posts/${id}/vote`, { optionId });
  assert.deepEqual([r.body.poll.total, r.body.poll.myVote], [1, optionId]);
  assert.equal((await post('bobby', `/api/posts/${id}/vote`, { optionId })).status, 409);
  await Post.updateOne({ _id: id }, { 'poll.endsAt': new Date(Date.now() - 1000) });
  r = await post('carol', `/api/posts/${id}/vote`, { optionId });
  assert.equal(r.status, 400);
  assert.equal((await get('carol', `/api/posts/${id}`)).body.poll.ended, true);
});

test('reposts and quotes embed the original and are counted', async () => {
  const id = await make('Original thought #repost');
  let r = await post('bobby', `/api/posts/${id}/repost`);
  assert.deepEqual([r.body.reposts, r.body.repostedByMe], [1, true]);
  const feed = (await get('carol', '/api/feed?scope=explore&limit=50')).body.posts;
  const rp = feed.find((p) => p.isRepost && p.repostOf.id === id);
  assert.ok(rp && rp.author.username === 'bobby' && rp.repostOf.text.startsWith('Original'));
  r = await post('bobby', `/api/posts/${id}/repost`);
  assert.deepEqual([r.body.reposts, r.body.repostedByMe], [0, false], 'second repost undoes it');
  const q = await post('carol', '/api/posts', { content: 'I agree, adding this', quoteOf: id });
  assert.equal(q.status, 201);
  const quote = (await get('alice', `/api/posts/${q.body._id}`)).body;
  assert.equal(quote.repostOf.id, id);
  assert.equal(quote.isRepost, false);
  assert.equal((await get('alice', `/api/posts/${id}`)).body.reposts, 1);
  assert.equal((await post('carol', '/api/posts', { content: '', quoteOf: id })).status, 400);
  const types = (await get('alice', '/api/notifications')).body.items.map((n) => n.type);
  assert.ok(types.includes('quote'));
});

test('drafts and scheduled posts stay private until published', async () => {
  const draft = await post('alice', '/api/posts', { content: 'Secret draft #soon', status: 'draft' });
  assert.equal(draft.status, 201);
  const id = draft.body._id;
  assert.equal((await get('bobby', `/api/posts/${id}`)).status, 404);
  assert.ok((await get('alice', '/api/posts/mine?status=draft')).body.posts.some((p) => p.id === id));
  assert.ok(!(await get('bobby', '/api/feed?scope=explore&limit=50')).body.posts.some((p) => p.id === id));
  assert.equal((await post('alice', `/api/posts/${id}/publish`, { scheduleAt: Date.now() + 1000 })).status, 400, 'too soon');
  const soon = Date.now() + 5 * 60 * 1000;
  let r = await post('alice', `/api/posts/${id}/publish`, { scheduleAt: soon });
  assert.equal(r.body.status, 'scheduled');
  assert.ok((await get('alice', '/api/posts/mine?status=scheduled')).body.posts.some((p) => p.id === id));
  assert.equal((await get('bobby', `/api/posts/${id}`)).status, 404);
  await Post.updateOne({ _id: id }, { visibleAt: new Date(Date.now() - 1000) });
  assert.equal(await publishDue(), 1);
  assert.equal((await get('bobby', `/api/posts/${id}`)).status, 200);
  assert.equal((await post('alice', `/api/posts/${id}/publish`)).status, 400, 'already published');
  const past = await post('alice', '/api/posts', { content: 'Later', status: 'scheduled', scheduleAt: Date.now() - 5000 });
  assert.equal(past.status, 400);
});

test('edit history keeps previous versions; only the author can pin', async () => {
  const id = await make('First wording');
  await request(app).put(`/api/posts/${id}`).set(h(T.alice)).field('content', 'Second wording');
  await request(app).put(`/api/posts/${id}`).set(h(T.alice)).field('content', 'Third wording');
  const hist = (await get('bobby', `/api/posts/${id}/history`)).body;
  assert.deepEqual(hist.map((v) => v.text), ['Third wording', 'Second wording', 'First wording']);
  assert.equal((await post('bobby', `/api/posts/${id}/pin`)).status, 403);
  assert.equal((await post('alice', `/api/posts/${id}/pin`)).body.pinned, true);
  const first = (await get('bobby', '/api/feed?author=alice&limit=5')).body.posts[0];
  assert.deepEqual([first.id, first.pinned], [id, true]);
  assert.equal((await post('alice', `/api/posts/${id}/pin`)).body.pinned, false);
});

test('private accounts: follow requests, locked posts, accept and decline', async () => {
  const secret = await make('Only for followers', 'carol');
  assert.equal((await request(app).put('/api/settings').set(h(T.carol)).send({ isPrivate: true })).body.isPrivate, true);
  assert.equal((await get('alice', `/api/posts/${secret}`)).status, 403);
  assert.ok(!(await get('alice', '/api/feed?scope=explore&limit=50')).body.posts.some((p) => p.id === secret));
  assert.equal((await get('alice', '/api/feed?author=carol')).body.locked, true);
  assert.equal((await get('alice', '/api/users/carol')).body.locked, true);
  let r = await post('alice', '/api/users/carol/follow');
  assert.deepEqual([r.body.isFollowing, r.body.requested], [false, true]);
  r = await post('alice', '/api/users/carol/follow');
  assert.equal(r.body.requested, false, 'second tap cancels the request');
  await post('alice', '/api/users/carol/follow');
  await post('bobby', '/api/users/carol/follow');
  assert.equal((await get('carol', '/api/follow-requests')).body.length, 2);
  assert.equal((await post('carol', '/api/follow-requests/alice/accept')).status, 200);
  assert.equal((await post('carol', '/api/follow-requests/bobby/decline')).status, 200);
  assert.equal((await get('alice', `/api/posts/${secret}`)).status, 200);
  assert.equal((await get('bobby', `/api/posts/${secret}`)).status, 403);
  assert.ok((await get('alice', '/api/notifications')).body.items.some((n) => n.type === 'accepted'));
  // going public approves whoever is waiting
  await post('bobby', '/api/users/carol/follow');
  await request(app).put('/api/settings').set(h(T.carol)).send({ isPrivate: false });
  assert.equal((await get('bobby', '/api/users/carol')).body.isFollowing, true);
});

test('block and mute', async () => {
  const mine = await make('Alice says hi', 'alice');
  await post('bobby', '/api/users/alice/follow');
  let r = await post('alice', '/api/users/bobby/block');
  assert.equal(r.body.blockedByMe, true);
  assert.equal((await get('bobby', '/api/users/alice')).body.blockedByThem, true);
  assert.equal((await get('bobby', `/api/posts/${mine}`)).status, 404);
  assert.equal((await post('bobby', '/api/users/alice/follow')).status, 403);
  assert.equal((await get('bobby', '/api/users/alice')).body.following, 0, 'profile is blanked for the blocked person');
  assert.equal((await post('bobby', '/api/messages/with/alice', { text: 'hi' })).status, 403);
  assert.deepEqual((await get('alice', '/api/relations')).body.blocked.map((u) => u.username), ['bobby']);
  r = await post('alice', '/api/users/bobby/block');
  assert.equal(r.body.blockedByMe, false);
  // mute hides a user from feeds but keeps the profile reachable
  const bpost = await make('Bobby post', 'bobby');
  r = await post('alice', '/api/users/bobby/mute');
  assert.equal(r.body.mutedByMe, true);
  assert.ok(!(await get('alice', '/api/feed?scope=explore&limit=50')).body.posts.some((p) => p.id === bpost));
  assert.ok((await get('alice', '/api/feed?author=bobby')).body.posts.some((p) => p.id === bpost));
  await post('alice', '/api/users/bobby/mute');
});

test('notification settings switch kinds off', async () => {
  const s = await request(app).put('/api/settings').set(h(T.bobby)).send({ notifications: { like: false } });
  assert.equal(s.body.notifications.like, false);
  assert.equal(s.body.notifications.comment, true);
  const id = await make('Quiet post', 'bobby');
  const before = (await get('bobby', '/api/notifications')).body.items.length;
  await post('carol', `/api/posts/${id}/like`);
  await post('carol', `/api/posts/${id}/comments`, { text: 'still notified' });
  const items = (await get('bobby', '/api/notifications')).body.items;
  assert.equal(items.length, before + 1);
  assert.equal(items[0].type, 'comment');
});

test('mention autocomplete and suggestions', async () => {
  const r = await get('alice', '/api/users/search?q=bo');
  assert.deepEqual(r.body.map((u) => u.username), ['bobby']);
  const s = await get('alice', '/api/users/suggestions?limit=5');
  assert.ok(Array.isArray(s.body) && s.body.every((u) => u.reason && u.username !== 'alice'));
  const f = await get('alice', '/api/users/carol/followers');
  assert.ok(f.body.users.some((u) => u.username === 'alice'));
});

test('direct messages over REST and Socket.IO', async () => {
  const sock = ioClient(`http://127.0.0.1:${port}`, { auth: { token: T.bobby }, transports: ['websocket'] });
  await new Promise((res, rej) => { sock.on('connect', res); sock.on('connect_error', rej); });
  const got = new Promise((res) => sock.once('message:new', res));
  assert.equal((await post('alice', '/api/messages/with/bobby', { text: '' })).status, 400);
  assert.equal((await post('alice', '/api/messages/with/bobby', { text: 'x'.repeat(1001) })).status, 400);
  const sent = await post('alice', '/api/messages/with/bobby', { text: 'Hello Bobby' });
  assert.equal(sent.status, 201);
  const pushed = await got;
  assert.equal(pushed.message.text, 'Hello Bobby');
  sock.close();
  const bad = ioClient(`http://127.0.0.1:${port}`, { auth: { token: 'nope' }, transports: ['websocket'], reconnection: false });
  const err = await new Promise((res) => bad.on('connect_error', res));
  assert.match(err.message, /unauthorized/);
  bad.close();
  let convs = (await get('bobby', '/api/messages/conversations')).body;
  assert.deepEqual([convs.length, convs[0].unread, convs[0].with.username], [1, 1, 'alice']);
  assert.equal((await get('bobby', '/api/messages/unread')).body.count, 1);
  await post('bobby', '/api/messages/with/alice', { text: 'Hi Alice' });
  const thread = (await get('bobby', '/api/messages/with/alice')).body;
  assert.deepEqual(thread.messages.map((m) => m.text), ['Hello Bobby', 'Hi Alice']);
  await post('bobby', '/api/messages/with/alice/read');
  convs = (await get('bobby', '/api/messages/conversations')).body;
  assert.equal(convs[0].unread, 0);
  assert.equal((await get('alice', '/api/messages/conversations')).body[0].unread, 1);
  assert.equal((await post('alice', '/api/messages/with/alice', { text: 'me' })).status, 400);
  assert.equal((await request(app).get('/api/messages/conversations')).status, 401);
});

test('moderation: reports queue, hide/remove/restore, audit log, permissions', async () => {
  const bad = await make('Buy cheap stuff now!!! #spam', 'carol');
  const ok = await make('A perfectly fine post', 'carol');
  assert.equal((await post('alice', `/api/posts/${bad}/report`, { reason: 'Spam or scam' })).status, 200);
  assert.equal((await post('bobby', `/api/posts/${bad}/report`, { reason: 'Harassment or hate' })).status, 200);
  assert.equal((await post('alice', `/api/posts/${ok}/report`, { reason: 'Something else' })).status, 200);
  assert.equal((await get('alice', '/api/mod/reports')).status, 403, 'plain users are refused');
  const queue = (await get('modmo', '/api/mod/reports')).body;
  assert.equal(queue.items.length, 2);
  assert.equal(queue.items[0].count >= 1, true);
  const badItem = queue.items.find((i) => i.postId === bad);
  assert.equal(badItem.count, 2);
  assert.equal(badItem.post.text.startsWith('Buy'), true);
  assert.equal((await post('modmo', `/api/mod/reports/${ok}/resolve`, { action: 'dismiss', note: 'Looks fine' })).status, 200);
  assert.equal((await post('modmo', `/api/mod/reports/${bad}/resolve`, { action: 'nuke' })).status, 400);
  assert.equal((await post('modmo', `/api/mod/reports/${bad}/resolve`, { action: 'remove', note: 'Spam' })).status, 200);
  assert.equal((await get('bobby', `/api/posts/${bad}`)).status, 404, 'removed posts disappear for everyone');
  assert.equal((await get('carol', `/api/posts/${bad}`)).body.modState, 'removed', 'the author sees the state and note');
  assert.ok((await get('carol', '/api/notifications')).body.items.some((n) => n.type === 'moderation'));
  assert.equal((await get('modmo', '/api/mod/reports')).body.items.length, 0);
  assert.equal((await get('modmo', '/api/mod/reports?status=closed')).body.items.length, 2);
  assert.equal((await get('modmo', '/api/mod/posts')).body.items.length, 1);
  assert.equal((await post('modmo', `/api/mod/posts/${bad}/state`, { state: 'ok' })).status, 200);
  assert.equal((await get('bobby', `/api/posts/${bad}`)).status, 200);
  await post('modmo', `/api/mod/posts/${bad}/state`, { state: 'hidden', note: 'Review' });
  assert.ok(!(await get('bobby', '/api/feed?scope=explore&limit=50')).body.posts.some((p) => p.id === bad));
  const audit = (await get('modmo', '/api/mod/audit')).body.items.map((a) => a.action);
  assert.deepEqual(audit.slice(0, 3), ['post.hide', 'post.restore', 'report.remove']);
  assert.ok(audit.includes('report.dismiss'));
  // a moderator cannot moderate an administrator's post
  const adminPost = await make('Admin speaking', 'adminn');
  assert.equal((await post('modmo', `/api/mod/posts/${adminPost}/state`, { state: 'hidden' })).status, 403);
  assert.equal((await post('adminn', `/api/mod/posts/${adminPost}/state`, { state: 'hidden' })).status, 200);
});

test('user management: suspend, ban, restore, role changes', async () => {
  const stats = (await get('modmo', '/api/mod/stats')).body;
  assert.ok(stats.users >= 5 && stats.series.length === 7);
  const list = (await get('modmo', '/api/mod/users?q=bobby')).body;
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].email, undefined, 'moderators do not see emails');
  assert.ok((await get('adminn', '/api/mod/users?q=bobby')).body.items[0].email);
  assert.equal((await post('modmo', `/api/mod/users/${ID.bobby}/status`, { action: 'suspend', days: 3 })).status, 400);
  const s = await post('modmo', `/api/mod/users/${ID.bobby}/status`, { action: 'suspend', days: 7, reason: 'Cooling off' });
  assert.equal(s.body.status, 'suspended');
  assert.equal((await get('bobby', '/api/feed?scope=explore')).status, 200, 'suspended users can still read');
  const blocked = await post('bobby', '/api/posts', { content: 'Can I post?' });
  assert.equal(blocked.status, 403);
  assert.match(blocked.body.error, /suspended/);
  await User.updateOne({ _id: ID.bobby }, { suspendedUntil: new Date(Date.now() - 1000) });
  assert.equal((await post('bobby', '/api/posts', { content: 'Back again' })).status, 201, 'the suspension lapses on its own');
  assert.equal((await post('modmo', `/api/mod/users/${ID.bobby}/status`, { action: 'ban' })).status, 403, 'only admins ban');
  assert.equal((await post('modmo', `/api/mod/users/${ID.modmo}/status`, { action: 'suspend', days: 1 })).status, 403, 'not yourself');
  assert.equal((await post('modmo', `/api/mod/users/${ID.adminn}/status`, { action: 'suspend', days: 1 })).status, 403, 'not an admin');
  assert.equal((await post('adminn', `/api/mod/users/${ID.bobby}/status`, { action: 'ban', reason: 'Spam ring' })).status, 200);
  assert.equal((await get('bobby', '/api/auth/me')).status, 401, 'a ban signs the person out everywhere');
  const login = await request(app).post('/api/auth/login').send({ identifier: 'bobby', password: 'secret12' });
  assert.equal(login.status, 403);
  assert.equal((await post('adminn', `/api/mod/users/${ID.bobby}/status`, { action: 'restore' })).status, 200);
  const again = await request(app).post('/api/auth/login').send({ identifier: 'bobby', password: 'secret12' });
  assert.equal(again.status, 200);
  T.bobby = again.body.token;
  // roles
  assert.equal((await request(app).put(`/api/mod/users/${ID.carol}/role`).set(h(T.modmo)).send({ role: 'admin' })).status, 403);
  assert.equal((await request(app).put(`/api/mod/users/${ID.adminn}/role`).set(h(T.adminn)).send({ role: 'user' })).status, 403, 'not yourself');
  const promoted = await request(app).put(`/api/mod/users/${ID.carol}/role`).set(h(T.adminn)).send({ role: 'moderator' });
  assert.equal(promoted.body.role, 'moderator');
  assert.equal((await get('carol', '/api/mod/reports')).status, 200);
  assert.equal((await request(app).put(`/api/mod/users/${ID.carol}/role`).set(h(T.adminn)).send({ role: 'root' })).status, 403);
  const audit = (await get('adminn', '/api/mod/audit')).body.items.map((a) => a.action);
  assert.ok(['user.ban', 'user.restore', 'user.role', 'user.suspend'].every((a) => audit.includes(a)));
});
