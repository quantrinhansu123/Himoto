import 'server-only';
import { validatePhotoBytes } from './record-photos';
/** Embed only the QR built by the actual reader. No bearer/storage URL reaches HTML. */
export async function mobilePrintQrImage(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'vietqr.app' || url.pathname !== '/img' || url.port || url.username || url.password) throw Error('Invalid QR image origin');
  const response = await fetch(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000) });
  const type = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (!response.ok || !['image/png', 'image/jpeg'].includes(type)) { await response.body?.cancel(); throw Error('QR image unavailable'); }
  const reader = response.body?.getReader(); if (!reader) throw Error('QR image unavailable');
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > 512 * 1024) { await reader.cancel(); throw Error('QR image too large'); } chunks.push(part.value); }
  } finally { reader.releaseLock(); }
  const data = Buffer.concat(chunks); validatePhotoBytes(type, data); return `data:${type};base64,${data.toString('base64')}`;
}
