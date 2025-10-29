/**
 * Unit tests for format detection utilities
 */

import { describe, test, expect } from 'bun:test';
import {
  detectFormatFromBuffer,
  isSvg,
  isGif,
  getContentTypeFromFormat,
  isSupportedBySharp,
} from '../../src/lib/format-detector';

describe('Format Detector Utilities', () => {
  describe('detectFormatFromBuffer', () => {
    test('should detect PNG format from magic numbers', () => {
      // PNG signature: 89 50 4E 47 0D 0A 1A 0A
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(detectFormatFromBuffer(pngBuffer)).toBe('png');
    });

    test('should detect JPEG format from magic numbers', () => {
      // JPEG signature: FF D8 FF
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
      expect(detectFormatFromBuffer(jpegBuffer)).toBe('jpeg');
    });

    test('should detect ICO format from magic numbers', () => {
      // ICO signature: 00 00 01 00
      const icoBuffer = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x10, 0x10]);
      expect(detectFormatFromBuffer(icoBuffer)).toBe('ico');
    });

    test('should detect WebP format from RIFF header', () => {
      // WebP signature: RIFF ... WEBP
      const webpBuffer = Buffer.from([
        0x52,
        0x49,
        0x46,
        0x46, // RIFF
        0x00,
        0x00,
        0x00,
        0x00, // File size
        0x57,
        0x45,
        0x42,
        0x50, // WEBP
      ]);
      expect(detectFormatFromBuffer(webpBuffer)).toBe('webp');
    });

    test('should detect GIF format from magic numbers', () => {
      // GIF signature: 47 49 46 (GIF)
      const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
      expect(detectFormatFromBuffer(gifBuffer)).toBe('gif');
    });

    test('should detect BMP format from magic numbers', () => {
      // BMP signature: 42 4D (BM)
      const bmpBuffer = Buffer.from([0x42, 0x4d, 0x00, 0x00, 0x00, 0x00]);
      expect(detectFormatFromBuffer(bmpBuffer)).toBe('bmp');
    });

    test('should detect SVG format from XML content', () => {
      const svgBuffer = Buffer.from(
        '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg">'
      );
      expect(detectFormatFromBuffer(svgBuffer)).toBe('svg');
    });

    test('should detect SVG format from svg tag', () => {
      const svgBuffer = Buffer.from('<svg width="100" height="100">');
      expect(detectFormatFromBuffer(svgBuffer)).toBe('svg');
    });

    test('should return png for unknown formats', () => {
      const unknownBuffer = Buffer.from([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0]);
      expect(detectFormatFromBuffer(unknownBuffer)).toBe('png');
    });

    test('should return png for empty or very small buffers', () => {
      const tinyBuffer = Buffer.from([0x00]);
      expect(detectFormatFromBuffer(tinyBuffer)).toBe('png');
    });

    test('should handle AVIF format detection', () => {
      // AVIF uses ISO Base Media File Format with ftyp box
      const avifBuffer = Buffer.from([
        0x00,
        0x00,
        0x00,
        0x20, // Box size
        0x66,
        0x74,
        0x79,
        0x70, // 'ftyp'
        0x61,
        0x76,
        0x69,
        0x66, // 'avif' brand
      ]);
      expect(detectFormatFromBuffer(avifBuffer)).toBe('avif');
    });
  });

  describe('isSvg', () => {
    test('should identify SVG by <svg tag', () => {
      const svgBuffer = Buffer.from('<svg width="100" height="100"><circle r="50"/></svg>');
      expect(isSvg(svgBuffer)).toBe(true);
    });

    test('should identify SVG by <?xml declaration', () => {
      const svgBuffer = Buffer.from('<?xml version="1.0" encoding="UTF-8"?><svg>');
      expect(isSvg(svgBuffer)).toBe(true);
    });

    test('should handle case insensitivity', () => {
      const svgBuffer = Buffer.from('<SVG WIDTH="100">');
      expect(isSvg(svgBuffer)).toBe(true);
    });

    test('should return false for non-SVG content', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      expect(isSvg(pngBuffer)).toBe(false);
    });

    test('should return false for empty buffer', () => {
      const emptyBuffer = Buffer.from([]);
      expect(isSvg(emptyBuffer)).toBe(false);
    });

    test('should handle SVG tag in middle of content', () => {
      const buffer = Buffer.from('<!-- comment --><svg>');
      expect(isSvg(buffer)).toBe(true);
    });
  });

  describe('isGif', () => {
    test('should identify GIF by magic numbers (GIF89a)', () => {
      const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
      expect(isGif(gifBuffer)).toBe(true);
    });

    test('should identify GIF by magic numbers (GIF87a)', () => {
      const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
      expect(isGif(gifBuffer)).toBe(true);
    });

    test('should return false for non-GIF content', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      expect(isGif(pngBuffer)).toBe(false);
    });

    test('should return false for empty buffer', () => {
      const emptyBuffer = Buffer.from([]);
      expect(isGif(emptyBuffer)).toBe(false);
    });

    test('should return false for buffer with insufficient bytes', () => {
      const smallBuffer = Buffer.from([0x47, 0x49]);
      expect(isGif(smallBuffer)).toBe(false);
    });
  });

  describe('getContentTypeFromFormat', () => {
    test('should return correct MIME type for PNG', () => {
      expect(getContentTypeFromFormat('png')).toBe('image/png');
      expect(getContentTypeFromFormat('PNG')).toBe('image/png');
    });

    test('should return correct MIME type for JPEG variants', () => {
      expect(getContentTypeFromFormat('jpeg')).toBe('image/jpeg');
      expect(getContentTypeFromFormat('jpg')).toBe('image/jpeg');
      expect(getContentTypeFromFormat('JPG')).toBe('image/jpeg');
    });

    test('should return correct MIME type for ICO', () => {
      expect(getContentTypeFromFormat('ico')).toBe('image/x-icon');
    });

    test('should return correct MIME type for WebP', () => {
      expect(getContentTypeFromFormat('webp')).toBe('image/webp');
    });

    test('should return correct MIME type for SVG', () => {
      expect(getContentTypeFromFormat('svg')).toBe('image/svg+xml');
    });

    test('should return correct MIME type for GIF', () => {
      expect(getContentTypeFromFormat('gif')).toBe('image/gif');
    });

    test('should return correct MIME type for BMP', () => {
      expect(getContentTypeFromFormat('bmp')).toBe('image/bmp');
    });

    test('should return correct MIME type for AVIF', () => {
      expect(getContentTypeFromFormat('avif')).toBe('image/avif');
    });

    test('should handle case insensitivity', () => {
      expect(getContentTypeFromFormat('PNG')).toBe('image/png');
      expect(getContentTypeFromFormat('WebP')).toBe('image/webp');
    });

    test('should return default PNG for unknown format', () => {
      expect(getContentTypeFromFormat('unknown')).toBe('image/png');
      expect(getContentTypeFromFormat('')).toBe('image/png');
    });
  });

  describe('isSupportedBySharp', () => {
    test('should return true for formats supported by Sharp', () => {
      expect(isSupportedBySharp('png')).toBe(true);
      expect(isSupportedBySharp('jpeg')).toBe(true);
      expect(isSupportedBySharp('jpg')).toBe(true);
      expect(isSupportedBySharp('webp')).toBe(true);
      expect(isSupportedBySharp('gif')).toBe(true);
      expect(isSupportedBySharp('svg')).toBe(true);
      expect(isSupportedBySharp('avif')).toBe(true);
      expect(isSupportedBySharp('tiff')).toBe(true);
    });

    test('should return false for unsupported formats', () => {
      expect(isSupportedBySharp('ico')).toBe(false);
      expect(isSupportedBySharp('bmp')).toBe(false);
      expect(isSupportedBySharp('unknown')).toBe(false);
    });

    test('should handle case insensitivity', () => {
      expect(isSupportedBySharp('PNG')).toBe(true);
      expect(isSupportedBySharp('WebP')).toBe(true);
      expect(isSupportedBySharp('ICO')).toBe(false);
    });

    test('should return false for empty string', () => {
      expect(isSupportedBySharp('')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    test('should handle buffer with exact minimum length', () => {
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(detectFormatFromBuffer(buffer)).toBe('png');
    });

    test('should handle very large buffers', () => {
      const largeBuffer = Buffer.alloc(10000);
      largeBuffer[0] = 0x89;
      largeBuffer[1] = 0x50;
      largeBuffer[2] = 0x4e;
      largeBuffer[3] = 0x47;
      expect(detectFormatFromBuffer(largeBuffer)).toBe('png');
    });

    test('should handle corrupted magic numbers', () => {
      // Almost PNG but one byte off
      const corruptedBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x48, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(detectFormatFromBuffer(corruptedBuffer)).toBe('png'); // Falls back to default
    });
  });

  describe('Real-world Scenarios', () => {
    test('should detect format from partial file header', () => {
      // Simulating reading just the beginning of a file
      const jpegHeader = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
        0x01,
      ]);
      expect(detectFormatFromBuffer(jpegHeader)).toBe('jpeg');
    });

    test('should handle SVG with whitespace before tag', () => {
      const svgWithWhitespace = Buffer.from('   \n  <svg>');
      expect(isSvg(svgWithWhitespace)).toBe(true);
    });

    test('should detect WebP with different RIFF sizes', () => {
      const webpBuffer = Buffer.from([
        0x52,
        0x49,
        0x46,
        0x46,
        0xaa,
        0xbb,
        0xcc,
        0xdd, // Different size
        0x57,
        0x45,
        0x42,
        0x50,
      ]);
      expect(detectFormatFromBuffer(webpBuffer)).toBe('webp');
    });
  });
});
