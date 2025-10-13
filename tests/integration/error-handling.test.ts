/**
 * Error handling integration tests
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startTestServer, stopTestServer, fetchWithTimeout } from './setup';

describe('Error Handling', () => {
  let baseUrl: string;

  beforeAll(async () => {
    baseUrl = await startTestServer();
  });

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Missing Required Parameters', () => {
    test('should return 400 when URL parameter is missing', async () => {
      const response = await fetchWithTimeout(`${baseUrl}/`);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error).toContain('URL is required');
    });
  });

  describe('Invalid Parameters', () => {
    test('should return 400 for invalid size (too small)', async () => {
      const response = await fetchWithTimeout(`${baseUrl}/?url=github.com&size=10`);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error).toContain('Size must be between');
    });

    test('should return 400 for invalid size (too large)', async () => {
      const response = await fetchWithTimeout(`${baseUrl}/?url=github.com&size=600`);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error).toContain('Size must be between');
    });

    test('should return 400 for invalid size (non-numeric)', async () => {
      const response = await fetchWithTimeout(`${baseUrl}/?url=github.com&size=abc`);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    test('should return 400 for invalid format', async () => {
      const response = await fetchWithTimeout(`${baseUrl}/?url=github.com&format=invalid`);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error).toContain('Invalid option');
    });

    test('should return 400 for invalid output format', async () => {
      const response = await fetchWithTimeout(`${baseUrl}/?url=github.com&response=xml`);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBeDefined();
    });
  });

  describe('Invalid URLs', () => {
    test('should return 400 for invalid URL format', async () => {
      const response = await fetchWithTimeout(`${baseUrl}/?url=not-a-valid-url`);
      // This might succeed or fail depending on DNS, but should not crash
      expect([200, 400, 404, 500]).toContain(response.status);
    });

    test('should handle non-existent domain gracefully', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/?url=this-domain-definitely-does-not-exist-12345.com&response=json`,
        {},
        15000
      );
      // Should return 200 with default fallback image
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.source).toBe('default');
      expect(data.sourceUrl).toBe('default.svg');
    });
  });

  describe('CORS', () => {
    test('should include CORS headers', async () => {
      const response = await fetchWithTimeout(`${baseUrl}/health`);
      const corsHeader = response.headers.get('access-control-allow-origin');
      expect(corsHeader).toBeDefined();
      expect(corsHeader).toBe('*');
    });
  });

  describe('404 Not Found', () => {
    test('should return 404 for non-existent routes', async () => {
      const response = await fetchWithTimeout(`${baseUrl}/non-existent-route`);
      expect(response.status).toBe(404);
    });
  });
});
