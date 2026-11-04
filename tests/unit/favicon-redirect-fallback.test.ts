/**
 * Fallback locations after the HTML request is redirected.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import type { AppConfig } from '../../src/lib/config';
import { fetchBestFavicon, findFavicons } from '../../src/lib/favicon-finder';
import { createTestConfig } from './test-config';

const SIGN_IN_HTML = '<html><head><title>Sign in</title></head></html>';
const ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle r="10"/></svg>';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/**
 * Stub fetch: the site URL serves an HTML page without favicon link tags and
 * reports finalUrl as the URL it was redirected to. Other URLs are served from
 * `routes`, and everything else (e.g. the manifest) is a 404.
 */
function stubFetch(
  siteUrl: string,
  finalUrl: string,
  routes: Record<string, () => Response> = {}
): void {
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const requested = input instanceof Request ? input.url : input.toString();
    if (requested === siteUrl) {
      const response = new Response(SIGN_IN_HTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
      Object.defineProperty(response, 'url', { value: finalUrl });
      return Promise.resolve(response);
    }
    const route = routes[requested];
    return Promise.resolve(route ? route() : new Response('not found', { status: 404 }));
  }) as typeof fetch;
}

async function candidateUrls(
  siteUrl: string,
  finalUrl: string,
  config: AppConfig = createTestConfig()
): Promise<string[]> {
  stubFetch(siteUrl, finalUrl);
  const favicons = await findFavicons(siteUrl, config);
  return favicons.map((favicon) => favicon.url);
}

describe('Fallback locations after a redirect', () => {
  test('tries the requested host before the host it was redirected to', async () => {
    const urls = await candidateUrls(
      'https://app.example.com',
      'https://login.example.net/signin?continue=app'
    );

    expect(urls).toEqual([
      'https://app.example.com/apple-touch-icon.png',
      'https://app.example.com/favicon.ico',
      'https://login.example.net/apple-touch-icon.png',
      'https://login.example.net/favicon.ico',
    ]);
  });

  test('keeps the fallback API last after a redirect to another host', async () => {
    const urls = await candidateUrls(
      'https://app.example.com',
      'https://login.example.net/signin',
      createTestConfig({ USE_FALLBACK_API: true })
    );

    expect(urls).toHaveLength(5);
    expect(urls.slice(0, 4)).toEqual([
      'https://app.example.com/apple-touch-icon.png',
      'https://app.example.com/favicon.ico',
      'https://login.example.net/apple-touch-icon.png',
      'https://login.example.net/favicon.ico',
    ]);
    expect(urls[4]).toStartWith('https://www.google.com/s2/favicons?');
  });

  test('keeps a non-default port of the requested host', async () => {
    const urls = await candidateUrls(
      'https://app.example.com:8443',
      'https://login.example.net/signin'
    );

    expect(urls.slice(0, 2)).toEqual([
      'https://app.example.com:8443/apple-touch-icon.png',
      'https://app.example.com:8443/favicon.ico',
    ]);
  });

  test('adds no extra fallbacks without a redirect', async () => {
    const urls = await candidateUrls('https://example.com', 'https://example.com/');

    expect(urls).toEqual([
      'https://example.com/apple-touch-icon.png',
      'https://example.com/favicon.ico',
    ]);
  });

  test('adds no extra fallbacks for an http to https redirect on the same host', async () => {
    const urls = await candidateUrls('http://example.com', 'https://example.com/');

    expect(urls).toEqual([
      'https://example.com/apple-touch-icon.png',
      'https://example.com/favicon.ico',
    ]);
  });

  test('adds no extra fallbacks for a redirect to the www host', async () => {
    const urls = await candidateUrls('https://example.com', 'https://www.example.com/');

    expect(urls).toEqual([
      'https://www.example.com/apple-touch-icon.png',
      'https://www.example.com/favicon.ico',
    ]);
  });

  test("returns the requested host's icon when the sign-in host only serves HTML", async () => {
    const htmlPage = () =>
      new Response(SIGN_IN_HTML, { status: 202, headers: { 'Content-Type': 'text/html' } });
    const config = createTestConfig();

    stubFetch('https://app.example.com', 'https://login.example.net/signin', {
      'https://app.example.com/apple-touch-icon.png': htmlPage,
      'https://app.example.com/favicon.ico': () =>
        new Response(ICON_SVG, { status: 200, headers: { 'Content-Type': 'image/svg+xml' } }),
      'https://login.example.net/apple-touch-icon.png': htmlPage,
      'https://login.example.net/favicon.ico': htmlPage,
    });

    const favicons = await findFavicons('https://app.example.com', config);
    const result = await fetchBestFavicon(favicons, config);

    expect(result?.url).toBe('https://app.example.com/favicon.ico');
  });
});
