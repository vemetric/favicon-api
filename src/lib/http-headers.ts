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
    'Cache-Control': `public, max-age=${config.CACHE_CONTROL_SUCCESS}, s-maxage=2592000`,
    ETag: generateETag(content),
    'Last-Modified': new Date().toUTCString(),
    Vary: 'Accept',
  };
}

/**
 * Generate cache headers for default/fallback image
 */
export function generateDefaultHeaders(config: AppConfig) {
  return {
    'Cache-Control': `public, max-age=${config.CACHE_CONTROL_DEFAULT}`,
    Vary: 'Accept',
  };
}

/**
 * Generate cache headers for error responses
 */
export function generateErrorHeaders(config: AppConfig) {
  return {
    'Cache-Control': `no-cache, max-age=${config.CACHE_CONTROL_ERROR}`,
  };
}

/**
 * Generate ETag from content hash
 */
function generateETag(content: Buffer): string {
  const hash = Bun.hash(content);
  return `"${hash.toString(16)}"`;
}

/**
 * Get content type from image format
 */
export function getContentType(format: string): string {
  const contentTypes: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    ico: 'image/x-icon',
    webp: 'image/webp',
    svg: 'image/svg+xml',
  };

  return contentTypes[format.toLowerCase()] || 'image/png';
}
