/**
 * Bun server entry point
 * Starts the HTTP server with the Hono application
 */

import { createApp } from './index';
import { loadConfig } from './lib/config';
import { logger } from './lib/logger';

// Load and validate configuration
const config = loadConfig();

// Create Hono app
const app = createApp(config);

// Start Bun server
const server = Bun.serve({
  port: config.PORT,
  hostname: config.HOST,
  fetch: app.fetch,
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
