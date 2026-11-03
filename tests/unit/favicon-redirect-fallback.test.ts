/**
 * Fallback locations after the HTML request is redirected.
 */

import { describe, expect, test } from 'bun:test';
import type { AppConfig } from '../../src/lib/config';
import { findFavicons } from '../../src/lib/favicon-finder';

const testConfig: AppConfig = {
  PORT: 3000,
  HOST: '127.0.0.1',
  CACHE_CONTROL_SUCCESS: 604800,
  CACHE_CONTROL_FALLBACK: 604800,
  CACHE_CONTROL_ERROR: 604800,
  REQUEST_TIMEOUT: 2000,
  MAX_IMAGE_SIZE: 5242880,
  USER_AGENT: 'FaviconAPI/Test',
  ALLOWED_ORIGINS: '*',
  BLOCK_PRIVATE_IPS: false,
  MAX_REDIRECTS: 5,
  USE_FALLBACK_API: false,
};

/**
 * Serve an HTML page without favicon link tags for the site URL, reporting
 * finalUrl as the URL it was redirected to, and 404 for everything else
 * (the manifest).
 */
async function findWithRedirect(siteUrl: string, finalUrl: string) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const requested = input instanceof Request ? input.url : input.toString();
    if (requested !== siteUrl) {
      return Promise.resolve(new Response('not found', { status: 404 }));
    }
    const response = new Response('<html><head><title>Sign in</title></head></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
    Object.defineProperty(response, 'url', { value: finalUrl });
    return Promise.resolve(response);
  }) as typeof fetch;

  try {
    const favicons = await findFavicons(siteUrl, testConfig);
    return favicons.map((favicon) => favicon.url);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe('Fallback locations after a redirect', () => {
  test('also tries the requested host after a redirect to another host', async () => {
    const urls = await findWithRedirect(
      'https://app.example.com',
      'https://login.example.net/signin?continue=app'
    );

    expect(urls).toEqual([
      'https://login.example.net/apple-touch-icon.png',
      'https://login.example.net/favicon.ico',
      'https://app.example.com/apple-touch-icon.png',
      'https://app.example.com/favicon.ico',
    ]);
  });

  test('adds no extra fallbacks without a redirect', async () => {
    const urls = await findWithRedirect('https://example.com', 'https://example.com/');

    expect(urls).toEqual([
      'https://example.com/apple-touch-icon.png',
      'https://example.com/favicon.ico',
    ]);
  });

  test('adds no extra fallbacks for an http to https redirect on the same host', async () => {
    const urls = await findWithRedirect('http://example.com', 'https://example.com/');

    expect(urls).toEqual([
      'https://example.com/apple-touch-icon.png',
      'https://example.com/favicon.ico',
    ]);
  });
});
