import { ApiError } from './api';
import { cacheableRead, offlineOperation } from './offline-policy';
import { offlineStatus } from './offline-status';
import type { OfflineStore } from './offline-store';

export interface OfflineTransport {
  execute<T>(path: string, validate: (value: unknown) => value is T, options: RequestInit, send: () => Promise<T>, timeout: number): Promise<T>;
}
export function createOfflineTransport(store: OfflineStore, scope: string, active: () => boolean | Promise<boolean>): OfflineTransport {
  let lastFailedAt = 0;
  offlineStatus.subscribe(() => {
    if (!offlineStatus.get().connected && lastFailedAt === 0) lastFailedAt = Date.now();
    else if (offlineStatus.get().connected) lastFailedAt = 0;
  });
  return {
    async execute<T>(path: string, validate: (value: unknown) => value is T, options: RequestInit, send: () => Promise<T>, timeout: number) {
      const method = options.method || 'GET', readable = cacheableRead(path, method);
      const operation = offlineOperation(path, method);
      const key = new Headers(options.headers).get('Idempotency-Key');
      const resolveKey = /^\/write-requests\/([0-9a-f-]+)\/resolve$/.exec(path)?.[1];
      if (!await active()) throw new ApiError('Phiên làm việc đã thay đổi.', 401, 'SESSION_CHANGED');
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (resolveKey) await store.pause(scope, resolveKey);
      const queued = operation && key && typeof options.body === 'string'
        ? await store.enqueue(scope, key, path, method, options.body, timeout + 30000) : null;
      try {
        const shouldProbe = readable && !queued && lastFailedAt > 0 && (Date.now() - lastFailedAt >= 8000);
        if (!offlineStatus.get().connected && !shouldProbe && (readable || queued)) throw new ApiError('Đang ngoại tuyến.', 0, 'NETWORK');
        const data = await send();
        if (!await active()) throw new ApiError('Phiên làm việc đã thay đổi.', 401, 'SESSION_CHANGED');
        lastFailedAt = 0;
        offlineStatus.update({ connected: true });
        if (readable) await store.cache(scope, path, data).catch(() => {
          offlineStatus.update({ error: 'Chưa lưu được dữ liệu tra cứu trên máy.' });
        });
        if (queued) await store.remove(scope, queued.key);
        if (resolveKey) {
          const [origin, userId] = JSON.parse(scope) as [string, number];
          await store.resolvedForActor(origin, userId, resolveKey);
        }
        if (key && !resolveKey) await store.clearCache(scope).catch(() => {});
        return data;
      } catch (error) {
        const network = error instanceof ApiError && !['INVALID_RESPONSE', 'CONFIGURATION', 'SESSION_CHANGED'].includes(error.code) && (error.status === 0 || error.status >= 500 || error.status === 429);
        if (queued) await store.failed(scope, queued.key, (error as Error).message, network, queued.attempts);
        if (!await active() || options.signal?.aborted) throw error;
        if (error instanceof ApiError && error.status === 0) {
          lastFailedAt = Date.now();
          offlineStatus.update({ connected: false });
        }
        if (network && readable) {
          const cached = await store.read(scope, path);
          if (cached && validate(cached.data)) {
            offlineStatus.servedCache(cached.savedAt); return cached.data;
          }
          throw new ApiError('Chưa có dữ liệu này được lưu trên máy hoặc dữ liệu đã quá 24 giờ. Kết nối mạng để tải lần đầu; bản đang soạn vẫn được giữ.', 0, 'OFFLINE_CACHE_MISS');
        }
        if (queued && network) throw new ApiError('Đã lưu thao tác trên máy, chờ đồng bộ. Máy chủ chưa xác nhận; xem trạng thái trong Tài khoản.', 0, 'OFFLINE_QUEUED');
        throw error;
      }
    },
  };
}
