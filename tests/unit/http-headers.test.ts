/**
 * Unit tests for HTTP headers utility functions
 */

import { describe, test, expect } from 'bun:test';
import {
  generateSuccessHeaders,
  generateDefaultHeaders,
  generateErrorHeaders,
} from '../../src/lib/http-headers';
import type { AppConfig } from '../../src/lib/config';

// Mock config for testing
const mockConfig: AppConfig = {
  PORT: 3000,
  HOST: '0.0.0.0',
  DEFAULT_IMAGE_URL: 'https://example.com/default.png',
  CACHE_CONTROL_SUCCESS: 86400,
  CACHE_CONTROL_DEFAULT: 3600,
  CACHE_CONTROL_ERROR: 60,
  REQUEST_TIMEOUT: 5000,
  MAX_IMAGE_SIZE: 5242880,
  USER_AGENT: 'TestAgent/1.0',
  ALLOWED_ORIGINS: '*',
  BLOCK_PRIVATE_IPS: true,
  MAX_REDIRECTS: 5,
  VEMETRIC_TOKEN: undefined,
  VEMETRIC_HOST: undefined,
  AXIOM_DATASET: undefined,
  AXIOM_TOKEN: undefined,
};

describe('HTTP Headers Utilities', () => {
  describe('generateSuccessHeaders', () => {
    test('should generate headers with Cache-Control', () => {
      const buffer = Buffer.from('test content');
      const headers = generateSuccessHeaders(mockConfig, buffer);

      expect(headers['Cache-Control']).toBeDefined();
      expect(headers['Cache-Control']).toContain('public');
      expect(headers['Cache-Control']).toContain('max-age=86400');
      expect(headers['Cache-Control']).toContain('s-maxage=2592000');
    });

    test('should generate ETag based on content', () => {
      const buffer = Buffer.from('test content');
      const headers = generateSuccessHeaders(mockConfig, buffer);

      expect(headers.ETag).toBeDefined();
      expect(headers.ETag).toMatch(/^"[a-f0-9]+"$/);
    });

    test('should generate same ETag for same content', () => {
      const buffer = Buffer.from('identical content');
      const headers1 = generateSuccessHeaders(mockConfig, buffer);
      const headers2 = generateSuccessHeaders(mockConfig, buffer);

      expect(headers1.ETag).toBe(headers2.ETag);
    });

    test('should generate different ETag for different content', () => {
      const buffer1 = Buffer.from('content 1');
      const buffer2 = Buffer.from('content 2');
      const headers1 = generateSuccessHeaders(mockConfig, buffer1);
      const headers2 = generateSuccessHeaders(mockConfig, buffer2);

      expect(headers1.ETag).not.toBe(headers2.ETag);
    });

    test('should include Last-Modified header', () => {
      const buffer = Buffer.from('test content');
      const headers = generateSuccessHeaders(mockConfig, buffer);

      expect(headers['Last-Modified']).toBeDefined();
      const date = new Date(headers['Last-Modified']!);
      expect(date.toString()).not.toBe('Invalid Date');
    });

    test('should include Vary header for content negotiation', () => {
      const buffer = Buffer.from('test content');
      const headers = generateSuccessHeaders(mockConfig, buffer);

      expect(headers.Vary).toBe('Accept');
    });
  });

  describe('generateDefaultHeaders', () => {
    test('should use default cache control value', () => {
      const headers = generateDefaultHeaders(mockConfig);

      expect(headers['Cache-Control']).toBe('public, max-age=3600');
    });

    test('should include Vary header', () => {
      const headers = generateDefaultHeaders(mockConfig);

      expect(headers.Vary).toBe('Accept');
    });

    test('should respect custom cache control config', () => {
      const customConfig = { ...mockConfig, CACHE_CONTROL_DEFAULT: 7200 };
      const headers = generateDefaultHeaders(customConfig);

      expect(headers['Cache-Control']).toBe('public, max-age=7200');
    });
  });

  describe('generateErrorHeaders', () => {
    test('should use short cache time for errors', () => {
      const headers = generateErrorHeaders(mockConfig);

      expect(headers['Cache-Control']).toBe('no-cache, max-age=60');
    });

    test('should include no-cache directive', () => {
      const headers = generateErrorHeaders(mockConfig);

      expect(headers['Cache-Control']).toContain('no-cache');
    });

    test('should respect custom error cache config', () => {
      const customConfig = { ...mockConfig, CACHE_CONTROL_ERROR: 120 };
      const headers = generateErrorHeaders(customConfig);

      expect(headers['Cache-Control']).toBe('no-cache, max-age=120');
    });
  });
});
