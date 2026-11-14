/** Bound transport and body parsing, including browsers that ignore abort. */
export async function withRequestDeadline<T>(operation: (signal: AbortSignal) => Promise<T>, milliseconds: number, message: string, parent?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let rejectDeadline!: (reason: Error) => void;
  const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
  const cancel = () => { rejectDeadline(new DOMException('Aborted', 'AbortError')); controller.abort(); };
  if (parent?.aborted) cancel(); else parent?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { rejectDeadline(new Error(message)); controller.abort(); }, milliseconds);
  try { return await Promise.race([deadline, Promise.resolve().then(() => {
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return operation(controller.signal);
  })]); }
  finally { clearTimeout(timer); parent?.removeEventListener('abort', cancel); }
}
