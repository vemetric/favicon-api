/**
 * Data URL (inline favicon) support integration tests
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startTestServer, stopTestServer, fetchWithTimeout } from './setup';

describe('Data URL Support', () => {
  let baseUrl: string;

  beforeAll(async () => {
    baseUrl = await startTestServer();
  });

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Inline SVG Favicons', () => {
    test('should extract and decode URL-encoded SVG data URL', async () => {
      // Test with the example website that uses inline SVG emoji as favicon
      const response = await fetchWithTimeout(
        `${baseUrl}/dominiksumer.com/emoji-favicon?response=json`,
        {},
        15000
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.format).toBe('svg');
      expect(data.source).toBe('link-tag');
      expect(data.bytes).toBeGreaterThan(0);
      // The sourceUrl should start with "data:" to indicate it's a data URL
      expect(data.sourceUrl).toStartWith('data:');
    });

    test('should return SVG image from data URL', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/dominiksumer.com/emoji-favicon`,
        {},
        15000
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/svg+xml');

      const svgContent = await response.text();
      expect(svgContent).toContain('<svg');
      expect(svgContent).toContain('</svg>');
      // The emoji favicon should contain a text element
      expect(svgContent).toContain('<text');
    });

    test('should be able to convert data URL SVG to PNG', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/dominiksumer.com/emoji-favicon?format=png`,
        {},
        15000
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/png');

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Check PNG magic numbers
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50);
    });

    test('should be able to resize data URL SVG', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/dominiksumer.com/emoji-favicon?size=64&format=png&response=json`,
        {},
        15000
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.format).toBe('png');
      expect(data.width).toBe(64);
      expect(data.height).toBe(64);
    });
  });

  describe('Data URL Format Detection', () => {
    test('should correctly detect mime type from data URL', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/dominiksumer.com/emoji-favicon?response=json`,
        {},
        15000
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      // The format should be detected as 'svg' from the mime type
      expect(data.format).toBe('svg');
    });
  });

  describe('Cache Headers for Data URLs', () => {
    test('should include proper cache headers for data URL favicons', async () => {
      const response = await fetchWithTimeout(
        `${baseUrl}/dominiksumer.com/emoji-favicon`,
        {},
        15000
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBeDefined();
      expect(response.headers.get('etag')).toBeDefined();
    });
  });
});
