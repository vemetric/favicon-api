/**
 * Unit tests for image processing utilities
 */

import { describe, test, expect } from 'bun:test';
import { processImage } from '../../src/lib/image-processor';

describe('Image Processor', () => {
  describe('SVG Dimension Extraction', () => {
    test('should extract dimensions from SVG with width and height attributes', async () => {
      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle r="10"/></svg>'
      );
      const result = await processImage(svg, {});

      expect(result.format).toBe('svg');
      expect(result.width).toBe(32);
      expect(result.height).toBe(32);
    });

    test('should extract dimensions from SVG with viewBox', async () => {
      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 200"><rect width="100" height="200"/></svg>'
      );
      const result = await processImage(svg, {});

      expect(result.format).toBe('svg');
      expect(result.width).toBe(100);
      expect(result.height).toBe(200);
    });

    test('should prefer width/height attributes over viewBox', async () => {
      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 100 100"><circle r="10"/></svg>'
      );
      const result = await processImage(svg, {});

      expect(result.format).toBe('svg');
      expect(result.width).toBe(64);
      expect(result.height).toBe(64);
    });

    test('should handle SVG with decimal dimensions', async () => {
      const svg = Buffer.from(
        '<svg width="32.5" height="32.5" viewBox="0 0 32.5 32.5"><circle r="10"/></svg>'
      );
      const result = await processImage(svg, {});

      expect(result.format).toBe('svg');
      expect(result.width).toBe(33); // Rounded
      expect(result.height).toBe(33); // Rounded
    });

    test('should return 0 for SVG without dimensions', async () => {
      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="50" height="50"/></svg>'
      );
      const result = await processImage(svg, {});

      expect(result.format).toBe('svg');
      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
    });

    test('should not extract dimensions from child elements', async () => {
      const svg = Buffer.from('<svg><rect width="100" height="100"/></svg>');
      const result = await processImage(svg, {});

      expect(result.format).toBe('svg');
      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
    });

    test('should handle SVG with whitespace and newlines', async () => {
      const svg = Buffer.from(`
        <svg
          width="48"
          height="48"
          viewBox="0 0 48 48"
        >
          <circle r="20"/>
        </svg>
      `);
      const result = await processImage(svg, {});

      expect(result.format).toBe('svg');
      expect(result.width).toBe(48);
      expect(result.height).toBe(48);
    });
  });

  describe('SVG Pass-Through with Size Parameter', () => {
    test('should keep SVG format when size is specified', async () => {
      const svg = Buffer.from('<svg width="32" height="32"><circle r="10"/></svg>');
      const result = await processImage(svg, { size: 256 });

      expect(result.format).toBe('svg');
      expect(result.width).toBe(256);
      expect(result.height).toBe(256);
      expect(result.data).toEqual(svg); // Original data unchanged
    });

    test('should report requested size for SVG without original dimensions', async () => {
      const svg = Buffer.from('<svg><rect width="50" height="50"/></svg>');
      const result = await processImage(svg, { size: 128 });

      expect(result.format).toBe('svg');
      expect(result.width).toBe(128);
      expect(result.height).toBe(128);
    });

    test('should keep SVG format when format=svg is explicitly specified', async () => {
      const svg = Buffer.from('<svg width="32" height="32"><circle r="10"/></svg>');
      const result = await processImage(svg, { size: 64, format: 'svg' });

      expect(result.format).toBe('svg');
      expect(result.width).toBe(64);
      expect(result.height).toBe(64);
    });
  });

  describe('SVG Rasterization', () => {
    test('should rasterize SVG to PNG when format=png is specified', async () => {
      const svg = Buffer.from(
        '<svg width="32" height="32"><circle cx="16" cy="16" r="10" fill="red"/></svg>'
      );
      const result = await processImage(svg, { size: 64, format: 'png' });

      expect(result.format).toBe('png');
      expect(result.width).toBe(64);
      expect(result.height).toBe(64);
      expect(result.data).not.toEqual(svg); // Data should be changed
    });

    test('should rasterize SVG to JPEG when format=jpg is specified', async () => {
      const svg = Buffer.from(
        '<svg width="32" height="32"><circle cx="16" cy="16" r="10" fill="blue"/></svg>'
      );
      const result = await processImage(svg, { format: 'jpg' });

      expect(result.format).toBe('jpeg');
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });

    test('should rasterize SVG to WebP when format=webp is specified', async () => {
      const svg = Buffer.from(
        '<svg width="32" height="32"><rect width="32" height="32" fill="green"/></svg>'
      );
      const result = await processImage(svg, { size: 128, format: 'webp' });

      expect(result.format).toBe('webp');
      expect(result.width).toBe(128);
      expect(result.height).toBe(128);
    });
  });
});
