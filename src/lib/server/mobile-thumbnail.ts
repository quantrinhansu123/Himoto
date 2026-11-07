import 'server-only';
import sharp from 'sharp';
import { MobileError } from './mobile-session';

/** Fixed size/quality: clients cannot request arbitrary expensive transforms. */
export async function mobileThumbnail(bytes: Uint8Array) {
  try {
    const data = await sharp(bytes, { limitInputPixels: 40_000_000, animated: false })
      .rotate().resize({ width: 228, height: 192, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 65 }).toBuffer();
    if (data.byteLength > 64 * 1024) throw new Error('Thumbnail size limit');
    return data;
  } catch { throw new MobileError('Chưa tạo được ảnh xe thu nhỏ.', 415, 'INVALID_THUMBNAIL'); }
}
