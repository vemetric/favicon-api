/**
 * Helpers for composing request-scoped and per-operation abort signals.
 */

export function withTimeout(timeout: number, signal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeout);

  if (!signal) {
    return timeoutSignal;
  }

  if (signal.aborted) {
    return signal;
  }

  return AbortSignal.any([signal, timeoutSignal]);
}
