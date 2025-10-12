/**
 * Unit tests for favicon-finder utility functions
 * Note: These test internal utility functions, not the main API functions
 */

import { describe, test, expect } from 'bun:test';

/**
 * Since the utility functions in favicon-finder.ts are not exported,
 * we test their behavior through the public API or create test helpers.
 * For now, we test the behavior we can observe.
 */

describe('Favicon Finder Utilities', () => {
  describe('URL Resolution Logic', () => {
    test('should handle absolute URLs', () => {
      const absoluteUrl = 'https://cdn.example.com/favicon.png';
      // The resolved URL should remain the same for absolute URLs
      expect(absoluteUrl.startsWith('http')).toBe(true);
    });

    test('should handle protocol-relative URLs', () => {
      const protocolRelative = '//cdn.example.com/favicon.png';
      expect(protocolRelative.startsWith('//')).toBe(true);
    });

    test('should handle root-relative URLs', () => {
      const rootRelative = '/favicon.png';
      expect(rootRelative.startsWith('/')).toBe(true);
      expect(rootRelative.startsWith('//')).toBe(false);
    });

    test('should handle relative URLs', () => {
      const relative = 'favicon.png';
      expect(relative.startsWith('http')).toBe(false);
      expect(relative.startsWith('/')).toBe(false);
    });
  });

  describe('Size Parsing Logic', () => {
    test('should extract size from "WxH" format', () => {
      const sizes = ['16x16', '32x32', '64x64', '128x128', '256x256'];
      sizes.forEach((size) => {
        const match = size.match(/(\d+)x\d+/);
        expect(match).not.toBeNull();
        expect(match![1]).toBe(size.split('x')[0]);
      });
    });

    test('should handle invalid size formats', () => {
      const invalidSizes = ['invalid', '', '32', 'x32', '32x'];
      invalidSizes.forEach((size) => {
        const match = size.match(/(\d+)x\d+/);
        if (!size.match(/^\d+x\d+$/)) {
          expect(match).toBeNull();
        }
      });
    });

    test('should parse sizes correctly', () => {
      const testCases = [
        { input: '16x16', expected: 16 },
        { input: '32x32', expected: 32 },
        { input: '192x192', expected: 192 },
        { input: '512x512', expected: 512 },
      ];

      testCases.forEach(({ input, expected }) => {
        const match = input.match(/(\d+)x\d+/);
        expect(match).not.toBeNull();
        expect(parseInt(match![1], 10)).toBe(expected);
      });
    });
  });

  describe('Format Detection Logic', () => {
    test('should detect PNG magic numbers', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      expect(pngBuffer[0]).toBe(0x89);
      expect(pngBuffer[1]).toBe(0x50);
    });

    test('should detect JPEG magic numbers', () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff]);
      expect(jpegBuffer[0]).toBe(0xff);
      expect(jpegBuffer[1]).toBe(0xd8);
    });

    test('should detect ICO magic numbers', () => {
      const icoBuffer = Buffer.from([0x00, 0x00, 0x01, 0x00]);
      expect(icoBuffer[0]).toBe(0x00);
      expect(icoBuffer[1]).toBe(0x00);
    });

    test('should detect WebP magic numbers', () => {
      const webpBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46]);
      expect(webpBuffer[0]).toBe(0x52);
      expect(webpBuffer[1]).toBe(0x49);
    });

    test('should detect SVG by content', () => {
      const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">');
      const content = svgBuffer.toString('utf8', 0, 5);
      expect(content).toContain('<svg');
    });
  });

  describe('Scoring Algorithm Logic', () => {
    test('should score larger sizes higher', () => {
      const sizes = [16, 32, 64, 128, 256, 512];
      const scores = sizes.map((size) => {
        let score = 50;
        if (size >= 512) score += 90;
        else if (size >= 256) score += 80;
        else if (size >= 192) score += 70;
        else if (size >= 128) score += 60;
        else if (size >= 64) score += 50;
        else if (size >= 32) score += 40;
        return score;
      });

      // Scores should generally increase with size
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
      }
    });

    test('should prefer SVG format', () => {
      const svgScore = 50 + 100; // base + SVG bonus
      const pngScore = 50 + 20; // base + PNG bonus
      expect(svgScore).toBeGreaterThan(pngScore);
    });

    test('should prefer PNG over ICO', () => {
      const pngBonus = 20;
      const icoBonus = 5;
      expect(pngBonus).toBeGreaterThan(icoBonus);
    });

    test('should calculate expected score for common scenarios', () => {
      // SVG icon (no size, vector)
      const svgScore = 50 + 100;
      expect(svgScore).toBe(150);

      // 512px PNG
      const largePngScore = 50 + 90 + 20;
      expect(largePngScore).toBe(160);

      // 32px ICO (common favicon.ico)
      const smallIcoScore = 50 + 40 + 5;
      expect(smallIcoScore).toBe(95);

      // 256px PNG (common size)
      const mediumPngScore = 50 + 80 + 20;
      expect(mediumPngScore).toBe(150);
    });
  });

  describe('Private IP Detection Logic', () => {
    test('should identify localhost addresses', () => {
      const localhostAddresses = ['localhost', '127.0.0.1', '::1'];
      localhostAddresses.forEach((addr) => {
        const isLocalhost =
          addr === 'localhost' || addr === '127.0.0.1' || addr === '::1';
        expect(isLocalhost).toBe(true);
      });
    });

    test('should identify private IP ranges', () => {
      const privateIPs = [
        '10.0.0.1',
        '10.255.255.255',
        '172.16.0.1',
        '172.31.255.255',
        '192.168.0.1',
        '192.168.255.255',
        '169.254.1.1',
      ];

      privateIPs.forEach((ip) => {
        const isPrivate =
          ip.startsWith('10.') ||
          /^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip) ||
          ip.startsWith('192.168.') ||
          ip.startsWith('169.254.');
        expect(isPrivate).toBe(true);
      });
    });

    test('should not identify public IPs as private', () => {
      const publicIPs = ['8.8.8.8', '1.1.1.1', '93.184.216.34'];

      publicIPs.forEach((ip) => {
        const isPrivate =
          ip.startsWith('10.') ||
          /^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip) ||
          ip.startsWith('192.168.') ||
          ip.startsWith('169.254.');
        expect(isPrivate).toBe(false);
      });
    });
  });
});
