require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const { createApp } = require('./app');

if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is not set. Copy .env.example to .env and set it.');
    process.exit(1);
}

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0'; // reachable from other devices on the LAN

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/socialMediaDB')
    .then(() => console.log('MongoDB connected'))
    .catch((error) => console.error('MongoDB connection error:', error));

createApp().listen(PORT, HOST, () => {
    console.log(`Server is running on ${HOST}:${PORT}`);
});
