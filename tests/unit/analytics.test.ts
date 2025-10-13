/**
 * Unit tests for analytics utility functions
 */

import { describe, test, expect } from 'bun:test';
import { extractUserIdentifier } from '../../src/lib/analytics';

describe('Analytics Utilities', () => {
  describe('extractUserIdentifier', () => {
    describe('Priority 1: Origin header', () => {
      test('should extract domain from Origin header', () => {
        const result = extractUserIdentifier({
          origin: 'https://example.com',
        });

        expect(result.identifier).toBe('example.com');
        expect(result.source).toBe('origin');
      });

      test('should extract domain from Origin with subdomain', () => {
        const result = extractUserIdentifier({
          origin: 'https://app.example.com',
        });

        expect(result.identifier).toBe('app.example.com');
        expect(result.source).toBe('origin');
      });

      test('should extract domain from Origin with port', () => {
        const result = extractUserIdentifier({
          origin: 'https://example.com:8080',
        });

        expect(result.identifier).toBe('example.com');
        expect(result.source).toBe('origin');
      });

      test('should prefer Origin over Referer', () => {
        const result = extractUserIdentifier({
          origin: 'https://example.com',
          referer: 'https://different.com/page',
        });

        expect(result.identifier).toBe('example.com');
        expect(result.source).toBe('origin');
      });

      test('should prefer Origin over IP', () => {
        const result = extractUserIdentifier({
          origin: 'https://example.com',
          ip: '192.168.1.1',
        });

        expect(result.identifier).toBe('example.com');
        expect(result.source).toBe('origin');
      });
    });

    describe('Priority 2: Referer header', () => {
      test('should extract domain from Referer header when no Origin', () => {
        const result = extractUserIdentifier({
          referer: 'https://example.com/some/path',
        });

        expect(result.identifier).toBe('example.com');
        expect(result.source).toBe('referer');
      });

      test('should extract domain from Referer with query params', () => {
        const result = extractUserIdentifier({
          referer: 'https://example.com/page?param=value',
        });

        expect(result.identifier).toBe('example.com');
        expect(result.source).toBe('referer');
      });

      test('should extract domain from Referer with hash', () => {
        const result = extractUserIdentifier({
          referer: 'https://example.com/page#section',
        });

        expect(result.identifier).toBe('example.com');
        expect(result.source).toBe('referer');
      });

      test('should prefer Referer over IP', () => {
        const result = extractUserIdentifier({
          referer: 'https://example.com',
          ip: '192.168.1.1',
        });

        expect(result.identifier).toBe('example.com');
        expect(result.source).toBe('referer');
      });
    });

    describe('Priority 3: Hashed IP', () => {
      test('should create hashed identifier from IP when no Origin/Referer', () => {
        const result = extractUserIdentifier({
          ip: '192.168.1.1',
        });

        expect(result.identifier).toMatch(/^api-[a-f0-9]{16}$/);
        expect(result.source).toBe('ip');
      });

      test('should create consistent hash for same IP on same day', () => {
        const ip = '192.168.1.1';
        const result1 = extractUserIdentifier({ ip });
        const result2 = extractUserIdentifier({ ip });

        expect(result1.identifier).toBe(result2.identifier);
        expect(result1.source).toBe('ip');
        expect(result2.source).toBe('ip');
      });

      test('should create different hashes for different IPs', () => {
        const result1 = extractUserIdentifier({ ip: '192.168.1.1' });
        const result2 = extractUserIdentifier({ ip: '192.168.1.2' });

        expect(result1.identifier).not.toBe(result2.identifier);
      });

      test('should handle IPv6 addresses', () => {
        const result = extractUserIdentifier({
          ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        });

        expect(result.identifier).toMatch(/^api-[a-f0-9]{16}$/);
        expect(result.source).toBe('ip');
      });

      test('should create consistent hash for same IPv6', () => {
        const ip = '2001:0db8:85a3::8a2e:0370:7334';
        const result1 = extractUserIdentifier({ ip });
        const result2 = extractUserIdentifier({ ip });

        expect(result1.identifier).toBe(result2.identifier);
        expect(result1.source).toBe('ip');
        expect(result2.source).toBe('ip');
      });
    });

    describe('Fallback: Unknown', () => {
      test('should return "unknown" when no headers provided', () => {
        const result = extractUserIdentifier({});

        expect(result.identifier).toBe('unknown');
        expect(result.source).toBe('unknown');
      });

      test('should return "unknown" when all headers are undefined', () => {
        const result = extractUserIdentifier({
          origin: undefined,
          referer: undefined,
          ip: undefined,
        });

        expect(result.identifier).toBe('unknown');
        expect(result.source).toBe('unknown');
      });
    });

    describe('Edge Cases', () => {
      test('should handle URL without protocol in Origin', () => {
        const result = extractUserIdentifier({
          origin: 'example.com',
        });

        expect(result.identifier).toBe('example.com');
        expect(result.source).toBe('origin');
      });

      test('should handle URL without protocol in Referer', () => {
        const result = extractUserIdentifier({
          referer: 'example.com',
        });

        expect(result.identifier).toBe('example.com');
        expect(result.source).toBe('referer');
      });

      test('should handle localhost in Origin', () => {
        const result = extractUserIdentifier({
          origin: 'http://localhost:3000',
        });

        expect(result.identifier).toBe('localhost');
        expect(result.source).toBe('origin');
      });

      test('should handle IP address in Origin', () => {
        const result = extractUserIdentifier({
          origin: 'http://192.168.1.100:8080',
        });

        expect(result.identifier).toBe('192.168.1.100');
        expect(result.source).toBe('origin');
      });

      test('should return "unknown" for invalid Origin URL', () => {
        const result = extractUserIdentifier({
          origin: '://invalid',
        });

        // Falls through to unknown since Origin parsing fails
        expect(result.identifier).toBe('unknown');
        expect(result.source).toBe('origin');
      });

      test('should return "unknown" for invalid Referer URL', () => {
        const result = extractUserIdentifier({
          referer: '://invalid',
        });

        // Falls through to unknown since Referer parsing fails
        expect(result.identifier).toBe('unknown');
        expect(result.source).toBe('referer');
      });

      test('should handle empty strings', () => {
        const result = extractUserIdentifier({
          origin: '',
          referer: '',
          ip: '',
        });

        expect(result.identifier).toBe('unknown');
        expect(result.source).toBe('unknown');
      });
    });

    describe('Real-world Scenarios', () => {
      test('should handle typical browser request', () => {
        const result = extractUserIdentifier({
          origin: 'https://mywebsite.com',
          referer: 'https://mywebsite.com/page',
          ip: '203.0.113.45',
        });

        expect(result.identifier).toBe('mywebsite.com');
        expect(result.source).toBe('origin');
      });

      test('should handle API-to-API request', () => {
        const result = extractUserIdentifier({
          ip: '203.0.113.45',
        });

        expect(result.identifier).toMatch(/^api-[a-f0-9]{16}$/);
        expect(result.identifier).not.toContain('203.0.113.45'); // IP should be hashed
        expect(result.source).toBe('ip');
      });

      test('should handle request from CDN', () => {
        const result = extractUserIdentifier({
          origin: 'https://cdn.example.com',
          ip: '104.16.132.229', // Cloudflare IP
        });

        expect(result.identifier).toBe('cdn.example.com');
        expect(result.source).toBe('origin');
      });

      test('should handle request with only Referer (older browsers)', () => {
        const result = extractUserIdentifier({
          referer: 'https://oldsite.com/legacy-page',
          ip: '198.51.100.10',
        });

        expect(result.identifier).toBe('oldsite.com');
        expect(result.source).toBe('referer');
      });
    });
  });
});
