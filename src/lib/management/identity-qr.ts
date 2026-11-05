import type { OcrResult } from './photo-ocr';

export function parseIdentityQr(value: string): OcrResult | undefined {
  const parts = value.trim().split('|');
  if (parts.length < 7 || !/^\d{12}$/.test(parts[0]) || !parts[2]?.trim()) return;
  const issued = parts[6].trim();
  if (!/^\d{8}$/.test(issued)) return;
  const date = `${issued.slice(4)}-${issued.slice(2,4)}-${issued.slice(0,2)}`;
  if (!Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date) return;
  return { fields: { id_card: parts[0], name: parts[2].trim(), id_card_issued_on: date }, warnings: ['Kiểm tra thông tin từ QR trước khi lưu. QR không có nơi cấp; bổ sung nếu còn thiếu.'] };
}

export async function readIdentityQr(files: File[], signal: AbortSignal): Promise<OcrResult> {
  const { default: jsQR } = await import('jsqr');
  for (const file of files) {
    signal.throwIfAborted();
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url; await image.decode();
      signal.throwIfAborted();
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) continue;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const qr = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' });
      const result = qr && parseIdentityQr(qr.data);
      if (result) return result;
    } finally { URL.revokeObjectURL(url); }
  }
  throw new Error('Chưa tìm thấy QR căn cước hợp lệ. Chụp rõ mã QR hoặc nhập thông tin bằng tay.');
}
