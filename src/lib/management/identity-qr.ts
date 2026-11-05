import type { OcrResult } from './photo-ocr';

const WASM_PATH = '/vendor/zxing/3.1.6/zxing_reader.wasm';
const options = { formats: ['QRCode'] as const, tryHarder: true, tryRotate: true,
  tryInvert: true, tryDownscale: true, maxNumberOfSymbols: 4, textMode: 'Plain' as const };

type Identity = { result: OcrResult; identifiers: string[] };
function parseIdentity(value: string): Identity | undefined {
  const parts = value.trim().split('|');
  const number = parts[0]?.trim();
  const name = parts[2]?.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim();
  if (parts.length < 7 || !/^\d{12}$/.test(number) || !name || name.length > 255) return;
  const issued = parts[6].trim();
  if (!/^\d{8}$/.test(issued)) return;
  const date = `${issued.slice(4)}-${issued.slice(2,4)}-${issued.slice(0,2)}`;
  if (!Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date) return;
  const oldNumber = parts[1].trim();
  return { result: { fields: { id_card: number, name, id_card_issued_on: date },
    warnings: ['Kiểm tra thông tin từ QR trước khi lưu. QR không có nơi cấp; bổ sung nếu còn thiếu.'] },
    identifiers: [number, ...(/^\d{9}$/.test(oldNumber) ? [oldNumber] : [])] };
}
export function parseIdentityQr(value: string): OcrResult | undefined { return parseIdentity(value)?.result; }

let readerPromise: Promise<typeof import('zxing-wasm/reader')> | undefined;
function reader() {
  if (!readerPromise) readerPromise = import('zxing-wasm/reader').then(module => {
    // The pinned decoder is served by this application; card data stays local.
    module.prepareZXingModule({overrides: {locateFile: (name, prefix) => name.endsWith('.wasm') ? WASM_PATH : prefix + name}});
    return module;
  }).catch(error => { readerPromise = undefined; throw error; });
  return readerPromise;
}

async function identities(pixels: ImageData): Promise<Identity[]> {
  const module = await reader();
  try {
    const decoded = await module.readBarcodes(pixels, {...options, formats: [...options.formats]});
    return decoded.map(item => parseIdentity(item.text)).filter((item): item is Identity => Boolean(item));
  } catch {
    module.purgeZXingModule(); readerPromise = undefined;
    throw new Error('Chưa tải được bộ quét QR. Kiểm tra kết nối và thử lại.');
  }
}
/** Used by the camera preview; no image or QR content is sent to a server. */
export async function containsIdentityQr(pixels: ImageData): Promise<boolean> {
  return (await identities(pixels)).length > 0;
}

export async function readIdentityQr(files: File[], signal: AbortSignal, expectedIdentity = ''): Promise<OcrResult> {
  const found = new Map<string, Identity>();
  for (const file of files) {
    signal.throwIfAborted();
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url; await image.decode();
      signal.throwIfAborted();
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) continue;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const identity of await identities(context.getImageData(0, 0, canvas.width, canvas.height)))
        found.set(identity.result.fields.id_card!, identity);
      signal.throwIfAborted();
    } catch (error) {
      if (signal.aborted) throw error;
      // A bad image must not hide a valid QR in another selected image.
      if (!(error instanceof DOMException && ['EncodingError','InvalidStateError'].includes(error.name))) throw error;
    } finally { URL.revokeObjectURL(url); }
  }
  if (found.size > 1) throw new Error('Có nhiều căn cước khác nhau. Chỉ chọn giấy tờ của một khách.');
  const identity = [...found.values()][0];
  if (!identity) throw new Error('Chưa tìm thấy QR căn cước hợp lệ. Chụp rõ mã QR hoặc nhập thông tin bằng tay.');
  if (expectedIdentity && !identity.identifiers.includes(expectedIdentity)) throw new Error('QR thuộc căn cước khác. Kiểm tra lại trước khi cập nhật.');
  return identity.result;
}
