/**
 * Sites whose HTML stalls for non-browser User-Agents, and redirects to another site.
 * Modelled on onedrive.live.com, which redirects to a www.microsoft.com landing page
 * that never answers Bun requests carrying the honest User-Agent.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { createApp } from '../../src/index';
import { initializeFallbackImage } from '../../src/lib/fallback-image';
import { fetchBestFavicon, findFavicons } from '../../src/lib/favicon-finder';
import { createTestConfig } from './test-config';

const BROWSER_UA_MARKER = 'Mozilla/5.0';
const ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle r="10"/></svg>';
const LANDING_HTML =
  '<html><head><link rel="icon" href="/parent-brand.svg" type="image/svg+xml"></head></html>';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

type Route = (userAgent: string) => Response | 'hang';

/**
 * Stub fetch with per-URL handlers. 'hang' never answers until the request is aborted.
 * Unknown URLs are a 404. Every requested URL is recorded with its User-Agent.
 */
function stubFetch(routes: Record<string, Route>): { url: string; userAgent: string }[] {
  const requests: { url: string; userAgent: string }[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    const userAgent = new Headers(init?.headers).get('User-Agent') ?? '';
    requests.push({ url, userAgent });

    const route = routes[url];
    const result = route ? route(userAgent) : new Response('not found', { status: 404 });
    if (result !== 'hang') {
      return Promise.resolve(result);
    }

    return new Promise<Response>((_, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
        return;
      }
      signal?.addEventListener(
        'abort',
        () => reject(new DOMException('The operation was aborted.', 'AbortError')),
        { once: true }
      );
    });
  }) as typeof fetch;
  return requests;
}

function redirectedHtml(html: string, finalUrl: string): Response {
  const response = new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
  Object.defineProperty(response, 'url', { value: finalUrl });
  return response;
}

const svg = () =>
  new Response(ICON_SVG, { status: 200, headers: { 'Content-Type': 'image/svg+xml' } });

describe('HTML that stalls for the honest User-Agent', () => {
  test('starts a browser User-Agent request alongside it instead of waiting it out', async () => {
    const config = createTestConfig({ REQUEST_TIMEOUT: 2000 });
    stubFetch({
      'https://example.com': (userAgent) =>
        userAgent.startsWith(BROWSER_UA_MARKER)
          ? redirectedHtml(
              '<html><head><link rel="icon" href="/icon.svg" type="image/svg+xml"></head></html>',
              'https://example.com/'
            )
          : 'hang',
    });

    const start = Date.now();
    const { favicons } = await findFavicons('https://example.com', config);

    // Browser UA starts after 20% of the budget, well before the 70% HTML deadline
    expect(Date.now() - start).toBeLessThan(1000);
    expect(favicons[0]?.url).toBe('https://example.com/icon.svg');
  });

  test('keeps the fallback locations when no HTML arrives in time', async () => {
    const config = createTestConfig({ REQUEST_TIMEOUT: 1000 });
    stubFetch({ 'https://example.com': () => 'hang' });

    const start = Date.now();
    const { favicons } = await findFavicons('https://example.com', config);

    // The HTML stage is capped below the request budget
    expect(Date.now() - start).toBeLessThan(900);
    expect(favicons.map((favicon) => favicon.url)).toEqual([
      'https://example.com/apple-touch-icon.png',
      'https://example.com/favicon.ico',
    ]);
  });

  test("serves the requested host's own icon within the request deadline", async () => {
    const config = createTestConfig({ REQUEST_TIMEOUT: 1000 });
    await initializeFallbackImage(config);
    stubFetch({
      'https://onedrive.example': () => 'hang',
      'https://onedrive.example/favicon.ico': svg,
    });

    const app = createApp(config);
    const response = await app.request('http://localhost/onedrive.example?response=json');
    const data = await response.json();

    expect(data.source).toBe('fallback');
    expect(data.sourceUrl).toBe('https://onedrive.example/favicon.ico');
  });

  test('caches a timed-out fallback for CACHE_CONTROL_TIMEOUT only', async () => {
    const config = createTestConfig({
      REQUEST_TIMEOUT: 1000,
      CACHE_CONTROL_FALLBACK: 604800,
      CACHE_CONTROL_TIMEOUT: 300,
    });
    await initializeFallbackImage(config);
    stubFetch({
      'https://slow.example': () => 'hang',
      'https://slow.example/apple-touch-icon.png': () => 'hang',
    });

    const app = createApp(config);
    const response = await app.request('http://localhost/slow.example?response=json');
    const data = await response.json();

    expect(data.source).toBe('default');
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
  });

  test('caches the fallback for CACHE_CONTROL_TIMEOUT when only the HTML timed out', async () => {
    // The icon may be declared in a link tag we never got to see
    const config = createTestConfig({
      REQUEST_TIMEOUT: 1000,
      CACHE_CONTROL_FALLBACK: 604800,
      CACHE_CONTROL_TIMEOUT: 300,
    });
    await initializeFallbackImage(config);
    stubFetch({ 'https://slow-html.example': () => 'hang' });

    const app = createApp(config);
    const start = Date.now();
    const response = await app.request('http://localhost/slow-html.example?response=json');
    const data = await response.json();

    // Served after the HTML cap, before the request deadline
    expect(Date.now() - start).toBeLessThan(950);
    expect(data.source).toBe('default');
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
  });

  test('reports an HTML timeout even when the honest request failed first', async () => {
    const config = createTestConfig({ REQUEST_TIMEOUT: 1000 });
    stubFetch({
      'https://blocked.example': (userAgent) =>
        userAgent.startsWith(BROWSER_UA_MARKER) ? 'hang' : new Response('no', { status: 403 }),
    });

    const { htmlTimedOut } = await findFavicons('https://blocked.example', config);

    expect(htmlTimedOut).toBe(true);
  });

  test('does not report an HTML timeout for an error response', async () => {
    const config = createTestConfig({ REQUEST_TIMEOUT: 1000 });
    stubFetch({ 'https://broken.example': () => new Response('error', { status: 500 }) });

    const { htmlTimedOut } = await findFavicons('https://broken.example', config);

    expect(htmlTimedOut).toBe(false);
  });

  test('caches a fallback that did not time out for CACHE_CONTROL_FALLBACK', async () => {
    const config = createTestConfig({
      REQUEST_TIMEOUT: 1000,
      CACHE_CONTROL_FALLBACK: 604800,
      CACHE_CONTROL_TIMEOUT: 300,
    });
    await initializeFallbackImage(config);
    stubFetch({});

    const app = createApp(config);
    const response = await app.request('http://localhost/missing.example?response=json');
    const data = await response.json();

    expect(data.source).toBe('default');
    expect(response.headers.get('cache-control')).toBe('public, max-age=604800');
  });
});

describe('A domain that redirects to another site', () => {
  test("uses the target page's link tags before the requested host's own locations", async () => {
    // e.g. vemetrics.com -> vemetric.com, where vemetrics.com/favicon.ico never answers
    const config = createTestConfig({ REQUEST_TIMEOUT: 1000 });
    stubFetch({
      'https://moved.example': () => redirectedHtml(LANDING_HTML, 'https://www.new.example/'),
      'https://moved.example/apple-touch-icon.png': () => 'hang',
      'https://moved.example/favicon.ico': () => 'hang',
      'https://www.new.example/parent-brand.svg': svg,
    });

    const { favicons } = await findFavicons('https://moved.example', config);
    const result = await fetchBestFavicon(favicons, config);

    expect(favicons.map((favicon) => favicon.url)).toEqual([
      'https://www.new.example/parent-brand.svg',
      'https://moved.example/apple-touch-icon.png',
      'https://moved.example/favicon.ico',
      'https://www.new.example/apple-touch-icon.png',
      'https://www.new.example/favicon.ico',
    ]);
    expect(result?.url).toBe('https://www.new.example/parent-brand.svg');
  });
});
