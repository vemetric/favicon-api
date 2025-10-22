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
import { getCachedFallback, fetchCustomDefault } from './lib/fallback-image';

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

  // Root endpoint - redirect to documentation when no path param or query params
  app.get('/', async (c) => {
    const url = new URL(c.req.url);
    // Check if there are no query parameters - redirect to docs
    if (url.search === '' || url.searchParams.toString() === '') {
      return c.redirect('https://vemetric.com/favicon-api', 302);
    }

    // If there are query params but no URL, return fallback image
    try {
      const schema = queryParamsSchema(config.BLOCK_PRIVATE_IPS);
      const parseResult = schema.safeParse({
        url: undefined, // No URL provided
        response: c.req.query('response'),
        size: c.req.query('size'),
        format: c.req.query('format'),
        default: c.req.query('default'),
      });

      // If validation fails, just use defaults
      const response = (parseResult.success ? parseResult.data.response : 'image') as OutputFormat;
      const defaultImage = parseResult.success ? parseResult.data.default : undefined;
      const size = parseResult.success ? parseResult.data.size : undefined;
      const format = parseResult.success ? parseResult.data.format : undefined;

      return await handleFallback(c, config, response, defaultImage, size, format);
    } catch (error) {
      logger.error({ err: error }, 'Error processing root request with query params');
      const headers = generateErrorHeaders(config);
      return c.json({ error: 'Internal server error' }, 500, headers);
    }
  });

  // Main favicon endpoint - uses path parameter for URL
  app.get('/:url{.+}', async (c) => {
    try {
      // Extract request headers for analytics
      const requestHeaders = {
        origin: c.req.header('origin'),
        referer: c.req.header('referer'),
        ip: getClientIp(c) || undefined,
      };

      // Get URL from path parameter
      const urlParam = c.req.param('url');

      // Validate query parameters with Zod
      const schema = queryParamsSchema(config.BLOCK_PRIVATE_IPS);
      const parseResult = schema.safeParse({
        url: urlParam,
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
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), config.REQUEST_TIMEOUT)
      );
      const faviconStart = Date.now();
      const favicon = await Promise.race([
        new Promise<{ data: Buffer; format: string; source: string; url: string } | null>(
          // oxlint-disable-next-line no-async-promise-executor
          async (resolve) => {
            try {
              const favicons = await findFavicons(url, config);
              if (favicons == null || favicons.length === 0) {
                resolve(null);
              } else {
                resolve(await fetchBestFavicon(favicons, config));
              }
            } catch {
              resolve(null);
            }
          }
        ),
        timeoutPromise,
      ]);

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
        return handleFallback(c, config, response, defaultImage, size, format);
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
        // Use the original path parameter to preserve user input format
        const apiUrl = new URL(requestUrl.origin + '/' + (c.req.param('url') || url));
        if (size) {
          apiUrl.searchParams.set('size', size.toString());
        }
        if (format) {
          apiUrl.searchParams.set('format', format);
        }
        // Don't include response=json since we want the image URL

        const result: FaviconResult = {
          url: apiUrl.toString(),
          sourceUrl: favicon?.url || 'unknown',
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
  defaultImage?: string,
  size?: number,
  format?: 'png' | 'jpg' | 'jpeg' | 'ico' | 'webp' | 'svg'
) {
  try {
    let buffer: Buffer;
    let imageFormat: string;
    let sourceUrl: string;
    let width: number;
    let height: number;

    // If a custom default image URL is provided, fetch it
    if (defaultImage) {
      const customDefault = await fetchCustomDefault(defaultImage, config);
      buffer = customDefault.buffer;
      imageFormat = customDefault.format;
      sourceUrl = customDefault.sourceUrl;
      width = customDefault.width;
      height = customDefault.height;
    } else {
      // Use the cached fallback image
      const cachedFallback = getCachedFallback();
      buffer = cachedFallback.buffer;
      imageFormat = cachedFallback.format;
      sourceUrl = cachedFallback.sourceUrl;
      width = cachedFallback.width;
      height = cachedFallback.height;
    }

    // Process image if size or format is specified
    if (size || format) {
      const processed = await processImage(buffer, { size, format });
      buffer = processed.data;
      imageFormat = processed.format;
      width = processed.width;
      height = processed.height;
    }

    if (response === 'json') {
      // Build API URL for the default image
      const requestUrl = new URL(c.req.url);
      // Use original path parameter to preserve user input format
      const originalUrl = c.req.param('url');
      const apiUrl = new URL(requestUrl.origin + '/' + (originalUrl || ''));
      if (defaultImage) {
        apiUrl.searchParams.set('default', defaultImage);
      }

      const result: FaviconResult = {
        url: apiUrl.toString(),
        sourceUrl,
        width,
        height,
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
