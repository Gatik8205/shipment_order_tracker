const path = require('path');

// Load server/.env regardless of the directory the process is started from
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const REQUIRED = ['MONGO_URI', 'JWT_SECRET', 'CLIENT_ORIGIN'];
const missing = REQUIRED.filter((key) => !process.env[key]);

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

module.exports = {
  PORT: Number(process.env.PORT) || 5000,
  MONGO_URI: process.env.MONGO_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN,
  NODE_ENV: process.env.NODE_ENV || 'development',
};