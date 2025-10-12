/**
 * Test setup utilities
 * Provides helpers for starting/stopping test server
 */

import { createApp } from '../../src/index';
import { loadConfig } from '../../src/lib/config';
import type { Server } from 'bun';

let testServer: Server<undefined> | null = null;
const TEST_PORT = 3001; // Different from default to avoid conflicts

export async function startTestServer(): Promise<string> {
  if (testServer) {
    throw new Error('Test server is already running');
  }

  const config = {
    ...loadConfig(),
    PORT: TEST_PORT,
    // Use shorter timeouts for tests
    REQUEST_TIMEOUT: 10000,
    // Disable private IP blocking for tests
    BLOCK_PRIVATE_IPS: false,
  };

  const app = createApp(config);

  testServer = Bun.serve({
    port: TEST_PORT,
    hostname: '127.0.0.1',
    fetch: app.fetch,
  });

  // Wait a bit for server to be ready
  await new Promise((resolve) => setTimeout(resolve, 100));

  return `http://127.0.0.1:${TEST_PORT}`;
}

export async function stopTestServer(): Promise<void> {
  if (testServer) {
    testServer.stop();
    testServer = null;
    // Wait a bit for cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = 5000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
