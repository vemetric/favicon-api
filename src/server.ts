/**
 * Bun server entry point
 * Starts the HTTP server with the Hono application
 */

import { createApp } from './index';
import { loadConfig } from './lib/config';

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

console.info(`🚀 Favicon API server started`);
console.info(`📡 Listening on http://${config.HOST}:${config.PORT}`);
console.info(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
console.info('');
console.info('Press Ctrl+C to stop the server');

// Graceful shutdown
process.on('SIGINT', () => {
  console.info('\n⏹️  Shutting down gracefully...');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.info('\n⏹️  Shutting down gracefully...');
  server.stop();
  process.exit(0);
});
