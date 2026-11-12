import { File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat, type ImageRef } from "expo-image-manipulator";

export type PreparedPhoto = {
  uri: string;
  width: number;
  height: number;
  size: number;
  mimeType: "image/jpeg";
  dispose: () => void;
};
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_EDGE = 1600;
const cancelled = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new Error("Đã hủy chuẩn bị ảnh.");
};

/** Prepares a picker/camera image only; it never uploads, records money or deletes the selected original. */
export async function preparePhoto(source: string, signal?: AbortSignal): Promise<PreparedPhoto> {
  if (!/^(file|content):\/\//.test(source)) throw new Error("Chọn ảnh trên thiết bị để tiếp tục.");
  cancelled(signal);
  const cache = new URL(Paths.cache.uri).href.replace(/\/?$/, "/");
  const original = source.startsWith("file:") ? new URL(source).href.toLowerCase() : source;
  // SDK 58 downsamples during decoding, avoiding a full-resolution camera bitmap.
  const context = ImageManipulator.manipulate(source, { maxWidth: MAX_EDGE, maxHeight: MAX_EDGE });
  const generated = new Set<string>();
  let image: ImageRef | undefined;
  let accepted: string | undefined;
  const remove = (uri: string) => {
    if (!generated.has(uri)) return;
    try { new File(uri).delete(); generated.delete(uri); } catch { /* Cache cleanup can be retried by dispose. */ }
  };
  try {
    image = await context.renderAsync();
    cancelled(signal);
    if (![image.width, image.height].every(value => Number.isInteger(value) && value > 0 && value <= MAX_EDGE))
      throw new Error("Không chuẩn bị được kích thước ảnh an toàn. Chụp hoặc chọn ảnh khác.");
    for (const compress of [0.78, 0.65, 0.52]) {
      cancelled(signal);
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress, base64: false });
      // Only the new output in Expo's cache belongs to this operation.
      const output = new URL(saved.uri).href;
      if (!output.startsWith(cache) || output.toLowerCase() === original)
        throw new Error("Không xác nhận được tệp ảnh đã chuẩn bị. Ảnh gốc được giữ nguyên.");
      generated.add(output);
      cancelled(signal);
      const size = new File(output).size;
      if (typeof size === "number" && Number.isSafeInteger(size) && size > 0 && size <= MAX_BYTES) {
        accepted = output;
        return { uri: output, width: image.width, height: image.height, size, mimeType: "image/jpeg", dispose: () => { for (const uri of generated) remove(uri); } };
      }
      remove(output);
    }
    throw new Error("Ảnh vẫn vượt giới hạn 2 MB. Chụp rõ riêng phần bill hoặc chọn ảnh khác.");
  } finally {
    for (const uri of generated) if (uri !== accepted) remove(uri);
    try { image?.release(); } finally { context.release(); }
  }
}
