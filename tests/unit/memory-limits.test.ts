/**
 * Limits that keep a single lookup (or many at once) from running the process out of memory:
 * capped response bodies, a capped share of the HTML page, a pixel limit for decoding,
 * and a cap on concurrent lookups.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import sharp from 'sharp';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { createApp } from '../../src/index';
import { BodyTooLargeError, readBodyLimited, readBodyPrefix } from '../../src/lib/bounded-body';
import { initializeFallbackImage } from '../../src/lib/fallback-image';
import { fetchBestFavicon, findFavicons, MAX_HTML_BYTES } from '../../src/lib/favicon-finder';
import { MAX_INPUT_PIXELS, processImage, validateImage } from '../../src/lib/image-processor';
import { createTestConfig } from './test-config';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

type Route = () => Response | 'hang';

function stubFetch(routes: Record<string, Route>): string[] {
  const requested: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    requested.push(url);
    const route = routes[url];
    const result = route ? route() : new Response('not found', { status: 404 });
    if (result !== 'hang') {
      return Promise.resolve(result);
    }
    return new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener(
        'abort',
        () => reject(new DOMException('The operation was aborted.', 'AbortError')),
        { once: true }
      );
    });
  }) as typeof fetch;
  return requested;
}

/**
 * A body that never ends, counting how many bytes the reader pulled from it
 */
function endlessBody(prefix: string, chunk = ' '.repeat(64 * 1024)) {
  const encoder = new TextEncoder();
  const state = { pulled: 0, cancelled: false };
  let sentPrefix = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const bytes = encoder.encode(sentPrefix ? chunk : prefix);
      sentPrefix = true;
      state.pulled += bytes.length;
      controller.enqueue(bytes);
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { stream, state };
}

/**
 * A page response that reports its own URL, as a real fetch does
 */
function page(stream: ReadableStream<Uint8Array>, url: string): Response {
  const response = new Response(stream, { headers: { 'Content-Type': 'text/html' } });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

const pngIcon = () =>
  sharp({ create: { width: 32, height: 32, channels: 4, background: '#f00' } })
    .png()
    .toBuffer();

describe('readBodyLimited', () => {
  test('returns a body within the limit', async () => {
    const body = await readBodyLimited(new Response('hello'), 10);
    expect(body.toString()).toBe('hello');
  });

  test('rejects a declared Content-Length over the limit without reading it', async () => {
    const { stream, state } = endlessBody('x');
    const response = new Response(stream, { headers: { 'Content-Length': '999999999' } });

    await expect(readBodyLimited(response, 1000)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(state.pulled).toBeLessThan(1000);
  });

  test('stops reading an endless body once it passes the limit', async () => {
    const { stream, state } = endlessBody('x');

    await expect(readBodyLimited(new Response(stream), 200_000)).rejects.toBeInstanceOf(
      BodyTooLargeError
    );
    await Bun.sleep(10);
    expect(state.cancelled).toBe(true);
    // The stream may read a few 64 KB chunks ahead before the cancel arrives
    expect(state.pulled).toBeLessThan(200_000 + 4 * 64 * 1024);
  });
});

describe('readBodyPrefix', () => {
  test('stops at the marker, even when it is split across chunks', async () => {
    const encoder = new TextEncoder();
    const parts = ['<html><head><link rel="icon" href="/a.png"></HE', 'AD><body>', 'more'];
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const part = parts.shift();
        if (part) controller.enqueue(encoder.encode(part));
        // Never closes: the reader has to stop on its own
      },
      cancel() {
        cancelled = true;
      },
    });

    const body = await readBodyPrefix(new Response(stream), 1024 * 1024, '</head>');
    expect(body.toString()).toContain('</HEAD>');
    expect(body.toString()).not.toContain('more');
    expect(cancelled).toBe(true);
  });

  test('returns at most maxBytes of an endless body', async () => {
    const { stream } = endlessBody('<html>');
    const body = await readBodyPrefix(new Response(stream), 100_000, '</head>');
    expect(body.length).toBe(100_000);
  });
});

describe('Compressed bodies', () => {
  const html = '<html><head><link rel="icon" href="/a.png"></head><body>hi</body></html>';

  test('inflates gzip and brotli bodies', async () => {
    for (const [encoding, data] of [
      ['gzip', gzipSync(html)],
      ['br', brotliCompressSync(html)],
    ] as const) {
      const response = new Response(new Uint8Array(data), {
        headers: { 'Content-Encoding': encoding },
      });
      expect((await readBodyLimited(response, 1024)).toString()).toBe(html);
    }
  });

  test('stops inflating a gzip bomb once the limit is reached', async () => {
    // 200 MB of spaces compresses to about 200 KB
    const bomb = gzipSync(Buffer.alloc(200 * 1024 * 1024, 0x20), { level: 9 });
    const before = process.memoryUsage().rss;

    const prefix = await readBodyPrefix(
      new Response(new Uint8Array(bomb), { headers: { 'Content-Encoding': 'gzip' } }),
      MAX_HTML_BYTES,
      '</head>'
    );
    await expect(
      readBodyLimited(
        new Response(new Uint8Array(bomb), { headers: { 'Content-Encoding': 'gzip' } }),
        100_000
      )
    ).rejects.toBeInstanceOf(BodyTooLargeError);

    expect(prefix.length).toBe(MAX_HTML_BYTES);
    expect(process.memoryUsage().rss - before).toBeLessThan(50 * 1024 * 1024);
  });

  test('rejects an encoding it cannot inflate', async () => {
    const response = new Response('x', { headers: { 'Content-Encoding': 'zstd' } });
    await expect(readBodyLimited(response, 1024)).rejects.toThrow('Unsupported content-encoding');
  });
});

describe('HTML page size', () => {
  test('finds icons on a page that never ends after its <head>', async () => {
    const config = createTestConfig();
    const { stream, state } = endlessBody(
      '<html><head><link rel="icon" href="/icon.png" type="image/png"></head><body>'
    );
    stubFetch({ 'https://huge.example': () => page(stream, 'https://huge.example/') });

    const { favicons } = await findFavicons('https://huge.example', config);

    expect(favicons[0]?.url).toBe('https://huge.example/icon.png');
    expect(state.pulled).toBeLessThan(MAX_HTML_BYTES);
  });

  test('reads no more than MAX_HTML_BYTES of a page without </head>', async () => {
    const config = createTestConfig();
    const { stream, state } = endlessBody(
      '<html><head><link rel="icon" href="/icon.png" type="image/png">'
    );
    stubFetch({ 'https://headless.example': () => page(stream, 'https://headless.example/') });

    const { favicons } = await findFavicons('https://headless.example', config);

    expect(favicons[0]?.url).toBe('https://headless.example/icon.png');
    expect(state.pulled).toBeLessThan(MAX_HTML_BYTES + 128 * 1024);
  });
});

describe('Icon size', () => {
  test('skips an icon larger than MAX_IMAGE_SIZE and tries the next candidate', async () => {
    const config = createTestConfig({ MAX_IMAGE_SIZE: 100_000 });
    const png = await pngIcon();
    const { stream, state } = endlessBody('\x89PNG');
    stubFetch({
      'https://example.com/huge.png': () => new Response(stream),
      'https://example.com/small.png': () => new Response(new Uint8Array(png)),
    });

    const result = await fetchBestFavicon(
      [
        { url: 'https://example.com/huge.png', source: 'link-tag', score: 100 },
        { url: 'https://example.com/small.png', source: 'link-tag', score: 50 },
      ],
      config
    );

    expect(result?.url).toBe('https://example.com/small.png');
    expect(state.pulled).toBeLessThan(200_000);
  });
});

describe('Pixel limit', () => {
  test('rejects images with more pixels than MAX_INPUT_PIXELS', async () => {
    const side = Math.sqrt(MAX_INPUT_PIXELS) + 1;
    const big = await sharp({
      create: { width: side, height: side, channels: 3, background: '#fff' },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();

    expect(await validateImage(big)).toBe(false);
    expect(await validateImage(await pngIcon())).toBe(true);
  });

  test('passes an image through unchanged when no size or format is requested', async () => {
    const png = await pngIcon();
    const result = await processImage(png, {});

    expect(result.data).toBe(png);
    expect(result.format).toBe('png');
    expect(result.width).toBe(32);
    expect(result.height).toBe(32);
  });
});

describe('Concurrent lookups', () => {
  test('serves the fallback with the timeout cache once MAX_CONCURRENT_LOOKUPS are running', async () => {
    const config = createTestConfig({
      REQUEST_TIMEOUT: 1000,
      MAX_CONCURRENT_LOOKUPS: 1,
      CACHE_CONTROL_FALLBACK: 604800,
      CACHE_CONTROL_TIMEOUT: 300,
    });
    await initializeFallbackImage(config);
    const requested = stubFetch({ 'https://slow.example': () => 'hang' });

    const app = createApp(config);
    const first = app.request('http://localhost/slow.example?response=json');
    await Bun.sleep(20);

    const busy = await app.request('http://localhost/other.example?response=json');
    const busyData = await busy.json();
    expect(busyData.source).toBe('default');
    expect(busy.headers.get('cache-control')).toBe('public, max-age=300');
    expect(requested.some((url) => url.includes('other.example'))).toBe(false);

    // Once the first lookup is done, the slot is free again
    await first;
    const requestedAfter = stubFetch({});
    const after = await app.request('http://localhost/other.example?response=json');
    await after.json();
    expect(requestedAfter.some((url) => url.includes('other.example'))).toBe(true);
  });
});
