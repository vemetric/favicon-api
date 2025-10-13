/**
 * Bun server entry point
 * Starts the HTTP server with the Hono application
 */

import { createApp } from './index';
import { loadConfig } from './lib/config';
import { logger } from './lib/logger';
import { initVemetric } from './lib/analytics';

// Load and validate configuration
const config = loadConfig();

// Initialize Vemetric analytics if token is configured
initVemetric(config.VEMETRIC_TOKEN, config.VEMETRIC_HOST);

// Create Hono app
const app = createApp(config);

// Start Bun server
const server = Bun.serve({
  port: config.PORT,
  hostname: config.HOST,
  fetch: app.fetch,
  // Set idleTimeout higher than our application timeout to prevent Bun from timing out first
  // Application timeout is REQUEST_TIMEOUT * 1.5, so set this to REQUEST_TIMEOUT * 2 for safety
  idleTimeout: (config.REQUEST_TIMEOUT * 2) / 1000, // Convert ms to seconds
});

logger.info(
  {
    port: config.PORT,
    host: config.HOST,
    environment: process.env.NODE_ENV || 'development',
  },
  `Server started on http://${config.HOST}:${config.PORT}`
);

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  server.stop();
  process.exit(0);
});
