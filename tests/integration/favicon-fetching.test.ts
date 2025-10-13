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
        `${baseUrl}/github.com?response=json`,
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
        `${baseUrl}/google.com?response=json`,
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
        `${baseUrl}/stackoverflow.com?response=json`,
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
      const response = await fetchWithTimeout(`${baseUrl}/github.com`, {}, 15000);
      expect(response.status).toBe(200);

      const contentType = response.headers.get('content-type');
      expect(contentType).toMatch(/^image\//);

      const arrayBuffer = await response.arrayBuffer();
      expect(arrayBuffer.byteLength).toBeGreaterThan(0);
    });

    test('should have correct content-type for favicon', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/google.com`,
        {},
        15000
      );
      const contentType = response.headers.get('content-type');
      // Google serves ICO format, which is correctly detected now
      expect(contentType).toMatch(/^image\/(png|x-icon)/);
    });

    test('should have correct content-type for SVG', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/github.com`,
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
        `${baseUrl}/github.com?size=64&response=json`,
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
        `${baseUrl}/google.com?size=32&response=json`,
        {},
        15000
      );
      expect(response32.status).toBe(200);

      const response256 = await fetchWithTimeout(
        `${baseUrl}/google.com?size=256&response=json`,
        {},
        15000
      );
      expect(response256.status).toBe(200);
    });
  });

  describe('URL Format Handling', () => {
    test('should handle URL without protocol', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/github.com?response=json`,
        {},
        15000
      );
      expect(response.status).toBe(200);
    });

    test('should handle URL with https protocol', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/https://github.com?response=json`,
        {},
        15000
      );
      expect(response.status).toBe(200);
    });

    test('should handle URL with http protocol', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/http://info.cern.ch?response=json`,
        {},
        15000
      );
      // Should succeed or fail gracefully (404/500), but not crash
      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('Redirect Handling', () => {
    test('should follow redirects and fetch favicon from final destination', async () => {
      // vemetrics.com redirects to vemetric.com
      const response = await fetchWithTimeout(
        `${baseUrl}/vemetrics.com?response=json`,
        {},
        15000
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      // Should fetch favicon from the redirected domain (vemetric.com)
      expect(data.sourceUrl).toContain('vemetric.com');
      expect(data.sourceUrl).not.toContain('vemetrics.com');
      expect(data.source).toBe('link-tag');
      expect(data.format).toBeDefined();
    });

    test('should handle redirected domain same as direct access', async () => {
      // Fetch from redirected URL
      const redirectResponse = await fetchWithTimeout(
        `${baseUrl}/vemetrics.com?response=json`,
        {},
        15000
      );
      const redirectData = await redirectResponse.json();

      // Fetch from direct URL
      const directResponse = await fetchWithTimeout(
        `${baseUrl}/vemetric.com?response=json`,
        {},
        15000
      );
      const directData = await directResponse.json();

      // Both should return the same favicon
      expect(redirectData.sourceUrl).toBe(directData.sourceUrl);
      expect(redirectData.format).toBe(directData.format);
      expect(redirectData.source).toBe(directData.source);
    });
  });
});
