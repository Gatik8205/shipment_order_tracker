'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const shipmentRoutes = require('./routes/shipment.routes');

const app = express();

// Security headers — helmet with all defaults (Requirement 17.1)
app.use(helmet());

// CORS — allow requests only from CLIENT_ORIGIN (Requirement 17.2)
app.use(cors({ origin: process.env.CLIENT_ORIGIN }));

// JSON body parser
app.use(express.json());

// Route mounting
app.use('/api/auth', authRoutes);
app.use('/api/shipments', shipmentRoutes);

// Centralized error handler — must be last (4-arg signature)
app.use(errorHandler);

module.exports = app;
