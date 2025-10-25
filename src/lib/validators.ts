/**
 * Input validation and SSRF protection using Zod
 */

import { z } from 'zod';

/**
 * Check if hostname is a private IP address
 */
function isPrivateIp(hostname: string): boolean {
  // Localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return true;
  }

  // Private IP ranges
  const privateRanges = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^192\.168\./,
    /^169\.254\./, // Link-local
    /^fc00:/, // IPv6 unique local
    /^fe80:/, // IPv6 link-local
  ];

  return privateRanges.some((range) => range.test(hostname));
}

/**
 * Custom Zod refinement for URL validation with SSRF protection
 */
const createUrlValidator = (blockPrivateIps: boolean) =>
  z
    .string({ message: 'URL is required' })
    .min(1, 'URL is required')
    .transform((url) => {
      // Add protocol if missing
      return url.startsWith('http') ? url : `https://${url}`;
    })
    .pipe(
      z
        .string()
        .url('Invalid URL format')
        .refine(
          (url) => {
            try {
              const parsed = new URL(url);
              // Check protocol
              if (!['http:', 'https:'].includes(parsed.protocol)) {
                return false;
              }
              // Check that hostname is not empty
              if (!parsed.hostname) {
                return false;
              }
              // SSRF protection
              if (blockPrivateIps && isPrivateIp(parsed.hostname)) {
                return false;
              }
              return true;
            } catch {
              // If URL constructor throws, it's an invalid URL
              return false;
            }
          },
          {
            message: 'Invalid URL or access to private IPs not allowed',
          }
        )
    );

// Query parameter schema
export const queryParamsSchema = (blockPrivateIps: boolean) =>
  z.object({
    url: createUrlValidator(blockPrivateIps),
    response: z.enum(['image', 'json']).default('image'),
    size: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : undefined))
      .pipe(
        z
          .number()
          .int()
          .min(16, 'Size must be between 16 and 512 pixels')
          .max(512, 'Size must be between 16 and 512 pixels')
          .optional()
      ),
    format: z.enum(['png', 'jpg', 'webp']).optional(),
    default: z.url('Default image must be a valid URL').optional(),
  });

export type QueryParams = z.infer<ReturnType<typeof queryParamsSchema>>;
