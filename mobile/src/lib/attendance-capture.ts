import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { prepareRecordMediaAsset } from './record-media-photo';
import type { AttendanceLocation } from '../../../shared/mobile-support';

export async function captureAttendancePhoto(signal: AbortSignal) {
  if (!(await ImagePicker.requestCameraPermissionsAsync()).granted) throw Error('Cần cấp quyền camera để chụp ảnh chấm công.');
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], cameraType: ImagePicker.CameraType.front, allowsEditing: false, quality: 1, exif: false });
  if (result.canceled || signal.aborted) return null;
  return prepareRecordMediaAsset(result.assets[0], signal);
}

function toAttendanceLocation(value: Location.LocationObject | null | undefined): AttendanceLocation | null {
  if (!value?.coords) return null;
  const { latitude, longitude, accuracy } = value.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (accuracy === null || !Number.isFinite(accuracy)) return null;
  return { latitude, longitude, accuracy, timestamp: Number.isFinite(value.timestamp) ? value.timestamp : Date.now() };
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>(resolve => { timer = setTimeout(() => resolve(fallback), ms); }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
}

async function watchFirstLocation(timeoutMs: number): Promise<AttendanceLocation | null> {
  return new Promise<AttendanceLocation | null>(resolve => {
    let settled = false;
    let subscription: Location.LocationSubscription | null = null;
    const finish = (value: AttendanceLocation | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (subscription) {
        try { subscription.remove(); } catch {}
        subscription = null;
      }
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    void Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 1000, distanceInterval: 0 },
      position => {
        const mapped = toAttendanceLocation(position);
        if (mapped) finish(mapped);
      },
    ).then(sub => {
      if (settled) {
        try { sub.remove(); } catch {}
      } else {
        subscription = sub;
      }
    }).catch(() => finish(null));
  });
}

function translateLocationError(cause: unknown, purpose: string): Error {
  const raw = cause instanceof Error ? cause.message : String(cause || '');
  if (/(permission|denied|quyền)/i.test(raw)) {
    return Error(`Cần cấp quyền vị trí (GPS) khi dùng app để ${purpose}. Vào Cài đặt → Ứng dụng → Himoto → Quyền → Vị trí để bật.`);
  }
  if (/(unsatisfied|settings|services|disabled|provider|bật vị trí)/i.test(raw)) {
    return Error('GPS hoặc Định vị chính xác trên thiết bị đang tắt. Hãy bật Vị trí (GPS) trong Cài đặt điện thoại rồi thử lại.');
  }
  return Error(`Chưa lấy được tín hiệu GPS để ${purpose}. Hãy kiểm tra Vị trí (GPS) đã bật, chọn quyền Vị trí chính xác cho Himoto hoặc bước ra khu vực thoáng hơn rồi thử lại.`);
}

export async function locateAttendance(purpose = 'chấm công'): Promise<AttendanceLocation> {
  try {
    const existing = await Location.getForegroundPermissionsAsync();
    const granted = existing.granted || (await Location.requestForegroundPermissionsAsync()).granted;
    if (!granted) {
      throw Error(`Cần cấp quyền vị trí (GPS) khi dùng app để ${purpose}. Vào Cài đặt → Ứng dụng → Himoto → Quyền → Vị trí để bật.`);
    }
    let enabled = await Location.hasServicesEnabledAsync();
    if (!enabled && Platform.OS === 'android') {
      await Location.enableNetworkProviderAsync().catch(() => {});
      enabled = await Location.hasServicesEnabledAsync();
    }
    if (!enabled) {
      throw Error('GPS đang tắt. Bật Vị trí (GPS) trên điện thoại rồi thử lại.');
    }

    // Stage 1: High accuracy fix (fast outdoor / precise lock).
    const high = toAttendanceLocation(
      await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), 9000, null),
    );
    if (high) return high;

    // Stage 2: Request Android Google Location Accuracy (Wi-Fi/cell) + Balanced accuracy fix.
    if (Platform.OS === 'android') {
      await withTimeout(Location.enableNetworkProviderAsync(), 3000, undefined);
    }
    const balanced = toAttendanceLocation(
      await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 9000, null),
    );
    if (balanced) return balanced;

    // Stage 3: Active watchPositionAsync kicks cold GNSS/network providers on Xiaomi/Oppo/Vivo/Samsung.
    const watched = await watchFirstLocation(7000);
    if (watched) return watched;

    // Stage 4: Recent cached fix (within 3 minutes) so indoor check-in still succeeds when OS just updated location.
    const recentAccurate = toAttendanceLocation(
      await Location.getLastKnownPositionAsync({ maxAge: 180_000, requiredAccuracy: 500 }).catch(() => null),
    );
    if (recentAccurate) return recentAccurate;

    const recentAny = toAttendanceLocation(
      await Location.getLastKnownPositionAsync({ maxAge: 180_000 }).catch(() => null),
    );
    if (recentAny) return recentAny;

    throw Error(`Chưa lấy được tín hiệu GPS để ${purpose}. Kiểm tra Vị trí (GPS) đã bật, cấp quyền Vị trí chính xác cho Himoto hoặc di chuyển ra nơi thoáng hơn rồi thử lại.`);
  } catch (cause) {
    if (cause instanceof Error && /(Cần cấp quyền|GPS đang tắt|Chưa lấy được tín hiệu GPS)/i.test(cause.message)) {
      throw cause;
    }
    throw translateLocationError(cause, purpose);
  }
}

/** Silent best-effort GPS capture for shift evidence/stock photos: never throws or alerts staff. */
export async function locateAttendanceSilent(timeoutMs = 7000): Promise<AttendanceLocation | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    const granted = perm.granted || (await Location.requestForegroundPermissionsAsync()).granted;
    if (!granted) return null;
    if (!(await Location.hasServicesEnabledAsync())) return null;
    const value = toAttendanceLocation(
      await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), timeoutMs, null),
    );
    if (value) return value;
    const last = toAttendanceLocation(await Location.getLastKnownPositionAsync({ maxAge: 180_000 }).catch(() => null));
    return last;
  } catch {
    return null;
  }
}
