/**
 * Favicon discovery logic
 * Finds and ranks favicons from various sources
 */

import * as cheerio from 'cheerio';
import type { FaviconSource, WebManifest } from '../types';
import type { AppConfig } from './config';

/**
 * Find all possible favicon URLs for a given website
 */
export async function findFavicons(url: string, config: AppConfig): Promise<FaviconSource[]> {
  const favicons: FaviconSource[] = [];

  try {
    // Ensure URL has protocol
    const targetUrl = url.startsWith('http') ? url : `https://${url}`;
    const parsedUrl = new URL(targetUrl);
    const baseUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}`;

    // Fetch HTML content
    const html = await fetchHtml(targetUrl, config);
    const $ = cheerio.load(html);

    // Extract favicons from HTML
    favicons.push(...extractFromLinkTags($, baseUrl));
    favicons.push(...extractFromMetaTags($, baseUrl));

    // Add common fallback locations
    favicons.push({
      url: `${baseUrl}/favicon.ico`,
      source: 'fallback',
      score: 10,
    });

    favicons.push({
      url: `${baseUrl}/apple-touch-icon.png`,
      source: 'fallback',
      score: 20,
    });

    // Try to fetch and parse manifest.json
    const manifestFavicons = await extractFromManifest(baseUrl, config);
    favicons.push(...manifestFavicons);
  } catch (error) {
    console.error('Error finding favicons:', error);
  }

  // Sort by score (highest first) and return
  return favicons.sort((a, b) => b.score - a.score);
}

/**
 * Fetch HTML content from URL
 */
async function fetchHtml(url: string, config: AppConfig): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': config.USER_AGENT,
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract favicon URLs from link tags
 */
function extractFromLinkTags($: cheerio.CheerioAPI, baseUrl: string): FaviconSource[] {
  const favicons: FaviconSource[] = [];

  $('link[rel*="icon"]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) return;

    const sizes = $(element).attr('sizes');
    const type = $(element).attr('type');
    const rel = $(element).attr('rel') || '';

    const size = parseSizes(sizes);
    const score = calculateScore(size, type, rel);

    favicons.push({
      url: resolveUrl(href, baseUrl),
      size,
      format: type,
      source: 'link-tag',
      score,
    });
  });

  return favicons;
}

/**
 * Extract favicon from Open Graph meta tags
 */
function extractFromMetaTags($: cheerio.CheerioAPI, baseUrl: string): FaviconSource[] {
  const favicons: FaviconSource[] = [];

  const ogImage = $('meta[property="og:image"]').attr('content');
  if (ogImage) {
    favicons.push({
      url: resolveUrl(ogImage, baseUrl),
      source: 'og-image',
      score: 30,
    });
  }

  return favicons;
}

/**
 * Extract favicons from web manifest
 */
async function extractFromManifest(baseUrl: string, config: AppConfig): Promise<FaviconSource[]> {
  const favicons: FaviconSource[] = [];

  try {
    const manifestUrl = `${baseUrl}/manifest.json`;
    const response = await fetch(manifestUrl, {
      headers: { 'User-Agent': config.USER_AGENT },
      signal: AbortSignal.timeout(config.REQUEST_TIMEOUT),
    });

    if (response.ok) {
      const manifest = (await response.json()) as WebManifest;
      if (manifest.icons && Array.isArray(manifest.icons)) {
        for (const icon of manifest.icons) {
          if (icon.src) {
            favicons.push({
              url: resolveUrl(icon.src, baseUrl),
              size: parseSizes(icon.sizes),
              format: icon.type,
              source: 'manifest',
              score: 40,
            });
          }
        }
      }
    }
  } catch {
    // Manifest not found or invalid, continue without it
  }

  return favicons;
}

/**
 * Parse size string (e.g., "32x32") to number
 */
function parseSizes(sizes: string | undefined): number | undefined {
  if (!sizes) return undefined;

  const match = sizes.match(/(\d+)x\d+/);
  return match && match[1] ? parseInt(match[1], 10) : undefined;
}

/**
 * Calculate quality score for a favicon
 */
function calculateScore(size: number | undefined, type: string | undefined, rel: string): number {
  let score = 50;

  // Prefer SVG (vector, scales perfectly)
  if (type?.includes('svg')) {
    score += 100;
  }

  // Size preference (larger is better)
  if (size) {
    if (size >= 512) score += 90;
    else if (size >= 256) score += 80;
    else if (size >= 192) score += 70;
    else if (size >= 128) score += 60;
    else if (size >= 64) score += 50;
    else if (size >= 32) score += 40;
  }

  // Format preference
  if (type?.includes('png')) score += 20;
  else if (type?.includes('webp')) score += 15;
  else if (type?.includes('ico')) score += 5;

  // Rel attribute preference
  if (rel.includes('apple-touch-icon')) score += 10;
  if (rel.includes('mask-icon')) score -= 10; // Usually monochrome

  return score;
}

/**
 * Resolve relative URL to absolute
 */
function resolveUrl(url: string, baseUrl: string): string {
  if (url.startsWith('http')) {
    return url;
  }

  if (url.startsWith('//')) {
    return `https:${url}`;
  }

  if (url.startsWith('/')) {
    return `${baseUrl}${url}`;
  }

  return `${baseUrl}/${url}`;
}

/**
 * Fetch the best favicon from the list
 */
export async function fetchBestFavicon(
  favicons: FaviconSource[],
  config: AppConfig
): Promise<{ data: Buffer; format: string; source: string } | null> {
  for (const favicon of favicons) {
    try {
      const response = await fetch(favicon.url, {
        headers: { 'User-Agent': config.USER_AGENT },
        signal: AbortSignal.timeout(config.REQUEST_TIMEOUT),
      });

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (buffer.length > 0 && buffer.length <= config.MAX_IMAGE_SIZE) {
          const format = detectFormat(buffer, favicon.format);
          return { data: buffer, format, source: favicon.source };
        }
      }
    } catch {
      // Try next favicon
      continue;
    }
  }

  return null;
}

/**
 * Detect image format from buffer
 */
function detectFormat(buffer: Buffer, hint?: string): string {
  // Check magic numbers
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpg';
  if (buffer[0] === 0x00 && buffer[1] === 0x00) return 'ico';
  if (buffer[0] === 0x52 && buffer[1] === 0x49) return 'webp';
  if (buffer.toString('utf8', 0, 5).includes('<svg')) return 'svg';

  // Fallback to hint
  const hintStr = hint || '';
  if (hintStr.includes('png')) return 'png';
  if (hintStr.includes('jpeg') || hintStr.includes('jpg')) return 'jpg';
  if (hintStr.includes('webp')) return 'webp';
  if (hintStr.includes('svg')) return 'svg';
  if (hintStr.includes('ico')) return 'ico';

  return 'png'; // Default
}
