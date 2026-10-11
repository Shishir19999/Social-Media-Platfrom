// Gives an existing account a role: node scripts/set-role.js <username> <user|moderator|admin>
// (npm run set-role -- alice moderator). Uses MONGODB_URI from .env like the server does.
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const User = require('../models/User');
const { ROLES } = require('../lib/rules');

const [username, role] = process.argv.slice(2);

(async () => {
    if (!username || !ROLES.includes(role)) {
        console.error(`Usage: node scripts/set-role.js <username> <${ROLES.join('|')}>`);
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/socialMediaDB');
    const user = await User.findOneAndUpdate({ username }, { role }, { returnDocument: 'after' });
    console.log(user ? `@${user.username} is now ${user.role}` : `No account called @${username}`);
    await mongoose.disconnect();
    process.exit(user ? 0 : 1);
})().catch((e) => { console.error(e.message); process.exit(1); });
