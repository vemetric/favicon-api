/**
 * Unit tests for analytics utility functions
 */

import { describe, test, expect } from 'bun:test';
import { extractUserIdentifier } from '../../src/lib/analytics';

describe('Analytics Utilities', () => {
  describe('extractUserIdentifier', () => {
    describe('Priority 1: Origin header', () => {
      test('should extract domain from Origin header', () => {
        const identifier = extractUserIdentifier({
          origin: 'https://example.com',
        });

        expect(identifier).toBe('example.com');
      });

      test('should extract domain from Origin with subdomain', () => {
        const identifier = extractUserIdentifier({
          origin: 'https://app.example.com',
        });

        expect(identifier).toBe('app.example.com');
      });

      test('should extract domain from Origin with port', () => {
        const identifier = extractUserIdentifier({
          origin: 'https://example.com:8080',
        });

        expect(identifier).toBe('example.com');
      });

      test('should prefer Origin over Referer', () => {
        const identifier = extractUserIdentifier({
          origin: 'https://example.com',
          referer: 'https://different.com/page',
        });

        expect(identifier).toBe('example.com');
      });

      test('should prefer Origin over IP', () => {
        const identifier = extractUserIdentifier({
          origin: 'https://example.com',
          ip: '192.168.1.1',
        });

        expect(identifier).toBe('example.com');
      });
    });

    describe('Priority 2: Referer header', () => {
      test('should extract domain from Referer header when no Origin', () => {
        const identifier = extractUserIdentifier({
          referer: 'https://example.com/some/path',
        });

        expect(identifier).toBe('example.com');
      });

      test('should extract domain from Referer with query params', () => {
        const identifier = extractUserIdentifier({
          referer: 'https://example.com/page?param=value',
        });

        expect(identifier).toBe('example.com');
      });

      test('should extract domain from Referer with hash', () => {
        const identifier = extractUserIdentifier({
          referer: 'https://example.com/page#section',
        });

        expect(identifier).toBe('example.com');
      });

      test('should prefer Referer over IP', () => {
        const identifier = extractUserIdentifier({
          referer: 'https://example.com',
          ip: '192.168.1.1',
        });

        expect(identifier).toBe('example.com');
      });
    });

    describe('Priority 3: Hashed IP', () => {
      test('should create hashed identifier from IP when no Origin/Referer', () => {
        const identifier = extractUserIdentifier({
          ip: '192.168.1.1',
        });

        expect(identifier).toMatch(/^api-[a-f0-9]{16}$/);
      });

      test('should create consistent hash for same IP on same day', () => {
        const ip = '192.168.1.1';
        const identifier1 = extractUserIdentifier({ ip });
        const identifier2 = extractUserIdentifier({ ip });

        expect(identifier1).toBe(identifier2);
      });

      test('should create different hashes for different IPs', () => {
        const identifier1 = extractUserIdentifier({ ip: '192.168.1.1' });
        const identifier2 = extractUserIdentifier({ ip: '192.168.1.2' });

        expect(identifier1).not.toBe(identifier2);
      });

      test('should handle IPv6 addresses', () => {
        const identifier = extractUserIdentifier({
          ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        });

        expect(identifier).toMatch(/^api-[a-f0-9]{16}$/);
      });

      test('should create consistent hash for same IPv6', () => {
        const ip = '2001:0db8:85a3::8a2e:0370:7334';
        const identifier1 = extractUserIdentifier({ ip });
        const identifier2 = extractUserIdentifier({ ip });

        expect(identifier1).toBe(identifier2);
      });
    });

    describe('Fallback: Unknown', () => {
      test('should return "unknown" when no headers provided', () => {
        const identifier = extractUserIdentifier({});

        expect(identifier).toBe('unknown');
      });

      test('should return "unknown" when all headers are undefined', () => {
        const identifier = extractUserIdentifier({
          origin: undefined,
          referer: undefined,
          ip: undefined,
        });

        expect(identifier).toBe('unknown');
      });
    });

    describe('Edge Cases', () => {
      test('should handle URL without protocol in Origin', () => {
        const identifier = extractUserIdentifier({
          origin: 'example.com',
        });

        expect(identifier).toBe('example.com');
      });

      test('should handle URL without protocol in Referer', () => {
        const identifier = extractUserIdentifier({
          referer: 'example.com',
        });

        expect(identifier).toBe('example.com');
      });

      test('should handle localhost in Origin', () => {
        const identifier = extractUserIdentifier({
          origin: 'http://localhost:3000',
        });

        expect(identifier).toBe('localhost');
      });

      test('should handle IP address in Origin', () => {
        const identifier = extractUserIdentifier({
          origin: 'http://192.168.1.100:8080',
        });

        expect(identifier).toBe('192.168.1.100');
      });

      test('should return "unknown" for invalid Origin URL', () => {
        const identifier = extractUserIdentifier({
          origin: '://invalid',
        });

        // Falls through to unknown since Origin parsing fails
        expect(identifier).toBe('unknown');
      });

      test('should return "unknown" for invalid Referer URL', () => {
        const identifier = extractUserIdentifier({
          referer: '://invalid',
        });

        // Falls through to unknown since Referer parsing fails
        expect(identifier).toBe('unknown');
      });

      test('should handle empty strings', () => {
        const identifier = extractUserIdentifier({
          origin: '',
          referer: '',
          ip: '',
        });

        expect(identifier).toBe('unknown');
      });
    });

    describe('Real-world Scenarios', () => {
      test('should handle typical browser request', () => {
        const identifier = extractUserIdentifier({
          origin: 'https://mywebsite.com',
          referer: 'https://mywebsite.com/page',
          ip: '203.0.113.45',
        });

        expect(identifier).toBe('mywebsite.com');
      });

      test('should handle API-to-API request', () => {
        const identifier = extractUserIdentifier({
          ip: '203.0.113.45',
        });

        expect(identifier).toMatch(/^api-[a-f0-9]{16}$/);
        expect(identifier).not.toContain('203.0.113.45'); // IP should be hashed
      });

      test('should handle request from CDN', () => {
        const identifier = extractUserIdentifier({
          origin: 'https://cdn.example.com',
          ip: '104.16.132.229', // Cloudflare IP
        });

        expect(identifier).toBe('cdn.example.com');
      });

      test('should handle request with only Referer (older browsers)', () => {
        const identifier = extractUserIdentifier({
          referer: 'https://oldsite.com/legacy-page',
          ip: '198.51.100.10',
        });

        expect(identifier).toBe('oldsite.com');
      });
    });
  });
});
