export type LocationFailure = 'permission-denied' | 'unavailable' | 'timeout' | 'unsupported' | 'insecure' | 'invalid' | 'cancelled';
export class BrowserLocationError extends Error {
  constructor(public reason: LocationFailure, message: string) { super(message); }
}
export interface BrowserLocation { latitude: number; longitude: number; accuracy: number; timestamp: number }
const messages: Record<LocationFailure, string> = {
  'permission-denied': 'GPS đang bị chặn. Hãy cho phép vị trí cho Safari và trang web này theo hướng dẫn bên dưới rồi thử lại.',
  unavailable: 'Chưa xác định được vị trí. Bật Dịch vụ định vị, kiểm tra kết nối mạng và thử đứng ở nơi thoáng hơn.',
  timeout: 'Lấy vị trí quá lâu. Kiểm tra quyền GPS và mạng rồi bấm Lấy vị trí hiện tại để thử lại.',
  unsupported: 'Trình duyệt này không hỗ trợ lấy vị trí. Mở trang trực tiếp bằng Safari hoặc Chrome.',
  insecure: 'GPS cần kết nối HTTPS. Hãy mở trang https://himoto.vercel.app bằng Safari.',
  invalid: 'Thiết bị trả về vị trí chưa hợp lệ. Vui lòng thử lấy lại GPS.',
  cancelled: 'Đã dừng lấy vị trí.',
};

/** Invoke directly in the click handler: Safari must retain the user's gesture.
 * Own timeout/cancellation also handles browsers that never invoke GPS callbacks. */
export function requestBrowserLocation(options: {
  signal?: AbortSignal; timeoutMs?: number; geolocation?: Pick<Geolocation, 'getCurrentPosition'> | null; secureContext?: boolean;
} = {}): Promise<BrowserLocation> {
  const geo = options.geolocation === undefined ? (typeof navigator !== 'undefined' ? navigator.geolocation : null) : options.geolocation;
  const secure = options.secureContext ?? (typeof window !== 'undefined' && window.isSecureContext);
  const fail = (reason: LocationFailure) => new BrowserLocationError(reason, messages[reason]);
  if (options.signal?.aborted) return Promise.reject(fail('cancelled'));
  if (!secure) return Promise.reject(fail('insecure'));
  if (!geo) return Promise.reject(fail('unsupported'));
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (value: BrowserLocation | BrowserLocationError) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
      if (value instanceof BrowserLocationError) reject(value); else resolve(value);
    };
    const cancel = () => finish(fail('cancelled'));
    options.signal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => finish(fail('timeout')), options.timeoutMs ?? 20_000);
    try {
      geo.getCurrentPosition(position => {
        const { latitude, longitude, accuracy } = position.coords;
        if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180 || !Number.isFinite(accuracy) || accuracy < 0 || !Number.isFinite(position.timestamp)) return finish(fail('invalid'));
        finish({ latitude, longitude, accuracy, timestamp: position.timestamp });
      }, error => finish(fail(error.code === 1 ? 'permission-denied' : error.code === 3 ? 'timeout' : 'unavailable')),
      { enableHighAccuracy: true, maximumAge: 0, timeout: options.timeoutMs ?? 20_000 });
    } catch { finish(fail('unavailable')); }
  });
}
