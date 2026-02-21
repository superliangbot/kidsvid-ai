import type { Logger } from './logger.js';

/** Retry with exponential backoff for all API calls. */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryOn?: (error: unknown) => boolean;
}

const DEFAULTS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30_000,
  backoffMultiplier: 2,
  retryOn: () => true,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  logger: Logger,
  label: string,
  options?: RetryOptions,
): Promise<T> {
  const opts = { ...DEFAULTS, ...options };
  let lastError: unknown;
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);

      if (attempt >= opts.maxAttempts || !opts.retryOn(err)) {
        logger.error({ attempt, label, error: message }, 'All retries exhausted');
        throw err;
      }

      logger.warn(
        { attempt, maxAttempts: opts.maxAttempts, label, error: message, nextRetryMs: delay },
        'Retrying after failure',
      );

      await sleep(delay);
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  throw lastError;
}

/** Returns true if the error is retryable (network/transient errors) */
export function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();

  // Rate limits
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests')) return true;
  // Server errors
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) return true;
  // Network errors
  if (msg.includes('econnreset') || msg.includes('etimedout') || msg.includes('fetch failed') || msg.includes('network')) return true;
  // Quota — retryable with longer delay
  if (msg.includes('quota')) return true;

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
