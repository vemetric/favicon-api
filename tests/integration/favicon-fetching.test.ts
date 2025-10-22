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
      const response = await fetchWithTimeout(`${baseUrl}/github.com?response=json`, {}, 15000);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.url).toBeDefined();
      expect(data.format).toBeDefined();
      expect(data.source).toBeDefined();
      expect(data.bytes).toBeGreaterThan(0);
    });

    test('should fetch Google favicon as JSON', async () => {
      const response = await fetchWithTimeout(`${baseUrl}/google.com?response=json`, {}, 15000);
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
      const response = await fetchWithTimeout(`${baseUrl}/google.com`, {}, 15000);
      const contentType = response.headers.get('content-type');
      // Google serves ICO format, which is correctly detected now
      expect(contentType).toMatch(/^image\/(png|x-icon)/);
    });

    test('should have correct content-type for SVG', async () => {
      const response = await fetchWithTimeout(`${baseUrl}/github.com`, {}, 15000);
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

  describe('SVG Handling', () => {
    test('should return SVG with original dimensions when no size specified', async () => {
      const response = await fetchWithTimeout(`${baseUrl}/github.com?response=json`, {}, 15000);
      expect(response.status).toBe(200);

      const data = await response.json();
      // GitHub has SVG favicon
      if (data.format === 'svg') {
        expect(data.width).toBeGreaterThan(0);
        expect(data.height).toBeGreaterThan(0);
        // Should not be 0 (the old broken behavior)
        expect(data.width).not.toBe(0);
        expect(data.height).not.toBe(0);
      }
    });

    test('should keep SVG format when size is specified without format conversion', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/github.com?size=256&response=json`,
        {},
        15000
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      // Should keep as SVG (smart pass-through)
      if (data.sourceUrl.endsWith('.svg')) {
        expect(data.format).toBe('svg');
        expect(data.width).toBe(256);
        expect(data.height).toBe(256);
      }
    });

    test('should rasterize SVG to PNG when format=png is specified', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/github.com?size=256&format=png&response=json`,
        {},
        15000
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.format).toBe('png');
      expect(data.width).toBe(256);
      expect(data.height).toBe(256);
    });

    test('should return correct content-type for SVG pass-through', async () => {
      const response = await fetchWithTimeout(`${baseUrl}/github.com?size=128`, {}, 15000);

      const contentType = response.headers.get('content-type');
      // Should be SVG or PNG (depending on what GitHub serves)
      expect(contentType).toMatch(/^image\/(svg\+xml|png)/);
    });
  });

  describe('ICO Handling', () => {
    test('should extract dimensions from ICO files', async () => {
      const response = await fetchWithTimeout(`${baseUrl}/google.com?response=json`, {}, 15000);
      expect(response.status).toBe(200);

      const data = await response.json();
      // Google serves ICO - should have proper dimensions now
      expect(data.width).toBeGreaterThan(0);
      expect(data.height).toBeGreaterThan(0);
      // Should not be 0 (the old broken behavior)
      expect(data.width).not.toBe(0);
      expect(data.height).not.toBe(0);
    });

    test('should resize ICO files when size parameter is provided', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/google.com?size=128&response=json`,
        {},
        15000
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.width).toBe(128);
      expect(data.height).toBe(128);
    });

    test('should convert ICO to PNG when processing', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/google.com?size=64&response=json`,
        {},
        15000
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      // ICO should be converted to PNG when processed
      expect(data.format).toBe('png');
    });
  });

  describe('Fallback Image Handling', () => {
    test('should return fallback with original dimensions', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/nonexistent-domain-xyz-12345.com?response=json`,
        {},
        15000
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.source).toBe('default');
      expect(data.format).toBe('svg');
      // Fallback SVG should have dimensions
      expect(data.width).toBeGreaterThan(0);
      expect(data.height).toBeGreaterThan(0);
    });

    test('should apply size parameter to fallback image', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/nonexistent-domain-xyz-12345.com?size=128&response=json`,
        {},
        15000
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.source).toBe('default');
      expect(data.format).toBe('svg');
      expect(data.width).toBe(128);
      expect(data.height).toBe(128);
    });

    test('should rasterize fallback when format=png is specified', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/nonexistent-domain-xyz-12345.com?size=256&format=png&response=json`,
        {},
        15000
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.source).toBe('default');
      expect(data.format).toBe('png');
      expect(data.width).toBe(256);
      expect(data.height).toBe(256);
    });
  });

  describe('URL Format Handling', () => {
    test('should handle URL without protocol', async () => {
      const response = await fetchWithTimeout(`${baseUrl}/github.com?response=json`, {}, 15000);
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
      const response = await fetchWithTimeout(`${baseUrl}/vemetrics.com?response=json`, {}, 15000);
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
