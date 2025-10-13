/**
 * Vemetric Analytics Integration
 * Tracks usage metrics for the Favicon API
 */

import { Vemetric } from '@vemetric/node';
import { createHash } from 'crypto';

let vemetricClient: Vemetric | null = null;

/**
 * Initialize Vemetric client if token is configured
 */
export function initVemetric(token?: string, host?: string): void {
  if (token) {
    vemetricClient = new Vemetric({
      token,
      ...(host && { host }),
    });
    console.info(`✓ Vemetric analytics initialized${host ? ` (host: ${host})` : ''}`);
  }
}

/**
 * Extract domain from URL for user identification
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    return urlObj.hostname;
  } catch {
    return 'unknown';
  }
}

/**
 * Create a privacy-friendly hashed identifier from IP address
 * Uses date as salt to reset daily and prevent long-term tracking
 */
function createHashedIdentifier(ip: string): string {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const hash = createHash('sha256').update(`${ip}:${today}`).digest('hex');
  return `api-${hash.substring(0, 16)}`; // Use first 16 chars for brevity
}

/**
 * Extract user identifier from request headers
 * Priority: Origin > Referer > Hashed IP
 *
 * Header usage patterns:
 * - Origin: Sent by fetch/XHR CORS requests (programmatic API usage)
 * - Referer: Sent by browser navigation, img tags, link clicks (most common for favicon API)
 * - Hashed IP: Fallback for API-to-API calls without Origin/Referer headers
 *
 * For typical favicon API usage via <img> tags, Referer will be the primary identifier.
 * Origin takes priority when present because it's more explicit and reliable.
 */
export function extractUserIdentifier(headers: {
  origin?: string;
  referer?: string;
  ip?: string;
}): string {
  // Priority 1: Origin header (sent by browsers for CORS requests)
  if (headers.origin) {
    return extractDomain(headers.origin);
  }

  // Priority 2: Referer header (contains full URL of requesting page)
  if (headers.referer) {
    return extractDomain(headers.referer);
  }

  // Priority 3: Hashed IP for API-to-API calls (privacy-friendly)
  if (headers.ip) {
    return createHashedIdentifier(headers.ip);
  }

  return 'unknown';
}

/**
 * Track favicon fetch event
 */
export async function trackFaviconFetch(data: {
  url: string;
  faviconUrl?: string;
  source?: string;
  format?: string;
  size?: number;
  response?: string;
  success: boolean;
  duration: number;
  error?: string;
  headers?: {
    origin?: string;
    referer?: string;
    ip?: string;
  };
}): Promise<void> {
  if (!vemetricClient) return;

  const eventName = data.success ? 'FaviconFetchSuccess' : 'FaviconFetchFailure';
  const userIdentifier = data.headers ? extractUserIdentifier(data.headers) : 'unknown';

  await vemetricClient.trackEvent(eventName, {
    userIdentifier,
    userDisplayName: userIdentifier,
    eventData: {
      targetUrl: data.url, // URL of the favicon being fetched
      faviconUrl: data.faviconUrl, // Actual favicon URL used
      source: data.source,
      format: data.format,
      size: data.size,
      response: data.response,
      duration: data.duration,
      error: data.error,
    },
  });
}
