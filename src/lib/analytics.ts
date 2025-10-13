/**
 * Vemetric Analytics Integration
 * Tracks usage metrics for the Favicon API
 */

import { Vemetric } from '@vemetric/node';

let vemetricClient: Vemetric | null = null;

/**
 * Initialize Vemetric client if token is configured
 */
export function initVemetric(token?: string): void {
  if (token) {
    vemetricClient = new Vemetric({ token });
    console.info('✓ Vemetric analytics initialized');
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
 * Track favicon fetch event
 */
export async function trackFaviconFetch(data: {
  url: string;
  source?: string;
  format?: string;
  requestSize?: number;
  requestFormat?: string;
  success: boolean;
  duration: number;
  error?: string;
}): Promise<void> {
  if (!vemetricClient) return;

  const eventName = data.success ? 'FaviconFetchSuccess' : 'FaviconFetchFailure';
  const domain = extractDomain(data.url);

  await vemetricClient.trackEvent(eventName, {
    userIdentifier: domain,
    eventData: {
      url: data.url,
      source: data.source,
      format: data.format,
      requestSize: data.requestSize,
      requestFormat: data.requestFormat,
      duration: data.duration,
      error: data.error,
    },
  });
}
