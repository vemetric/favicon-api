/**
 * Fallback image management
 * Pre-fetches and caches the default fallback image as a singleton
 */

import type { AppConfig } from './config';
import { logger } from './logger';

interface CachedFallback {
  buffer: Buffer;
  format: string;
  sourceUrl: string;
}

// Singleton instance
let cachedFallback: CachedFallback | null = null;

/**
 * Load the local default.svg file from the filesystem
 */
async function loadLocalDefaultSvg(): Promise<CachedFallback> {
  const defaultSvgPath = new URL('../default.svg', import.meta.url).pathname;
  const file = Bun.file(defaultSvgPath);
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return {
    buffer,
    format: 'svg',
    sourceUrl: 'default.svg',
  };
}

/**
 * Initialize and cache the fallback image
 * Should be called once at server boot
 */
export async function initializeFallbackImage(config: AppConfig): Promise<void> {
  const fallbackUrl = config.DEFAULT_IMAGE_URL;

  try {
    // Use local default.svg if no fallback URL is provided
    if (!fallbackUrl) {
      cachedFallback = await loadLocalDefaultSvg();

      logger.info(
        { sourceUrl: cachedFallback.sourceUrl, format: cachedFallback.format, size: cachedFallback.buffer.length },
        'Fallback image cached successfully'
      );
      return;
    }

    // Fetch default image from URL
    const response = await fetch(fallbackUrl, {
      headers: { 'User-Agent': config.USER_AGENT },
      signal: AbortSignal.timeout(config.REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch default image');
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    // Detect format from URL or assume PNG
    const format = fallbackUrl.endsWith('.svg') ? 'svg' : 'png';

    cachedFallback = {
      buffer,
      format,
      sourceUrl: fallbackUrl,
    };

    logger.info(
      { sourceUrl: cachedFallback.sourceUrl, format: cachedFallback.format, size: buffer.length },
      'Fallback image cached successfully'
    );
  } catch (error) {
    logger.error({ err: error }, 'Error fetching default image at boot, falling back to local default.svg');

    // Fallback to local default.svg if remote fetch fails
    cachedFallback = await loadLocalDefaultSvg();

    logger.info(
      { sourceUrl: cachedFallback.sourceUrl, format: cachedFallback.format, size: cachedFallback.buffer.length },
      'Fallback image cached successfully (local default)'
    );
  }
}

/**
 * Get the cached fallback image
 * Throws an error if not initialized
 */
export function getCachedFallback(): CachedFallback {
  if (!cachedFallback) {
    throw new Error('Fallback image not initialized. Call initializeFallbackImage() first.');
  }
  return cachedFallback;
}

/**
 * Fetch a custom default image URL (for per-request custom defaults)
 */
export async function fetchCustomDefault(
  url: string,
  config: AppConfig
): Promise<{ buffer: Buffer; format: string; sourceUrl: string }> {
  const response = await fetch(url, {
    headers: { 'User-Agent': config.USER_AGENT },
    signal: AbortSignal.timeout(config.REQUEST_TIMEOUT),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch custom default image');
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  // Detect format from URL or assume PNG
  const format = url.endsWith('.svg') ? 'svg' : 'png';

  return {
    buffer,
    format,
    sourceUrl: url,
  };
}
