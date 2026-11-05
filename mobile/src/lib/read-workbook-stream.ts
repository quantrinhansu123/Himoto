import { isMobileStoreMatchFilePage, type MobileStoreMatchFilePage } from '../../../shared/mobile-customer-store-import';
/** SDK58 fetch exposes a ReadableStream on native and web. Upload only once. */
export async function readStoreMatchStream(origin: string, token: string | undefined, name: string, bytes: ArrayBuffer, onPart: (part: MobileStoreMatchFilePage) => void, signal: AbortSignal, expired?: () => void) {
  const controller = new AbortController(), abort = () => controller.abort(), timer = setTimeout(abort, 120000);
  if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(`${origin}/api/mobile/v1/imports/customer-stores/file`, { method: 'POST', body: bytes, signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store', headers: { Accept: 'application/x-ndjson', 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(name), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    if (!response.ok) { if (response.status === 401) expired?.(); const error = await response.json().catch(() => null); throw Error(typeof error?.message === 'string' ? error.message : 'Chưa đọc được file Excel. Thử lại.'); }
    if (!response.body || response.headers.get('content-type')?.split(';')[0] !== 'application/x-ndjson') { await response.body?.cancel().catch(() => {}); throw Error('Máy chủ hoặc ứng dụng chưa hỗ trợ đọc Excel theo từng phần.'); }
    const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
    let text = '', identity: MobileStoreMatchFilePage | null = null, expected = 0, complete = false;
    function part(line: string) {
      if (controller.signal.aborted) throw Error('Đã dừng đọc file Excel.');
      let value: unknown; try { value = JSON.parse(line); } catch { throw Error('Nội dung đọc file Excel không hợp lệ. Thử lại.'); }
      if (!isMobileStoreMatchFilePage(value) || complete || value.offset !== expected || value.filename !== name || identity && (value.sha256 !== identity.sha256 || value.total !== identity.total)) throw Error('Các phần file không khớp. Chọn lại file trước khi kiểm tra.');
      identity ||= value; expected += value.inputs.length; complete = value.nextOffset === null; onPart(value);
    }
    try {
      while (true) {
        const next = await reader.read(); if (next.done) break;
        text += decoder.decode(next.value, { stream: true }); let at: number;
        while ((at = text.indexOf('\n')) >= 0) { if (at > 6 * 1024 * 1024) throw Error('Một phần file quá lớn. Thu gọn nội dung các ô rồi thử lại.'); part(text.slice(0, at)); text = text.slice(at + 1); }
        if (text.length > 6 * 1024 * 1024) throw Error('Phần file quá lớn để kiểm tra.');
      }
      text += decoder.decode(); if (text || !identity || !complete) throw Error('Chưa đọc đủ file Excel. File gốc được giữ; thử lại trước khi cập nhật.');
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}
