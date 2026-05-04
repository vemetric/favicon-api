/**
 * Timeout behavior tests for favicon fetching.
 */

import { describe, expect, test } from 'bun:test';
import type { AppConfig } from '../../src/lib/config';
import { fetchBestFavicon } from '../../src/lib/favicon-finder';

const testConfig: AppConfig = {
  PORT: 3000,
  HOST: '127.0.0.1',
  CACHE_CONTROL_SUCCESS: 604800,
  CACHE_CONTROL_ERROR: 604800,
  REQUEST_TIMEOUT: 2000,
  MAX_IMAGE_SIZE: 5242880,
  USER_AGENT: 'FaviconAPI/Test',
  ALLOWED_ORIGINS: '*',
  BLOCK_PRIVATE_IPS: false,
  MAX_REDIRECTS: 5,
  USE_FALLBACK_API: false,
};

describe('Favicon timeout handling', () => {
  test('stops trying favicon candidates after the request signal is aborted', async () => {
    const originalFetch = globalThis.fetch;
    let requestCount = 0;
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      requestCount += 1;

      return new Promise<Response>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          resolve(new Response('too late', { status: 404 }));
        }, 1000);

        init?.signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timeoutId);
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          },
          { once: true }
        );
      });
    }) as typeof fetch;

    const abortController = new AbortController();
    const abortTimeout = setTimeout(() => abortController.abort(), 50);
    const start = Date.now();

    try {
      const result = await fetchBestFavicon(
        [
          {
            url: 'https://example.com/favicon-1.ico',
            source: 'fallback',
            score: 10,
          },
          {
            url: 'https://example.com/favicon-2.ico',
            source: 'fallback',
            score: 9,
          },
          {
            url: 'https://example.com/favicon-3.ico',
            source: 'fallback',
            score: 8,
          },
        ],
        testConfig,
        abortController.signal
      );

      expect(result).toBeNull();
      expect(Date.now() - start).toBeLessThan(500);
      expect(requestCount).toBe(1);
    } finally {
      clearTimeout(abortTimeout);
      globalThis.fetch = originalFetch;
    }
  });
});
