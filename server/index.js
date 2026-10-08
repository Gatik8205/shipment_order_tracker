'use strict';

// config/env.js loads dotenv and validates required variables (fails fast)
const { PORT } = require('./src/config/env');
const { connectDB } = require('./src/config/db');
const app = require('./src/app');

async function start() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

start();