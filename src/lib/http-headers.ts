/**
 * HTTP cache header generation
 * Generates proper cache control headers for different response types
 */

import type { AppConfig } from './config';

/**
 * Generate cache headers for successful favicon response
 */
export function generateSuccessHeaders(config: AppConfig, content: Buffer) {
  return {
    'Cache-Control': `public, max-age=${config.CACHE_CONTROL_SUCCESS}`,
    'CDN-Cache-Control': `public, max-age=${config.CACHE_CONTROL_SUCCESS}`,
    ETag: generateETag(content),
    'Last-Modified': new Date().toUTCString(),
    Vary: 'Accept',
  };
}

/**
 * Generate cache headers for fallback responses after favicon lookup failed.
 * A lookup that ran out of time may well succeed on the next try, so it is cached
 * for CACHE_CONTROL_TIMEOUT instead
 */
export function generateFallbackHeaders(config: AppConfig, timedOut = false) {
  const maxAge = timedOut ? config.CACHE_CONTROL_TIMEOUT : config.CACHE_CONTROL_FALLBACK;
  return {
    'Cache-Control': `public, max-age=${maxAge}`,
    'CDN-Cache-Control': `public, max-age=${maxAge}`,
    Vary: 'Accept',
  };
}

/**
 * Generate cache headers for error responses
 */
export function generateErrorHeaders(config: AppConfig) {
  return {
    'Cache-Control': `public, max-age=${config.CACHE_CONTROL_ERROR}`,
    'CDN-Cache-Control': `public, max-age=${config.CACHE_CONTROL_ERROR}`,
  };
}

/**
 * Generate ETag from content hash
 */
function generateETag(content: Buffer): string {
  const hash = Bun.hash(content);
  return `"${hash.toString(16)}"`;
}
