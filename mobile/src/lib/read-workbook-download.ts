import type { MobileWorkbookExport } from '../../../shared/mobile-export';
import { isMobileFileExport } from '../../../shared/mobile-export';

export const WORKBOOK_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_BYTES = 12 * 1024 * 1024;
/** Bounded binary wire format; conversion yields so large exports don't freeze UI. */
export async function readWorkbookDownload(response: Response, signal?: AbortSignal): Promise<MobileWorkbookExport> {
  const filename = response.headers.get('X-Export-Filename') || '';
  const count = response.headers.get('X-Export-Row-Count') || '';
  const rowCount = /^\d{1,12}$/.test(count) ? Number(count) : NaN;
  if (!isMobileFileExport({ filename, mimeType: WORKBOOK_MIME, rowCount, contentBase64: 'UEsDBA==' }))
    throw Error('Thông tin file Excel không hợp lệ. Tải lại để đối chiếu.');
  const size = response.headers.get('Content-Length');
  if (size !== null && (!/^\d+$/.test(size) || Number(size) > MAX_BYTES)) throw Error('File Excel quá lớn. Thu hẹp bộ lọc rồi thử lại.');
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body?.getReader();
  if (reader) {
    try {
      while (true) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const part = await reader.read(); if (part.done) break;
        total += part.value.length;
        if (total > MAX_BYTES) throw Error('File Excel quá lớn. Thu hẹp bộ lọc rồi thử lại.');
        chunks.push(part.value);
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  } else {
    const bytes = new Uint8Array(await response.arrayBuffer()); total = bytes.length; chunks.push(bytes);
  }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (total < 4 || total > MAX_BYTES || size !== null && Number(size) !== total) throw Error('Chưa tải đủ file Excel. Thử lại trước khi lưu.');
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (bytes[0] !== 80 || bytes[1] !== 75 || bytes[2] !== 3 || bytes[3] !== 4) throw Error('Nội dung file Excel không hợp lệ.');
  const encoded: string[] = [];
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  // Multiples of three let independently encoded blocks concatenate losslessly.
  for (let at = 0; at < bytes.length; at += 48 * 1024) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const block = bytes.subarray(at, at + 48 * 1024);
    let text = '';
    for (let i = 0; i < block.length; i += 3) {
      const word = block[i] << 16 | (block[i + 1] || 0) << 8 | (block[i + 2] || 0);
      text += alphabet[word >>> 18 & 63] + alphabet[word >>> 12 & 63] +
        (i + 1 < block.length ? alphabet[word >>> 6 & 63] : '=') +
        (i + 2 < block.length ? alphabet[word & 63] : '=');
    }
    encoded.push(text);
    if (at + block.length < bytes.length) await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  return { filename, mimeType: WORKBOOK_MIME, rowCount, contentBase64: encoded.join('') };
}
