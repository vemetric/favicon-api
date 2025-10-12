/**
 * Cache headers integration tests
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startTestServer, stopTestServer, fetchWithTimeout } from './setup';

describe('Cache Headers', () => {
  let baseUrl: string;

  beforeAll(async () => {
    baseUrl = await startTestServer();
  });

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Success Response Headers', () => {
    test('should include Cache-Control header for successful requests', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/?url=github.com&format=json`,
        {},
        15000
      );
      expect(response.status).toBe(200);

      const cacheControl = response.headers.get('cache-control');
      expect(cacheControl).toBeDefined();
      expect(cacheControl).toContain('public');
      expect(cacheControl).toContain('max-age');
    });

    test('should include ETag header for successful requests', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/?url=github.com`,
        {},
        15000
      );
      expect(response.status).toBe(200);

      const etag = response.headers.get('etag');
      expect(etag).toBeDefined();
      expect(etag).toMatch(/^"[a-f0-9]+"$/);
    });

    test('should include Last-Modified header for successful requests', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/?url=github.com`,
        {},
        15000
      );
      expect(response.status).toBe(200);

      const lastModified = response.headers.get('last-modified');
      expect(lastModified).toBeDefined();

      // Verify it's a valid HTTP date
      const date = new Date(lastModified!);
      expect(date.toString()).not.toBe('Invalid Date');
    });

    test('should include Vary header for content negotiation', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/?url=github.com`,
        {},
        15000
      );
      expect(response.status).toBe(200);

      const vary = response.headers.get('vary');
      expect(vary).toBeDefined();
      expect(vary).toContain('Accept');
    });

    test('should have long max-age for successful responses', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/?url=github.com`,
        {},
        15000
      );
      expect(response.status).toBe(200);

      const cacheControl = response.headers.get('cache-control');
      expect(cacheControl).toMatch(/max-age=\d+/);

      // Extract max-age value
      const match = cacheControl!.match(/max-age=(\d+)/);
      expect(match).toBeDefined();
      const maxAge = parseInt(match![1], 10);
      expect(maxAge).toBeGreaterThan(3600); // At least 1 hour
    });

    test('should include s-maxage for CDN caching', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/?url=github.com`,
        {},
        15000
      );
      expect(response.status).toBe(200);

      const cacheControl = response.headers.get('cache-control');
      expect(cacheControl).toContain('s-maxage');
    });
  });

  describe('Error Response Headers', () => {
    test('should include Cache-Control for error responses', async () => {
      const response = await fetchWithTimeout(`${baseUrl}/?url=github.com&size=999`);
      expect(response.status).toBe(400);

      const cacheControl = response.headers.get('cache-control');
      expect(cacheControl).toBeDefined();
    });

    test('should have short cache time for errors', async () => {
      const response = await fetchWithTimeout(`${baseUrl}/?url=github.com&size=999`);
      expect(response.status).toBe(400);

      const cacheControl = response.headers.get('cache-control');
      expect(cacheControl).toMatch(/max-age=\d+/);

      // Extract max-age value
      const match = cacheControl!.match(/max-age=(\d+)/);
      expect(match).toBeDefined();
      const maxAge = parseInt(match![1], 10);
      expect(maxAge).toBeLessThanOrEqual(300); // At most 5 minutes
    });
  });

  describe('ETag Consistency', () => {
    test(
      'should return same ETag for identical requests',
      async () => {
        const response1 = await fetchWithTimeout(
          `${baseUrl}/?url=github.com`,
          {},
          15000
        );
        const etag1 = response1.headers.get('etag');

        // Wait a bit then make another request
        await new Promise((resolve) => setTimeout(resolve, 100));

        const response2 = await fetchWithTimeout(
          `${baseUrl}/?url=github.com`,
          {},
          15000
        );
        const etag2 = response2.headers.get('etag');

        // ETags should be the same for the same content
        if (etag1 && etag2) {
          expect(etag1).toBe(etag2);
        }
      },
      { timeout: 30000 }
    );
  });
});
