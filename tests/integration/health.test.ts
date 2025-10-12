/**
 * Health endpoint integration tests
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startTestServer, stopTestServer, fetchWithTimeout } from './setup';

describe('Health Endpoint', () => {
  let baseUrl: string;

  beforeAll(async () => {
    baseUrl = await startTestServer();
  });

  afterAll(async () => {
    await stopTestServer();
  });

  test('should return 200 OK', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/health`);
    expect(response.status).toBe(200);
  });

  test('should return JSON with status ok', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/health`);
    const data = await response.json();
    expect(data.status).toBe('ok');
  });

  test('should include timestamp', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/health`);
    const data = await response.json();
    expect(data.timestamp).toBeDefined();
    expect(typeof data.timestamp).toBe('string');

    // Verify it's a valid ISO date
    const date = new Date(data.timestamp);
    expect(date.toString()).not.toBe('Invalid Date');
  });

  test('should have correct content-type', async () => {
    const response = await fetchWithTimeout(`${baseUrl}/health`);
    const contentType = response.headers.get('content-type');
    expect(contentType).toContain('application/json');
  });
});
