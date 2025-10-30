/**
 * Redirect configuration integration tests
 * Tests the configurable redirect behavior for self-hosters
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { createApp } from '../../src/index';
import { loadConfig } from '../../src/lib/config';
import { initializeFallbackImage } from '../../src/lib/fallback-image';
import type { Server } from 'bun';

describe('Redirect Configuration', () => {
  describe('With REDIRECT_URL configured', () => {
    let testServer: Server<undefined> | null = null;
    let baseUrl: string;
    const TEST_PORT = 3003;

    beforeAll(async () => {
      // Set REDIRECT_URL for this test
      const originalEnv = process.env.REDIRECT_URL;
      process.env.REDIRECT_URL = 'https://example.com/docs';

      const config = {
        ...loadConfig(),
        PORT: TEST_PORT,
        REQUEST_TIMEOUT: 2000,
        BLOCK_PRIVATE_IPS: false,
      };

      await initializeFallbackImage(config);
      const app = createApp(config);

      testServer = Bun.serve({
        port: TEST_PORT,
        hostname: '127.0.0.1',
        fetch: app.fetch,
      });

      baseUrl = `http://127.0.0.1:${TEST_PORT}`;
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Restore original env
      if (originalEnv === undefined) {
        delete process.env.REDIRECT_URL;
      } else {
        process.env.REDIRECT_URL = originalEnv;
      }
    });

    afterAll(async () => {
      if (testServer) {
        testServer.stop();
        testServer = null;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    });

    test('should redirect to configured URL when no domain specified', async () => {
      const response = await fetch(`${baseUrl}/`, {
        redirect: 'manual',
      });

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('https://example.com/docs');
    });
  });

  describe('Without REDIRECT_URL configured', () => {
    let testServer: Server<undefined> | null = null;
    let baseUrl: string;
    const TEST_PORT = 3004;

    beforeAll(async () => {
      // Ensure REDIRECT_URL is not set
      const originalEnv = process.env.REDIRECT_URL;
      delete process.env.REDIRECT_URL;

      const config = {
        ...loadConfig(),
        PORT: TEST_PORT,
        REQUEST_TIMEOUT: 2000,
        BLOCK_PRIVATE_IPS: false,
      };

      await initializeFallbackImage(config);
      const app = createApp(config);

      testServer = Bun.serve({
        port: TEST_PORT,
        hostname: '127.0.0.1',
        fetch: app.fetch,
      });

      baseUrl = `http://127.0.0.1:${TEST_PORT}`;
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Restore original env
      if (originalEnv !== undefined) {
        process.env.REDIRECT_URL = originalEnv;
      }
    });

    afterAll(async () => {
      if (testServer) {
        testServer.stop();
        testServer = null;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    });

    test('should return 400 error when no domain specified and no redirect configured', async () => {
      const response = await fetch(`${baseUrl}/`);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error).toBe('Domain parameter is required');
    });

    test('should include proper error headers in 400 response', async () => {
      const response = await fetch(`${baseUrl}/`);

      expect(response.status).toBe(400);
      expect(response.headers.get('cache-control')).toBeDefined();
    });
  });
});
