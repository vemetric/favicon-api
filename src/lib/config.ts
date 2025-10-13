/**
 * Configuration management for the Favicon API
 * Loads and validates environment variables using Zod
 */

import { z } from 'zod';

// Zod schema for environment variables
const envSchema = z.object({
  // Server configuration
  PORT: z.string().default('3000').transform(Number).pipe(z.number().int().min(1).max(65535)),
  HOST: z.string().default('0.0.0.0'),

  // Fallback image
  DEFAULT_IMAGE_URL: z.string().url().optional(),

  // Cache control headers (in seconds)
  CACHE_CONTROL_SUCCESS: z
    .string()
    .default('86400')
    .transform(Number)
    .pipe(z.number().int().min(0)),
  CACHE_CONTROL_DEFAULT: z.string().default('3600').transform(Number).pipe(z.number().int().min(0)),
  CACHE_CONTROL_ERROR: z.string().default('60').transform(Number).pipe(z.number().int().min(0)),

  // Request handling
  REQUEST_TIMEOUT: z.string().default('5000').transform(Number).pipe(z.number().int().min(1000)),
  MAX_IMAGE_SIZE: z.string().default('5242880').transform(Number).pipe(z.number().int().min(1024)),
  USER_AGENT: z.string().default('Vemetric-FaviconAPI/1.0'),

  // CORS
  ALLOWED_ORIGINS: z.string().default('*'),

  // Security
  BLOCK_PRIVATE_IPS: z
    .string()
    .default('true')
    .transform((val) => val !== 'false'),
  MAX_REDIRECTS: z.string().default('5').transform(Number).pipe(z.number().int().min(0).max(20)),

  // Logging (Axiom integration - optional)
  AXIOM_DATASET: z.string().optional(),
  AXIOM_TOKEN: z.string().optional(),

  // Analytics (Vemetric integration - optional)
  VEMETRIC_TOKEN: z.string().optional(),
  VEMETRIC_HOST: z.string().optional(),
});

// Infer the TypeScript type from the schema
export type AppConfig = z.infer<typeof envSchema>;

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): AppConfig {
  try {
    const config = envSchema.parse({
      PORT: process.env.PORT,
      HOST: process.env.HOST,
      DEFAULT_IMAGE_URL: process.env.DEFAULT_IMAGE_URL,
      CACHE_CONTROL_SUCCESS: process.env.CACHE_CONTROL_SUCCESS,
      CACHE_CONTROL_DEFAULT: process.env.CACHE_CONTROL_DEFAULT,
      CACHE_CONTROL_ERROR: process.env.CACHE_CONTROL_ERROR,
      REQUEST_TIMEOUT: process.env.REQUEST_TIMEOUT,
      MAX_IMAGE_SIZE: process.env.MAX_IMAGE_SIZE,
      USER_AGENT: process.env.USER_AGENT,
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
      BLOCK_PRIVATE_IPS: process.env.BLOCK_PRIVATE_IPS,
      MAX_REDIRECTS: process.env.MAX_REDIRECTS,
      AXIOM_DATASET: process.env.AXIOM_DATASET,
      AXIOM_TOKEN: process.env.AXIOM_TOKEN,
      VEMETRIC_TOKEN: process.env.VEMETRIC_TOKEN,
      VEMETRIC_HOST: process.env.VEMETRIC_HOST,
    });

    // Note: Don't use logger here as it may not be initialized yet
    // eslint-disable-next-line no-console
    console.info('✓ Configuration loaded and validated successfully');
    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      // eslint-disable-next-line no-console
      console.error('✗ Configuration validation failed:');
      error.issues.forEach((issue) => {
        // eslint-disable-next-line no-console
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
      });
      throw new Error('Invalid configuration');
    }
    throw error;
  }
}
