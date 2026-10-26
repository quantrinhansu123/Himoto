function timeoutReason(): unknown {
  try { return new DOMException('The operation was aborted due to timeout', 'TimeoutError'); }
  catch { return new Error('The operation was aborted due to timeout'); }
}

/** Safari before 16 has AbortController but not AbortSignal.timeout. */
export function abortTimeout(milliseconds: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(milliseconds);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(timeoutReason()), milliseconds);
  if (typeof timer === 'object' && timer && 'unref' in timer) timer.unref();
  return controller.signal;
}

/** Safari before 17.4 has no AbortSignal.any. */
export function abortAny(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(signals);
  const controller = new AbortController();
  const abort = (signal: AbortSignal) => controller.abort(signal.reason);
  for (const signal of signals) {
    if (signal.aborted) { abort(signal); return controller.signal; }
    signal.addEventListener('abort', () => abort(signal), { once: true });
  }
  return controller.signal;
}
