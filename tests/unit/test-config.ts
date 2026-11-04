/**
 * Shared AppConfig for unit tests
 */

import type { AppConfig } from '../../src/lib/config';

export function createTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    PORT: 3000,
    HOST: '127.0.0.1',
    CACHE_CONTROL_SUCCESS: 604800,
    CACHE_CONTROL_FALLBACK: 604800,
    CACHE_CONTROL_ERROR: 604800,
    REQUEST_TIMEOUT: 2000,
    MAX_IMAGE_SIZE: 5242880,
    USER_AGENT: 'FaviconAPI/Test',
    ALLOWED_ORIGINS: '*',
    BLOCK_PRIVATE_IPS: false,
    MAX_REDIRECTS: 5,
    USE_FALLBACK_API: false,
    ...overrides,
  };
}
