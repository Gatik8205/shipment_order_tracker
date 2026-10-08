'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { CLIENT_ORIGIN } = require('./config/env');
const { ApiError } = require('./utils/ApiError');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const shipmentRoutes = require('./routes/shipment.routes');

const app = express();

// Security headers: helmet with defaults (Requirement 17.1)
app.use(helmet());

// CORS: only the configured client origin (Requirement 17.2).
// CLIENT_ORIGIN is validated in config/env.js, so this can never silently
// fall back to "allow every origin".
app.use(cors({ origin: CLIENT_ORIGIN }));

// JSON body parser with a small size cap
app.use(express.json({ limit: '10kb' }));

// Liveness check (no auth, no DB access)
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Route mounting
app.use('/api/auth', authRoutes);
app.use('/api/shipments', shipmentRoutes);

// Unknown routes return the same JSON error shape as everything else
app.use((req, res, next) => next(new ApiError(404, 'Not found')));

// Centralized error handler: must be last (4-arg signature)
app.use(errorHandler);

module.exports = app;