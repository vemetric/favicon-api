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
import { logRequest, logFaviconFetch, logger } from './lib/logger';
import { getClientIp } from './lib/request-ip';

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
      ip: getClientIp(c) || undefined,
    });
  });

  // Health check endpoint
  app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Main favicon endpoint
  app.get('/', async (c) => {
    try {
      // Extract request headers for analytics
      const requestHeaders = {
        origin: c.req.header('origin'),
        referer: c.req.header('referer'),
        ip: getClientIp(c) || undefined,
      };

      // Validate query parameters with Zod
      const schema = queryParamsSchema(config.BLOCK_PRIVATE_IPS);
      const parseResult = schema.safeParse({
        url: c.req.query('url'),
        response: c.req.query('response'),
        size: c.req.query('size'),
        format: c.req.query('format'),
        default: c.req.query('default'),
      });

      // Handle validation errors
      if (!parseResult.success) {
        const headers = generateErrorHeaders(config);
        const firstError = parseResult.error.issues[0];
        const errorMessage = firstError ? firstError.message : 'Invalid request parameters';
        return c.json({ error: errorMessage }, 400, headers);
      }

      const { url, response, size, format, default: defaultImage } = parseResult.data;

      // Find favicons
      const faviconStart = Date.now();
      const favicons = await findFavicons(url, config);

      if (favicons.length === 0) {
        logFaviconFetch({
          url,
          format,
          response,
          size,
          success: false,
          duration: Date.now() - faviconStart,
          error: 'No favicons found',
          headers: requestHeaders,
        });
        return handleFallback(c, config, response, defaultImage);
      }

      // Fetch best favicon
      const favicon = await fetchBestFavicon(favicons, config);

      if (!favicon || !favicon.data) {
        logFaviconFetch({
          url,
          faviconUrl: favicon?.url,
          source: favicon?.source,
          response,
          format: favicon?.format || format,
          size,
          success: false,
          duration: Date.now() - faviconStart,
          error: 'Failed to fetch favicon',
          headers: requestHeaders,
        });
        return handleFallback(c, config, response, defaultImage);
      }

      // Log successful favicon fetch
      logFaviconFetch({
        url,
        faviconUrl: favicon.url,
        response,
        size,
        source: favicon.source,
        format: favicon.format,
        success: true,
        duration: Date.now() - faviconStart,
        headers: requestHeaders,
      });

      // Process image if needed
      const processed = await processImage(favicon.data, {
        size,
        format,
      });

      // Return response based on response type
      if (response === 'json') {
        // Build API URL for the processed image
        const requestUrl = new URL(c.req.url);
        const apiUrl = new URL(requestUrl.origin + requestUrl.pathname);
        // Use original query parameter to preserve user input format
        apiUrl.searchParams.set('url', c.req.query('url') || url);
        if (size) {
          apiUrl.searchParams.set('size', size.toString());
        }
        if (format) {
          apiUrl.searchParams.set('format', format);
        }
        // Don't include response=json since we want the image URL

        const result: FaviconResult = {
          url: apiUrl.toString(),
          sourceUrl: favicons[0]?.url || 'unknown',
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
      logger.error({ err: error }, 'Error processing request');
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
  response: OutputFormat,
  defaultImage?: string
) {
  const fallbackUrl = defaultImage || config.DEFAULT_IMAGE_URL;

  try {
    let buffer: Buffer;
    let imageFormat: string;
    let sourceUrl: string;

    // Use local default.svg if no fallback URL is provided
    if (!fallbackUrl) {
      const defaultSvgPath = new URL('./default.svg', import.meta.url).pathname;
      const file = Bun.file(defaultSvgPath);
      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      imageFormat = 'svg';
      sourceUrl = 'default.svg';
    } else {
      // Fetch default image from URL
      const response = await fetch(fallbackUrl, {
        headers: { 'User-Agent': config.USER_AGENT },
        signal: AbortSignal.timeout(config.REQUEST_TIMEOUT),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch default image');
      }

      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      // Detect format from URL or assume PNG
      imageFormat = fallbackUrl.endsWith('.svg') ? 'svg' : 'png';
      sourceUrl = fallbackUrl;
    }

    if (response === 'json') {
      // Build API URL for the default image
      const requestUrl = new URL(c.req.url);
      const apiUrl = new URL(requestUrl.origin + requestUrl.pathname);
      // Use original query parameter to preserve user input format
      const originalUrl = c.req.query('url');
      if (originalUrl) {
        apiUrl.searchParams.set('url', originalUrl);
      }
      if (defaultImage) {
        apiUrl.searchParams.set('default', defaultImage);
      }

      const result: FaviconResult = {
        url: apiUrl.toString(),
        sourceUrl,
        width: 0,
        height: 0,
        format: imageFormat,
        size: buffer.length,
        source: 'default',
      };

      const headers = generateDefaultHeaders(config);
      return c.json(result, 200, headers);
    }

    const headers = generateDefaultHeaders(config);
    const contentType = imageFormat === 'svg' ? 'image/svg+xml' : 'image/png';
    return c.body(new Uint8Array(buffer), 200, {
      ...headers,
      'Content-Type': contentType,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching default image');
    const headers = generateErrorHeaders(config);
    return c.json({ error: 'Failed to fetch default image' }, 500, headers);
  }
}
