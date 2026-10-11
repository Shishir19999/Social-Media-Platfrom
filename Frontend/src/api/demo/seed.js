// Seed data for the browser-only demo. Everything is fictional; timestamps are relative to "now"
// so the feed always looks fresh. Images are procedural "art:" references (see art.js).
import { extractHashtags, extractMentions } from '../../lib/richtext'
import { hashString } from '../../lib/format'
import { DEFAULT_NOTIFICATION_PREFS } from '../../lib/rules'

export const DEMO_PASSWORD = 'Password123!'
export const DEMO_LOGINS = [
  { username: 'alice', name: 'Alice Morgan', note: 'follows several people, has notifications and saved posts' },
  { username: 'marcus', name: 'Marcus Reyes', note: 'designer with followers and replies' },
  { username: 'mod', name: 'Milo Moderator', note: 'moderator: reports queue, hide or remove posts, suspend people' },
  { username: 'admin', name: 'Ada Admin', note: 'administrator: all of that plus bans, roles and the audit log' },
]

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

const USERS = [
  ['alice', 'Alice Morgan', 'Trail runner, sourdough tinkerer, weekend stargazer.'],
  ['marcus', 'Marcus Reyes', 'Product designer. Coffee, type and questionable puns.'],
  ['priya', 'Priya Nair', 'Backend engineer. Writes about databases and calm on-call rotations.'],
  ['tom', 'Tom Becker', 'Photographer chasing good light across the Alps.'],
  ['sofia', 'Sofia Lindqvist', 'Illustrator and cat person. Commissions open.'],
  ['jamal', 'Jamal Carter', 'Home cook and grill obsessive. Brisket is a personality.'],
  ['chen', 'Chen Wei', 'Data nerd. Maps, charts and weekend hikes.'],
  ['nora', 'Nora Hughes', 'Reads too much. Bookshop weekends.'],
  ['diego', 'Diego Alvarez', 'Indie game dev. Pixel art and late-night builds.'],
  ['hannah', 'Hannah Fischer', 'Plant parent and urban gardener.'],
  ['omar', 'Omar Haddad', 'Cyclist, commuter and part-time bike mechanic.'],
  ['lena', 'Lena Kowalski', 'Travel writer. Thirty-one countries and counting.'],
  ['mod', 'Milo Moderator', 'Keeping Orbit friendly. Moderator.'],
  ['admin', 'Ada Admin', 'Keeping the lights on. Administrator.'],
  ['bargainbot', 'Bargain Bot', 'Best deals. Click now.'],
]

const ROLE_OF = { mod: 'moderator', admin: 'admin' }
const PRIVATE = new Set(['hannah', 'nora'])
const SYSTEM = new Set(['mod', 'admin', 'bargainbot'])

// [author, age in minutes, text, images (art refs), comments]
// comment: [author, text, replies?: [[author, text], ...]]
const POSTS = [
  ['alice', 35, 'First clear night in two weeks, so the telescope finally came out. Jupiter and its moons lined up perfectly. #astronomy #stargazing', ['art:night:11'], [
    ['tom', 'Jealous. Cloud cover here has been relentless.', [['alice', 'It will clear up, the forecast looks good for Friday.']]],
    ['nora', 'Which telescope are you using?', [['alice', 'A 6 inch dobsonian. Cheap, heavy and wonderful.'], ['nora', 'Adding it to the wish list.']]],
  ]],
  ['marcus', 70, 'Spent the morning on a type specimen for a client rebrand. Kerning pairs are the new meditation. #design #typography', ['art:abstract:21'], [
    ['sofia', 'Sharing this with my whole studio.', []],
  ]],
  ['tom', 120, 'Blue hour above Lauterbrunnen. Waited ninety minutes for the clouds to drop and it was worth every cold minute. #photography #alps #landscape', ['art:peaks:31', 'art:peaks:32', 'art:hills:33'], [
    ['alice', 'The second frame is unreal.', [['tom', 'Thank you! That one took the longest wait.']]],
    ['lena', 'Adding this valley to my list for next spring.', []],
    ['chen', 'What time did you start hiking?', [['tom', 'Left the hut at 4:30, in the dark.']]],
  ]],
  ['priya', 180, 'Hot take: the best on-call improvement is a runbook someone has actually followed at 3am. Write them for tired people. #engineering #oncall', [], [
    ['marcus', 'Same applies to design handoffs. Write for the person who is tired and in a hurry.', []],
    ['diego', 'We call ours the "sleepy dev test". Strongly recommend.', []],
  ]],
  ['sofia', 240, 'New sticker sheet is up! Twelve little cats doing very important cat things. Thank you @marcus for the layout help. #illustration #cats', ['art:abstract:41'], [
    ['marcus', 'Happy to help. The loaf cat is my favorite.', [['sofia', 'The loaf cat is everyone\'s favorite.']]],
    ['hannah', 'Ordered two sheets already.', []],
  ]],
  ['jamal', 300, 'Smoked brisket, fourteen hours, no shortcuts. Bark came out exactly how I wanted. Recipe thread coming this weekend. #bbq #cooking', ['art:dunes:51'], [
    ['omar', 'Please tell me there is a sandwich plan.', [['jamal', 'There is always a sandwich plan.']]],
  ]],
  ['chen', 360, 'Plotted every trail I hiked this year on one map. Turns out I walk in circles around the same three valleys. #dataviz #hiking', ['art:hills:61'], []],
  ['nora', 480, 'Finished The Overstory last night and I am not okay. Any recommendations for something quieter next? #books #reading', [], [
    ['alice', 'Try Braiding Sweetgrass. Gentle and hopeful.', []],
    ['lena', 'Piranesi, if you have not read it yet.', [['nora', 'Both go on the pile. Thank you!']]],
  ]],
  ['diego', 540, 'Day 41 of the pixel platformer: coyote time and jump buffering made the controls feel ten times better. Tiny change, huge difference. #gamedev #indiegame', ['art:city:71'], [
    ['priya', 'Game feel is mostly a pile of tiny forgiving tricks. Love it.', []],
  ]],
  ['hannah', 660, 'My balcony tomatoes are finally turning red. Eleven plants, one very smug gardener. #gardening #plants', ['art:forest:81'], [
    ['jamal', 'Send some over, I will make the sauce.', [['hannah', 'Deal. Bring basil.']]],
  ]],
  ['omar', 780, 'Commute stats for the month: 312 km by bike, zero minutes in traffic. Also one flat tyre, in the rain, outside a bakery. Could be worse. #cycling', [], []],
  ['lena', 900, 'Lisbon in October is unfairly good. Tram 28 at 8am before the crowds, then pastéis de nata for second breakfast. #travel #lisbon', ['art:waves:91', 'art:hills:92'], [
    ['alice', 'Second breakfast is a legitimate meal.', []],
    ['marcus', 'Which bakery? Asking for a friend (me).', [['lena', 'Pastéis de Belém, go early.']]],
  ]],
  ['alice', 1080, 'Sourdough update: after six failed loaves, the seventh has an open crumb. I will not be taking questions about the other six. #baking', [], [
    ['jamal', 'Respect. The first ones are tuition.', []],
    ['hannah', 'Your starter needs a name by now.', [['alice', 'It is called Gerald.']]],
  ]],
  ['marcus', 1260, 'Unpopular opinion: dark mode should be designed on its own, not inverted from light. Contrast ratios behave differently at night. #design #accessibility', [], [
    ['priya', 'Pure black backgrounds with pure white text also vibrate. Soften both.', [['marcus', 'Yes. Slightly off-white on deep blue-grey is my default.']]],
    ['sofia', 'And shadows stop working, so use borders and surface tints instead.', []],
  ]],
  ['tom', 1440, 'Sunrise from the ridge this morning. 4am alarm, two hours of hiking, one thermos of terrible coffee. Thanks @alice for the route tip. #photography #sunrise', ['art:hills:101'], [
    ['omar', 'Terrible coffee tastes better up there. Science.', []],
  ]],
  ['priya', 1620, 'Reading through the Postgres query planner docs again. Every time I find one more thing that explains a slow query from last year. #databases #postgres', [], []],
  ['sofia', 1800, 'Process shot from today\'s commission: rough sketch, flats, then lighting. Almost at the fun part. #illustration #wip', ['art:abstract:111'], [
    ['marcus', 'The colour direction is gorgeous.', []],
  ]],
  ['jamal', 1980, 'Homemade pasta tip: rest the dough for thirty minutes under a bowl. It makes rolling so much easier. @hannah the basil is for you! #cooking #pasta', [], [
    ['hannah', 'Basil received and appreciated.', []],
  ]],
  ['chen', 2160, 'TIL the shortest scheduled flight in the world lasts under two minutes. Mapped the ten shortest routes this evening. #dataviz #maps', ['art:waves:121'], []],
  ['nora', 2340, 'Bookshop find of the day: a 1962 paperback with someone\'s pencil notes in the margins. Now I am reading two conversations at once. #books', [], [
    ['alice', 'Marginalia is the best part of used books.', []],
  ]],
  ['diego', 2880, 'Sent a tiny demo of the platformer to a few friends. Hearing someone say "one more try" is the best feedback there is. #gamedev', [], [
    ['priya', 'That is the metric. Congratulations!', []],
  ]],
  ['hannah', 3120, 'Composting for apartment dwellers: a small bin, shredded paper and a bit of patience. No smell, I promise. #gardening #sustainability', [], []],
  ['omar', 3360, 'Bike maintenance reminder: lube your chain every 200 km. Your drivetrain will thank you. #cycling #diy', [], [
    ['alice', 'Writing this on my to-do list right now.', []],
  ]],
  ['lena', 3600, 'Packing for a month in Southeast Asia with one carry-on: yes, it is possible. Full list in the replies. #travel #packing', ['art:dunes:131'], [
    ['lena', 'The list: three shirts, two shorts, one light jacket, sandals, a good towel, and a laundry plan.', []],
  ]],
  ['alice', 4320, 'Trail run along the coast at dawn. Legs are jelly, mind is clear. Worth it. #running #trailrunning', ['art:waves:141', 'art:hills:142'], [
    ['omar', 'Dawn runs are the best kind of tired.', []],
    ['tom', 'Great light on that second shot.', []],
  ]],
  ['marcus', 4620, 'My favourite coffee shop writes a new wifi password on the chalkboard each week. Today it is "slowdown". Fair advice. #coffee', [], []],
  ['tom', 4860, 'Gear question: is a 24-70 enough for mountain portraits, or should I pack the 70-200 too? Weight versus options, as always. #photography', [], [
    ['lena', 'Bring both. You will regret leaving the long lens behind.', [['tom', 'Knees disagree, but I will pack it.']]],
  ]],
  ['priya', 5760, 'We cut CI time from 22 minutes to 7 by caching dependencies and splitting the slowest test suite. Boring work, very happy team. #engineering #devops', [], [
    ['diego', 'The best performance work is invisible.', []],
  ]],
  ['sofia', 6120, 'Draw something badly for ten minutes every day. Month two, and my "bad" drawings are noticeably better. #illustration #practice', [], []],
  ['jamal', 7200, 'Grill tip: a two-zone setup lets you sear hot and finish gently. Never going back to a single zone. #bbq', [], []],
  ['chen', 7200, 'An open dataset of city bike-share trips just landed. Weekend plans sorted. #dataviz #opendata', [], [
    ['omar', 'Please share the maps when you are done.', []],
  ]],
  ['nora', 8640, 'Reading goal update: 41 of 50 books. Audiobooks on walks absolutely count. #books #reading', [], []],
  ['diego', 8640, 'Learned today that screen shake over eight pixels makes some players feel sick. Tuning it down to three. #gamedev', [], []],
  ['hannah', 10080, 'Windowsill herb garden: basil, mint, thyme, chives. Pick one and start. You will use it daily. #gardening', ['art:forest:151'], []],
  ['omar', 10800, 'Rode the city\'s new protected bike lanes this weekend. They are good! Wide, smooth, and nobody has parked in them yet. #cycling', [], []],
  ['lena', 13000, 'Night train from Vienna to Zurich: window seat, sunset over the Alps, a cheese sandwich. Nothing beats it. #travel #trains', ['art:hills:161', 'art:peaks:162'], [
    ['tom', 'Which side of the train had the better view?', [['lena', 'Left side heading west. Book it early.']]],
  ]],
  ['alice', 14400, 'The Orionid meteor shower peaks this week. Best viewing after midnight, away from city lights. Bring a blanket and something hot to drink. #astronomy #meteors', ['art:night:171'], []],
  ['marcus', 20160, 'The colour contrast checklist I use on every project: body text 4.5:1, large text 3:1, focus rings visible on every background. #accessibility #design', [], [
    ['priya', 'Pinning this for my team.', []],
  ]],
  ['tom', 20160, 'Foggy forest morning, shot handheld at 1/15 s. Sometimes the blur is the point. #photography #fog', ['art:forest:181'], []],
  ['priya', 23040, 'Wrote my first Go service in 2019. Still enjoying how boring and readable it stays at scale. #golang #engineering', [], []],
  ['sofia', 30240, 'Studio tour: standing desk, two monitors, one cat who owns the chair. #illustration #studio', ['art:abstract:191'], [
    ['alice', 'The cat gets the best seat in the house, as it should be.', []],
  ]],
]

const GENERIC_COMMENTS = [
  'Love this.', 'Great post, thanks for sharing.', 'Needed to read this today.', 'Saving this one for later.',
  'Beautiful.', 'Same here!', 'Ha, very relatable.', 'Totally agree.', 'Following for more of this.',
]

const FOLLOWS = {
  alice: ['marcus', 'priya', 'tom', 'sofia', 'lena', 'nora'],
  marcus: ['alice', 'sofia', 'tom', 'diego', 'priya'],
  priya: ['marcus', 'diego', 'chen', 'alice'],
  tom: ['alice', 'lena', 'omar', 'marcus'],
  sofia: ['marcus', 'alice', 'hannah', 'nora'],
  jamal: ['hannah', 'omar', 'alice', 'tom'],
  chen: ['priya', 'omar', 'tom', 'diego'],
  nora: ['alice', 'lena', 'sofia', 'chen'],
  diego: ['priya', 'marcus', 'sofia', 'chen'],
  hannah: ['jamal', 'sofia', 'alice', 'lena'],
  omar: ['tom', 'jamal', 'chen', 'alice'],
  lena: ['tom', 'alice', 'nora', 'marcus'],
}

const pickReaction = (r) => (r < 0.78 ? 'like' : r < 0.88 ? 'celebrate' : r < 0.94 ? 'laugh' : r < 0.97 ? 'wow' : 'sad')

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const STATE_VERSION = 2

export function buildSeed(now = Date.now()) {
  const rand = rng(20261007)
  const id = (prefix, n) => `${prefix}${n.toString(36).padStart(3, '0')}`
  const users = USERS.map(([username, displayName, bio], i) => ({
    id: id('u', i + 1),
    username,
    displayName,
    bio,
    email: `${username}@example.com`,
    password: DEMO_PASSWORD,
    avatar: null,
    cover: `art:${['hills', 'peaks', 'waves', 'dunes', 'forest', 'night', 'city'][i % 7]}:${300 + i}:1200x400`,
    createdAt: now - (400 - i * 17) * DAY,
    role: ROLE_OF[username] || 'user',
    status: 'active',
    suspendedUntil: null,
    statusReason: '',
    isPrivate: PRIVATE.has(username),
    following: [],
    followRequests: [],
    blocked: [],
    muted: [],
    notifPrefs: { ...DEFAULT_NOTIFICATION_PREFS },
    pinnedPostId: null,
    bookmarks: [],
    hidden: [],
  }))
  const byName = Object.fromEntries(users.map((u) => [u.username, u]))
  for (const [name, list] of Object.entries(FOLLOWS)) byName[name].following = list.map((n) => byName[n].id)

  let cn = 0
  const posts = POSTS.map(([author, age, text, images, comments], i) => {
    const createdAt = now - age * MIN
    const likers = users.filter((u) => !SYSTEM.has(u.username) && u.username !== author && rand() < (0.2 + (i % 5) * 0.08)).map((u) => u.id)
    const built = []
    const addComment = (authorName, body, parentId, minutesAfter) => {
      const c = {
        id: id('c', ++cn),
        authorId: byName[authorName].id,
        text: body,
        parentId: parentId || null,
        createdAt: Math.min(now - MIN, createdAt + minutesAfter * MIN),
        likes: users.filter(() => rand() < 0.12).map((u) => u.id),
      }
      built.push(c)
      return c
    }
    let t = 12
    for (const [cAuthor, cText, replies = []] of comments) {
      const c = addComment(cAuthor, cText, null, (t += 9 + Math.floor(rand() * 40)))
      for (const [rAuthor, rText] of replies) addComment(rAuthor, rText, c.id, (t += 4 + Math.floor(rand() * 25)))
    }
    if (!comments.length && rand() < 0.45) {
      const who = users.filter((u) => u.username !== author)[Math.floor(rand() * (users.length - 1))]
      addComment(who.username, GENERIC_COMMENTS[Math.floor(rand() * GENERIC_COMMENTS.length)], null, 30 + Math.floor(rand() * 90))
    }
    return {
      id: id('p', i + 1),
      authorId: byName[author].id,
      title: '',
      text,
      images,
      hashtags: extractHashtags(text),
      createdAt,
      editedAt: null,
      reactions: Object.fromEntries(likers.map((uid) => [uid, pickReaction(rand())])),
      poll: null,
      repostOf: null,
      status: 'published',
      visibleAt: createdAt,
      editHistory: [],
      modState: 'ok',
      modNote: '',
      comments: built,
    }
  })

  byName.alice.bookmarks = [posts[2].id, posts[27].id]

  // Notifications derived from the seeded activity (the newest ones are unread).
  const notifications = []
  let nn = 0
  const addNote = (userId, actorId, type, postId, snippet, createdAt) => {
    if (userId === actorId) return
    notifications.push({ id: id('n', ++nn), userId, actorId, type, postId, snippet, read: now - createdAt > 2 * DAY, createdAt })
  }
  const clip = (t) => (t.length > 80 ? `${t.slice(0, 79)}…` : t)
  for (const p of posts) {
    for (const [k, [uid, type]] of Object.entries(p.reactions).entries()) addNote(p.authorId, uid, type === 'like' ? 'like' : 'reaction', p.id, clip(p.text), p.createdAt + (k + 1) * 17 * MIN)
    for (const c of p.comments) {
      const parent = c.parentId && p.comments.find((x) => x.id === c.parentId)
      addNote(parent ? parent.authorId : p.authorId, c.authorId, parent ? 'reply' : 'comment', p.id, clip(c.text), c.createdAt)
    }
  }
  for (const u of users) {
    u.following.forEach((fid, k) => addNote(fid, u.id, 'follow', null, '', now - (k + 1) * 2 * DAY - hashString(u.username) % HOUR))
  }
  for (const p of posts) {
    for (const name of extractMentions(p.text)) {
      if (byName[name]) addNote(byName[name].id, p.authorId, 'mention', p.id, clip(p.text), p.createdAt + 20 * MIN)
    }
  }
  // ---- extras: polls, quotes, reposts, a pinned post, edit history, drafts, moderation and messages ----
  const uid = (name) => byName[name].id
  const extra = (authorName, ageMin, text, images = []) => {
    const createdAt = now - ageMin * MIN
    const p = {
      id: id('p', posts.length + 1), authorId: uid(authorName), title: '', text, images, hashtags: extractHashtags(text),
      createdAt, editedAt: null, reactions: {}, comments: [], poll: null, repostOf: null, status: 'published',
      visibleAt: createdAt, editHistory: [], modState: 'ok', modNote: '',
    }
    posts.push(p)
    return p
  }
  const react = (p, names, type = 'like') => names.forEach((n) => { p.reactions[uid(n)] = type })

  const open = extra('marcus', 50, 'Quick poll for the design folks: when do you do your best work? #design #poll')
  open.poll = { endsAt: now + 2 * DAY, options: [
    { id: 'po1', text: 'Early morning', votes: [uid('priya'), uid('hannah'), uid('omar')] },
    { id: 'po2', text: 'Late evening', votes: [uid('sofia'), uid('diego')] },
    { id: 'po3', text: 'Right after coffee', votes: [uid('tom'), uid('chen'), uid('nora'), uid('lena')] },
  ] }
  react(open, ['sofia', 'tom'])

  const closed = extra('chen', 3000, 'Which chart type do you trust least? The results are in. #dataviz #poll')
  closed.poll = { endsAt: now - HOUR, options: [
    { id: 'pc1', text: 'Pie charts', votes: [uid('marcus'), uid('priya'), uid('jamal'), uid('nora')] },
    { id: 'pc2', text: '3D bar charts', votes: [uid('tom'), uid('diego'), uid('omar'), uid('lena'), uid('hannah'), uid('sofia')] },
    { id: 'pc3', text: 'Dual-axis lines', votes: [uid('alice')] },
  ] }

  const linked = extra('marcus', 95, 'Great read on spacing and rhythm in type: https://example.com/articles/kerning-for-beginners #typography')
  react(linked, ['alice', 'sofia', 'priya'], 'celebrate')

  const quote = extra('priya', 100, 'This is exactly why I carry a tripod everywhere. #photography')
  quote.repostOf = posts[2].id
  react(quote, ['tom', 'alice'])
  const repost = extra('sofia', 130, '')
  repost.repostOf = posts[0].id
  addNote(uid('tom'), uid('priya'), 'quote', quote.id, clip(quote.text), now - 100 * MIN)
  addNote(uid('alice'), uid('sofia'), 'repost', repost.id, '', now - 130 * MIN)

  // an edited post keeps its earlier wording
  posts[0].editedAt = now - 20 * MIN
  posts[0].editHistory = [{ text: 'First clear night in two weeks, so the telescope finally came out. Jupiter was lovely.', at: posts[0].createdAt }]
  byName.tom.pinnedPostId = posts[2].id

  // alice's drafts and scheduled posts
  const draft = extra('alice', 15, 'Draft: notes on a beginner-friendly stargazing checklist. #astronomy')
  draft.status = 'draft'
  draft.visibleAt = null
  const scheduled = extra('alice', 5, 'Scheduled: the Orionids peak tonight, blankets out! #astronomy #meteors')
  scheduled.status = 'scheduled'
  scheduled.visibleAt = now + 3 * HOUR

  // a spam account with open reports, a hidden post and the staff actions around them
  const spam = extra('bargainbot', 200, 'LIMITED OFFER!!! Cheap designer watches, 90% off. Click https://example.com/deals/cheap-watches now #deals')
  const spam2 = extra('bargainbot', 900, 'Win a free phone!!! Reply with your address and card number. #giveaway')
  spam2.modState = 'hidden'
  spam2.modNote = 'Scam'
  const reports = [
    ['priya', 'Spam or scam'], ['chen', 'Spam or scam'], ['omar', 'Misleading information'],
  ].map(([name, reason], k) => ({ postId: spam.id, userId: uid(name), reason, status: 'open', createdAt: now - (150 - k * 20) * MIN }))
  reports.push({ postId: spam2.id, userId: uid('nora'), reason: 'Spam or scam', status: 'resolved', createdAt: now - DAY - HOUR, resolvedBy: uid('mod'), resolution: 'Post hidden', resolvedAt: now - DAY })
  byName.bargainbot.status = 'suspended'
  byName.bargainbot.suspendedUntil = now + 6 * DAY
  byName.bargainbot.statusReason = 'Posting scams'
  const audit = [
    { id: id('a', 1), actorId: uid('mod'), action: 'report.hide', targetType: 'post', targetId: spam2.id, targetLabel: clip(spam2.text), note: 'Scam', createdAt: now - DAY },
    { id: id('a', 2), actorId: uid('mod'), action: 'user.suspend', targetType: 'user', targetId: byName.bargainbot.id, targetLabel: '@bargainbot', note: 'Posting scams', createdAt: now - DAY + 5 * MIN },
  ].sort((a, b) => b.createdAt - a.createdAt)

  // two conversations; alice has an unread message from marcus
  const conversation = (a, b, items, reads) => ({
    id: id('m', hashString(a + b) % 900),
    key: [uid(a), uid(b)].sort().join(':'),
    participants: [uid(a), uid(b)],
    messages: items.map(([from, text, ageMin], k) => ({ id: `${id('x', k + 1)}${a}${b}`, senderId: uid(from), text, createdAt: now - ageMin * MIN })),
    reads: Object.fromEntries(Object.entries(reads).map(([n, ageMin]) => [uid(n), now - ageMin * MIN])),
  })
  const conversations = [
    conversation('alice', 'marcus', [
      ['marcus', 'Hey Alice, loved the telescope shot. Which lens did you use?', 95],
      ['alice', 'Thanks! Just a phone held against the eyepiece, honestly.', 80],
      ['marcus', 'Ha, that is impressive. Would you share a tip or two?', 12],
    ], { alice: 85, marcus: 10 }),
    conversation('alice', 'tom', [
      ['tom', 'Planning a Lauterbrunnen trip in spring. Want to join?', 300],
      ['alice', 'Count me in. Send dates when you have them.', 290],
    ], { alice: 280, tom: 200 }),
  ]

  notifications.sort((a, b) => b.createdAt - a.createdAt)

  return { version: STATE_VERSION, seededAt: now, users, posts, notifications, reports, conversations, audit }
}
