/**
 * Structured logging with Pino
 * Provides fast, structured JSON logging for production
 * In production, sends logs to Axiom if configured
 */

import pino from 'pino';
import { trackFaviconFetch } from './analytics';

const isDevelopment = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test';

// Check if Axiom is configured
const hasAxiomConfig = Boolean(
  isProduction && process.env.AXIOM_DATASET && process.env.AXIOM_TOKEN
);

/**
 * Create configured logger instance
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (isTest ? 'silent' : isDevelopment ? 'debug' : 'info'),

  // Transport configuration
  transport: isTest
    ? // Test: no transport needed (silent)
      undefined
    : isDevelopment
      ? // Development: pretty console output
        {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : hasAxiomConfig
        ? // Production with Axiom: send to Axiom
          {
            target: '@axiomhq/pino',
            options: {
              dataset: process.env.AXIOM_DATASET,
              token: process.env.AXIOM_TOKEN,
            },
          }
        : // Production without Axiom: JSON to stdout
          undefined,

  // Base fields included in every log
  base: {
    service: 'favicon-api',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  },

  // Serialize errors properly
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
});

/**
 * Log HTTP request
 * Logs failures at error/warn level, successes at debug level only
 */
export function logRequest(data: {
  method: string;
  path: string;
  query: Record<string, string | undefined>;
  statusCode: number;
  responseTime: number;
  userAgent?: string;
  ip?: string;
}) {
  const logData = {
    type: 'http_request',
    method: data.method,
    path: data.path,
    query: data.query,
    statusCode: data.statusCode,
    responseTime: data.responseTime,
    userAgent: data.userAgent,
    ip: data.ip,
  };

  const message = `${data.method} ${data.path} ${data.statusCode} ${data.responseTime}ms`;

  // Log based on status code
  if (data.statusCode >= 500) {
    logger.error(logData, message);
  } else if (data.statusCode >= 400) {
    logger.warn(logData, message);
  } else {
    // Success - only log at debug level (hidden in production by default)
    logger.debug(logData, message);
  }
}

/**
 * Log favicon fetch operation
 */
export function logFaviconFetch(data: {
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
}) {
  const level = data.success ? 'info' : 'error';
  logger[level](
    {
      type: 'favicon_fetch',
      url: data.url,
      faviconUrl: data.faviconUrl,
      source: data.source,
      format: data.format,
      response: data.response,
      size: data.size,
      success: data.success,
      duration: data.duration,
      error: data.error,
    },
    `Favicon fetch ${data.success ? 'success' : 'failed'} for ${data.url}`
  );

  // Track analytics event (non-blocking)
  trackFaviconFetch(data).catch((err) => {
    logger.error({ err }, 'Vemetric - Failed to track event');
  });
}

/**
 * Log cache header information
 */
export function logCacheInfo(data: {
  url: string;
  cacheType: 'success' | 'default' | 'error';
  maxAge: number;
}) {
  logger.debug(
    {
      type: 'cache_info',
      url: data.url,
      cacheType: data.cacheType,
      maxAge: data.maxAge,
    },
    `Cache headers set: ${data.cacheType} (max-age=${data.maxAge}s)`
  );
}
