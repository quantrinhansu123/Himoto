import 'server-only';

/** Retry only a failed connection/read, never authentication or a DB write. */
export function isTransientSessionRead(error: unknown) {
  if (!(error instanceof Error)) return false;
  const code = String((error as Error & { code?: string }).code || '');
  return /^(08\w{3}|57P0[123]|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE)$/.test(code)
    || /^(Connection terminated unexpectedly|Connection terminated due to connection timeout|timeout exceeded when trying to connect|Connection ended unexpectedly)$/i.test(error.message);
}

export async function retrySessionRead<T>(read: () => Promise<T>): Promise<T> {
  try { return await read(); }
  catch (error) {
    if (!isTransientSessionRead(error)) throw error;
    await new Promise(resolve => setTimeout(resolve, 200));
    return read();
  }
}

export function logSessionUnavailable(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  // Do not log credentials, SQL, connection URLs or raw exception messages.
  console.error('Session database unavailable', /^[A-Z0-9]{5,20}$/.test(code) ? code : isTransientSessionRead(error) ? 'CONNECTION_INTERRUPTED' : 'UNKNOWN');
}
