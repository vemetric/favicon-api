/**
 * Main Hono application
 * Handles API routes and request processing
 */

import type { Context } from 'hono';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppConfig } from './lib/config';
import type { FaviconResult, OutputFormat } from './types';
import { findFavicons, fetchBestFavicon } from './lib/favicon-finder';
import { processImage } from './lib/image-processor';
import { queryParamsSchema } from './lib/validators';
import {
  generateSuccessHeaders,
  generateDefaultHeaders,
  generateErrorHeaders,
} from './lib/http-headers';
import { getContentTypeFromFormat } from './lib/format-detector';
import { logRequest, logFaviconFetch } from './lib/logger';

export function createApp(config: AppConfig) {
  const app = new Hono();

  // CORS middleware
  app.use(
    '*',
    cors({
      origin: config.ALLOWED_ORIGINS === '*' ? '*' : config.ALLOWED_ORIGINS.split(','),
    })
  );

  // Request logging middleware
  app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;

    // Log request
    logRequest({
      method: c.req.method,
      path: c.req.path,
      query: Object.fromEntries(new URL(c.req.url).searchParams),
      statusCode: c.res.status,
      responseTime: duration,
      userAgent: c.req.header('user-agent'),
      ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
    });
  });

  // Health check endpoint
  app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Main favicon endpoint
  app.get('/', async (c) => {
    try {
      // Validate query parameters with Zod
      const schema = queryParamsSchema(config.BLOCK_PRIVATE_IPS);
      const parseResult = schema.safeParse({
        url: c.req.query('url'),
        format: c.req.query('format'),
        size: c.req.query('size'),
        type: c.req.query('type'),
        default: c.req.query('default'),
      });

      // Handle validation errors
      if (!parseResult.success) {
        const headers = generateErrorHeaders(config);
        const firstError = parseResult.error.issues[0];
        const errorMessage = firstError ? firstError.message : 'Invalid request parameters';
        return c.json({ error: errorMessage }, 400, headers);
      }

      const { url, format, size, type, default: defaultImage } = parseResult.data;

      // Find favicons
      const faviconStart = Date.now();
      const favicons = await findFavicons(url, config);

      if (favicons.length === 0) {
        logFaviconFetch({
          url,
          requestFormat: format,
          requestSize: size,
          success: false,
          duration: Date.now() - faviconStart,
          error: 'No favicons found',
        });
        return handleFallback(c, config, format, defaultImage);
      }

      // Fetch best favicon
      const favicon = await fetchBestFavicon(favicons, config);

      if (!favicon || !favicon.data) {
        logFaviconFetch({
          url,
          requestFormat: format,
          requestSize: size,
          success: false,
          duration: Date.now() - faviconStart,
          error: 'Failed to fetch favicon',
        });
        return handleFallback(c, config, format, defaultImage);
      }

      // Log successful favicon fetch
      logFaviconFetch({
        url,
        requestFormat: format,
        requestSize: size,
        source: favicon.source,
        format: favicon.format,
        success: true,
        duration: Date.now() - faviconStart,
      });

      // Process image if needed
      const processed = await processImage(favicon.data, {
        size,
        format: type,
      });

      // Return response based on format
      if (format === 'json') {
        const result: FaviconResult = {
          url: favicons[0]?.url || favicon.data.toString(),
          width: processed.width,
          height: processed.height,
          format: processed.format,
          size: processed.size,
          source: favicon.source,
        };

        const headers = generateSuccessHeaders(config, processed.data);
        return c.json(result, 200, headers);
      }

      // Return image
      const headers = generateSuccessHeaders(config, processed.data);
      const contentType = getContentTypeFromFormat(processed.format);

      return c.body(new Uint8Array(processed.data), 200, {
        ...headers,
        'Content-Type': contentType,
      });
    } catch (error) {
      console.error('Error processing request:', error);
      const headers = generateErrorHeaders(config);
      return c.json({ error: 'Internal server error' }, 500, headers);
    }
  });

  return app;
}

/**
 * Handle fallback when no favicon is found
 */
async function handleFallback(
  c: Context,
  config: AppConfig,
  format: OutputFormat,
  defaultImage?: string
) {
  const fallbackUrl = defaultImage || config.DEFAULT_IMAGE_URL;

  if (!fallbackUrl) {
    const headers = generateErrorHeaders(config);
    return c.json({ error: 'No favicon found and no default image configured' }, 404, headers);
  }

  try {
    // Fetch default image
    const response = await fetch(fallbackUrl, {
      headers: { 'User-Agent': config.USER_AGENT },
      signal: AbortSignal.timeout(config.REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch default image');
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (format === 'json') {
      const result: FaviconResult = {
        url: fallbackUrl,
        width: 0,
        height: 0,
        format: 'png',
        size: buffer.length,
        source: 'default',
      };

      const headers = generateDefaultHeaders(config);
      return c.json(result, 200, headers);
    }

    const headers = generateDefaultHeaders(config);
    return c.body(new Uint8Array(buffer), 200, {
      ...headers,
      'Content-Type': 'image/png',
    });
  } catch (error) {
    console.error('Error fetching default image:', error);
    const headers = generateErrorHeaders(config);
    return c.json({ error: 'Failed to fetch default image' }, 500, headers);
  }
}
