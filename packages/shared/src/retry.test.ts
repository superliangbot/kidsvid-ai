import { describe, it, expect, vi } from 'vitest';
import { withRetry, isRetryableError } from './retry.js';
import type { Logger } from './logger.js';

const mockLogger: Logger = {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
} as unknown as Logger;

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, mockLogger, 'test');
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockResolvedValue('ok');
    const result = await withRetry(fn, mockLogger, 'test', { initialDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));
    await expect(
      withRetry(fn, mockLogger, 'test', { maxAttempts: 3, initialDelayMs: 1 }),
    ).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('skips retry when retryOn returns false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('not retryable'));
    await expect(
      withRetry(fn, mockLogger, 'test', { initialDelayMs: 1, retryOn: () => false }),
    ).rejects.toThrow('not retryable');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses exponential backoff', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');
    const start = Date.now();
    await withRetry(fn, mockLogger, 'test', { initialDelayMs: 10, backoffMultiplier: 2 });
    // First retry: 10ms, second retry: 20ms = ~30ms total
    expect(Date.now() - start).toBeGreaterThanOrEqual(20);
  });

  it('caps delay at maxDelayMs', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');
    await withRetry(fn, mockLogger, 'test', {
      initialDelayMs: 100,
      maxDelayMs: 5,
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('isRetryableError', () => {
  it('returns true for 429 rate limit', () => {
    expect(isRetryableError(new Error('HTTP 429 Too Many Requests'))).toBe(true);
  });

  it('returns true for 500 server error', () => {
    expect(isRetryableError(new Error('Internal Server Error 500'))).toBe(true);
  });

  it('returns true for 503 service unavailable', () => {
    expect(isRetryableError(new Error('503 Service Unavailable'))).toBe(true);
  });

  it('returns true for network errors', () => {
    expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
    expect(isRetryableError(new Error('fetch failed'))).toBe(true);
  });

  it('returns true for quota errors', () => {
    expect(isRetryableError(new Error('quota exceeded'))).toBe(true);
  });

  it('returns false for auth errors', () => {
    expect(isRetryableError(new Error('401 Unauthorized'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isRetryableError('string error')).toBe(false);
    expect(isRetryableError(null)).toBe(false);
  });
});
