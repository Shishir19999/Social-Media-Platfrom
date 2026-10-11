// Runs against a throwaway database (sm_test_<pid>) and a temp uploads dir; both are removed afterwards.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.JWT_SECRET = 'test-secret';
process.env.UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'social-uploads-'));
process.env.CORS_ORIGIN = 'http://localhost:5173,http://192.168.1.20:5173';
const BASE = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017';

const mongoose = require('mongoose');
const request = require('supertest');
const { createApp } = require('../app');
const User = require('../models/User');
const Post = require('../models/Post');

const app = createApp();

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('JFIF\0fake-body')]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([4, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

before(async () => {
  await mongoose.connect(`${BASE}/sm_test_${process.pid}`);
  await mongoose.connection.dropDatabase();
  await User.syncIndexes();
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  fs.rmSync(process.env.UPLOADS_DIR, { recursive: true, force: true });
});

const reg = (username) => request(app).post('/api/auth/register')
  .send({ username, email: `${username}@x.com`, password: 'secret12' });
const h = (t) => ({ Authorization: `Bearer ${t}` });
const uploads = () => fs.readdirSync(process.env.UPLOADS_DIR);
const tokens = {};

test('register / login / me validation', async () => {
  assert.equal((await request(app).post('/api/auth/register').send({ username: 'ab', email: 'a@x.com', password: 'secret12' })).status, 400);
  assert.equal((await request(app).post('/api/auth/register').send({ username: 'abc', email: 'nope', password: 'secret12' })).status, 400);
  assert.equal((await request(app).post('/api/auth/register').send({ username: 'abc', email: 'a@x.com', password: '123' })).status, 400);
  for (const n of ['alice', 'bobby']) {
    const r = await reg(n);
    assert.equal(r.status, 201);
    tokens[n] = r.body.token;
  }
  assert.equal((await reg('alice')).status, 409);
  const l = await request(app).post('/api/auth/login').send({ identifier: 'ALICE@x.com', password: 'secret12' });
  assert.equal(l.status, 200);
  assert.equal((await request(app).post('/api/auth/login').send({ identifier: 'alice', password: 'bad' })).status, 401);
  const me = await request(app).get('/api/auth/me').set(h(tokens.alice));
  assert.equal(me.body.user.username, 'alice');
  assert.equal((await request(app).get('/api/auth/me')).status, 401);
});

let postId;
test('create post with each allowed upload type; reject bad ones', async () => {
  const mk = (file, name, type) => request(app).post('/api/posts').set(h(tokens.alice))
    .field('title', 't').field('content', 'c').attach('file', file, { filename: name, contentType: type });

  for (const [buf, name, type, ext] of [[PNG, 'a.png', 'image/png', '.png'], [JPG, 'a.jpg', 'image/jpeg', '.jpg'], [WEBP, 'a.webp', 'image/webp', '.webp'], [PDF, 'a.pdf', 'application/pdf', '.pdf']]) {
    const r = await mk(buf, name, type);
    assert.equal(r.status, 201, `${name} accepted`);
    assert.ok(r.body.file.endsWith(ext));
    const served = await request(app).get(`/uploads/${r.body.file}`);
    assert.equal(served.status, 200);
  }
  assert.equal(uploads().length, 4);

  const gif = await mk(Buffer.from('GIF89a....'), 'a.gif', 'image/gif');
  assert.equal(gif.status, 400);
  assert.match(gif.body.error, /Invalid file type/);
  const forged = await mk(PDF, 'evil.png', 'image/png');
  assert.equal(forged.status, 400, 'content must match declared type');
  assert.equal(uploads().length, 4, 'rejected uploads leave no files behind');

  // Some browsers (e.g. WebKit on Windows) send octet-stream for valid .webp files: sniff the content instead.
  const octet = await mk(WEBP, 'phone.webp', 'application/octet-stream');
  assert.equal(octet.status, 201);
  assert.ok(octet.body.file.endsWith('.webp'), 'extension comes from the sniffed type');
  assert.equal((await mk(Buffer.from('just text'), 'x.bin', 'application/octet-stream')).status, 400);
  assert.equal(uploads().length, 5);
  await request(app).delete(`/api/posts/${octet.body._id}`).set(h(tokens.alice));
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(uploads().length, 4);

  assert.equal((await request(app).post('/api/posts').send({ title: 't', content: 'c' })).status, 401);
  const noTitle = await request(app).post('/api/posts').set(h(tokens.alice)).field('title', ' ').field('content', 'c').attach('file', PNG, { filename: 'x.png', contentType: 'image/png' });
  assert.equal(noTitle.status, 400);
  assert.equal(uploads().length, 4, 'file removed when validation fails');

  const plain = await request(app).post('/api/posts').set(h(tokens.alice)).send({ title: 'plain', content: 'text only' });
  assert.equal(plain.status, 201);
  postId = plain.body._id;
});

test('feed pagination', async () => {
  await Post.insertMany(Array.from({ length: 12 }, (_, i) => ({ title: `bulk ${i}`, content: 'x', author: new mongoose.Types.ObjectId() })));
  let r = await request(app).get('/api/posts?page=1&limit=10');
  assert.deepEqual([r.body.posts.length, r.body.total, r.body.pages], [10, 17, 2]);
  r = await request(app).get('/api/posts?page=2&limit=10');
  assert.equal(r.body.posts.length, 7);
  r = await request(app).get('/api/posts?limit=9999');
  assert.equal(r.body.limit, 50);
  await Post.deleteMany({ title: /^bulk/ });
});

test('like toggles per user; comments are recorded with author', async () => {
  let r = await request(app).post(`/api/posts/like/${postId}`).set(h(tokens.alice));
  assert.equal(r.body.likes.length, 1);
  r = await request(app).post(`/api/posts/like/${postId}`).set(h(tokens.bobby));
  assert.equal(r.body.likes.length, 2);
  r = await request(app).post(`/api/posts/like/${postId}`).set(h(tokens.alice));
  assert.equal(r.body.likes.length, 1, 'second like by same user un-likes');
  assert.equal((await request(app).post(`/api/posts/like/${postId}`)).status, 401);
  assert.equal((await request(app).post('/api/posts/like/not-an-id').set(h(tokens.alice))).status, 404);

  assert.equal((await request(app).post(`/api/posts/comment/${postId}`).set(h(tokens.bobby)).send({ text: '   ' })).status, 400);
  r = await request(app).post(`/api/posts/comment/${postId}`).set(h(tokens.bobby)).send({ text: ' nice ' });
  assert.equal(r.status, 200);
  assert.equal(r.body.comments[0].text, 'nice');
  assert.equal(r.body.comments[0].author.username, 'bobby');
});

test('edit/delete: owner only; deleting removes the uploaded file', async () => {
  const withFile = await request(app).post('/api/posts').set(h(tokens.alice))
    .field('title', 'pic').field('content', 'c').attach('file', PNG, { filename: 'p.png', contentType: 'image/png' });
  const id = withFile.body._id;
  const file = withFile.body.file;
  assert.ok(uploads().includes(file));

  assert.equal((await request(app).put(`/api/posts/${id}`).set(h(tokens.bobby)).send({ title: 'hax' })).status, 403);
  assert.equal((await request(app).delete(`/api/posts/${id}`).set(h(tokens.bobby))).status, 403);
  assert.ok(uploads().includes(file));

  const edit = await request(app).put(`/api/posts/${id}`).set(h(tokens.alice)).field('title', 'renamed');
  assert.equal(edit.body.title, 'renamed');
  const replaced = await request(app).put(`/api/posts/${id}`).set(h(tokens.alice)).attach('file', JPG, { filename: 'n.jpg', contentType: 'image/jpeg' });
  assert.notEqual(replaced.body.file, file);
  assert.ok(!uploads().includes(file), 'old file removed on replacement');

  assert.equal((await request(app).delete(`/api/posts/${id}`).set(h(tokens.alice))).status, 200);
  await new Promise((r) => setTimeout(r, 100)); // unlink is async
  assert.ok(!uploads().includes(replaced.body.file), 'file removed on delete');
  assert.equal((await request(app).delete(`/api/posts/${id}`).set(h(tokens.alice))).status, 404);
});

test('logout revokes tokens; deleted user token rejected', async () => {
  const login = () => request(app).post('/api/auth/login').send({ identifier: 'bobby', password: 'secret12' });
  const t1 = (await login()).body.token;
  const t2 = (await login()).body.token;
  assert.equal((await request(app).post(`/api/posts/like/${postId}`).set(h(t1))).status, 200);
  assert.equal((await request(app).post('/api/auth/logout').set(h(t1))).status, 200);
  assert.equal((await request(app).get('/api/auth/me').set(h(t1))).status, 401);
  assert.equal((await request(app).get('/api/auth/me').set(h(t2))).status, 401);
  assert.equal((await request(app).get('/api/auth/me').set(h(tokens.alice))).status, 200, 'other users unaffected');
  assert.equal((await request(app).get('/api/auth/me').set(h((await login()).body.token))).status, 200);

  const r = await reg('temp1');
  await User.deleteOne({ username: 'temp1' });
  assert.equal((await request(app).get('/api/auth/me').set(h(r.body.token))).status, 401);
});

test('CORS allows the configured LAN origin only', async () => {
  let r = await request(app).get('/api/posts').set('Origin', 'http://192.168.1.20:5173');
  assert.equal(r.headers['access-control-allow-origin'], 'http://192.168.1.20:5173');
  r = await request(app).get('/api/posts').set('Origin', 'http://evil.example');
  assert.equal(r.headers['access-control-allow-origin'], undefined);
});
