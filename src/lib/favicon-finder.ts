/**
 * Favicon discovery logic
 * Finds and ranks favicons from various sources
 */

import * as cheerio from 'cheerio';
import type { FaviconSource, WebManifest } from '../types';
import type { AppConfig } from './config';
import { parseDataUrl, validateImage } from './image-processor';
import { isDataUrl } from './validators';

/**
 * Browser-like User-Agent for HTML parsing (sites often block bots for HTML)
 * We use the honest User-Agent from config for actual resource fetching
 */
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Find all possible favicon URLs for a given website
 */
export async function findFavicons(
  url: string,
  config: AppConfig,
  size?: number
): Promise<FaviconSource[]> {
  const favicons: FaviconSource[] = [];

  // Ensure URL has protocol
  const targetUrl = url.startsWith('http') ? url : `https://${url}`;

  try {
    // Fetch HTML content and get final URL after redirects
    const { html, finalUrl } = await fetchHtml(targetUrl, config);
    const finalParsedUrl = new URL(finalUrl);
    const finalBaseUrl = `${finalParsedUrl.protocol}//${finalParsedUrl.hostname}`;
    const $ = cheerio.load(html);

    // Extract favicons from HTML (only link tags, no OG images)
    favicons.push(...extractFromLinkTags($, finalBaseUrl));

    // Add common fallback locations
    favicons.push({
      url: `${finalBaseUrl}/favicon.ico`,
      source: 'fallback',
      score: 10,
    });

    favicons.push({
      url: `${finalBaseUrl}/apple-touch-icon.png`,
      source: 'fallback',
      score: 20,
    });

    // Try to fetch and parse manifest.json
    const manifestFavicons = await extractFromManifest(finalBaseUrl, config);
    favicons.push(...manifestFavicons);
  } catch {}

  // Add Google's favicon API as last-resort fallback (if enabled)
  if (config.USE_FALLBACK_API) {
    const trimmedDomain = url.trim();
    const parsedUrl = new URL(
      trimmedDomain.startsWith('http') ? trimmedDomain : `https://${trimmedDomain}`
    );
    const formattedDomain = `https://${parsedUrl.hostname}`;

    favicons.push({
      url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(formattedDomain)}&sz=${size || 64}`,
      source: 'fallback-api',
      score: 1, // Lowest priority - try this last
    });
  }

  // Sort by score (highest first) and return
  return favicons.sort((a, b) => b.score - a.score);
}

/**
 * Fetch HTML content from URL and return final URL after redirects
 * First attempts with honest USER_AGENT, falls back to BROWSER_USER_AGENT if needed
 */
async function fetchHtml(
  url: string,
  config: AppConfig
): Promise<{ html: string; finalUrl: string }> {
  // Try with honest USER_AGENT first
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': config.USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(config.REQUEST_TIMEOUT),
      redirect: 'follow',
    });

    if (response.ok) {
      const html = await response.text();
      const finalUrl = response.url;
      return { html, finalUrl };
    }
  } catch {
    // First attempt failed, will try with browser UA
  }

  // Fallback: Try with browser-like UA if honest UA failed
  const response = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(config.REQUEST_TIMEOUT),
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  const finalUrl = response.url;

  return { html, finalUrl };
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
    let type = $(element).attr('type') || '';
    const rel = $(element).attr('rel') || '';

    if (!type) {
      if (isDataUrl(href)) {
        const mimeMatch = href.match(/^data:([^;,]+)/);
        if (mimeMatch && mimeMatch[1]) {
          type = mimeMatch[1];
        }
      } else {
        type = href.split('.').pop() || '';
      }
    }

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
 * Extract favicons from web manifest
 */
async function extractFromManifest(baseUrl: string, config: AppConfig): Promise<FaviconSource[]> {
  const favicons: FaviconSource[] = [];

  try {
    const manifestUrl = `${baseUrl}/manifest.json`;
    const response = await fetch(manifestUrl, {
      headers: {
        'User-Agent': config.USER_AGENT,
      },
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
  else if (type?.includes('gif')) score += 10;
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
  // Handle data URLs (inline images)
  if (isDataUrl(url)) {
    return url;
  }

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
): Promise<{ data: Buffer; format: string; source: string; url: string } | null> {
  for (const favicon of favicons) {
    try {
      let buffer: Buffer;
      let mimeType: string | undefined;

      // Check if this is a data URL
      if (isDataUrl(favicon.url)) {
        const parsed = parseDataUrl(favicon.url);
        if (!parsed) continue;
        buffer = parsed.buffer;
        mimeType = parsed.mimeType;
      } else {
        // Regular HTTP(S) URL - fetch it
        const response = await fetch(favicon.url, {
          headers: {
            'User-Agent': config.USER_AGENT,
          },
          signal: AbortSignal.timeout(config.REQUEST_TIMEOUT),
        });

        if (!response.ok) continue;

        const arrayBuffer = await response.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
      }

      // Validate buffer size and that it contains valid image data
      if (buffer.length > 0 && buffer.length <= config.MAX_IMAGE_SIZE) {
        // Check if buffer contains valid image data before returning
        const isValid = await validateImage(buffer);
        if (isValid) {
          const format = detectFormat(buffer, mimeType || favicon.format);
          return { data: buffer, format, source: favicon.source, url: favicon.url };
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
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'gif';
  if (buffer.toString('utf8', 0, 5).includes('<svg')) return 'svg';

  // Fallback to hint
  const hintStr = hint || '';
  if (hintStr.includes('png')) return 'png';
  if (hintStr.includes('jpeg') || hintStr.includes('jpg')) return 'jpg';
  if (hintStr.includes('webp')) return 'webp';
  if (hintStr.includes('svg')) return 'svg';
  if (hintStr.includes('gif')) return 'gif';
  if (hintStr.includes('ico')) return 'ico';

  return 'png'; // Default
}
