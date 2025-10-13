/**
 * Favicon fetching integration tests
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startTestServer, stopTestServer, fetchWithTimeout } from './setup';

describe('Favicon Fetching', () => {
  let baseUrl: string;

  beforeAll(async () => {
    baseUrl = await startTestServer();
  });

  afterAll(async () => {
    await stopTestServer();
  });

  describe('JSON Response Format', () => {
    test('should fetch GitHub favicon as JSON', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/?url=github.com&format=json`,
        {},
        15000
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.url).toBeDefined();
      expect(data.format).toBeDefined();
      expect(data.source).toBeDefined();
      expect(data.size).toBeGreaterThan(0);
    });

    test('should fetch Google favicon as JSON', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/?url=google.com&format=json`,
        {},
        15000
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.url).toBeDefined();
      // Google serves ICO format, which is correctly detected now
      expect(['png', 'ico']).toContain(data.format);
    });

    test('should fetch Stack Overflow favicon as JSON', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/?url=stackoverflow.com&format=json`,
        {},
        15000
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.url).toContain('stackoverflow');
      expect(data.source).toBe('link-tag');
    });
  });

  describe('Image Response Format', () => {
    test('should fetch GitHub favicon as image', async () => {
      const response = await fetchWithTimeout(`${baseUrl}/?url=github.com`, {}, 15000);
      expect(response.status).toBe(200);

      const contentType = response.headers.get('content-type');
      expect(contentType).toMatch(/^image\//);

      const arrayBuffer = await response.arrayBuffer();
      expect(arrayBuffer.byteLength).toBeGreaterThan(0);
    });

    test('should have correct content-type for favicon', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/?url=google.com`,
        {},
        15000
      );
      const contentType = response.headers.get('content-type');
      // Google serves ICO format, which is correctly detected now
      expect(contentType).toMatch(/^image\/(png|x-icon)/);
    });

    test('should have correct content-type for SVG', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/?url=github.com`,
        {},
        15000
      );
      const contentType = response.headers.get('content-type');
      expect(contentType).toMatch(/^image\/(svg\+xml|png)/);
    });
  });

  describe('Image Processing', () => {
    test('should resize image when size parameter is provided', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/?url=github.com&size=64&format=json`,
        {},
        15000
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      // For non-SVG images, dimensions should match requested size
      if (data.format !== 'svg') {
        expect(data.width).toBeLessThanOrEqual(64);
        expect(data.height).toBeLessThanOrEqual(64);
      }
    });

    test('should accept size parameter within valid range', async () => {
      const response32 = await fetchWithTimeout(
        `${baseUrl}/?url=google.com&size=32&format=json`,
        {},
        15000
      );
      expect(response32.status).toBe(200);

      const response256 = await fetchWithTimeout(
        `${baseUrl}/?url=google.com&size=256&format=json`,
        {},
        15000
      );
      expect(response256.status).toBe(200);
    });
  });

  describe('URL Format Handling', () => {
    test('should handle URL without protocol', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/?url=github.com&format=json`,
        {},
        15000
      );
      expect(response.status).toBe(200);
    });

    test('should handle URL with https protocol', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/?url=https://github.com&format=json`,
        {},
        15000
      );
      expect(response.status).toBe(200);
    });

    test('should handle URL with http protocol', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/?url=http://info.cern.ch&format=json`,
        {},
        15000
      );
      // Should succeed or fail gracefully (404/500), but not crash
      expect([200, 404, 500]).toContain(response.status);
    });
  });
});
