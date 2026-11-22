import 'server-only';
import { after } from 'next/server';
import type { PoolClient } from 'pg';
import {
  GPS_ALERT_RADIUS_METERS,
  SHIFT_STOCK_MAX_ACCURACY_METERS,
  type ShiftGpsAlertSummary,
  type ShiftGpsPoint,
  type ShiftPhoneGpsAlert,
  type ShiftStockCapture,
  type ShiftStockVehicle,
  type ShiftVehicleGpsAlert,
} from '../../../shared/shift-stock-check';
import { SHIFT_PHOTOS, type ShiftReport } from '../../../shared/shift-reports';
import { attendanceDistanceMeters } from './attendance';
import { mobilePushConfigured } from './mobile-push-fcm';

type Database = Pick<PoolClient, 'query'>;

export interface BranchCoords {
  latitude: number;
  longitude: number;
}

export interface MediaGpsAuditEntry {
  media_id: string;
  stage: 'pgd' | 'audit';
  category: string;
  filename: string;
  captured_at: string;
  actor_name: string;
  distance_m: number | null;
  gps_alert: boolean;
  gps_issue: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
}

export interface PhoneGpsEvaluation {
  location: ShiftGpsPoint | null;
  distance_m: number | null;
  alert: boolean;
  issue: string;
}

const PHOTO_LABELS = new Map<string, string>(SHIFT_PHOTOS.map(([k, v]) => [k, v]));

export function formatDistanceVi(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
  return `${meters.toLocaleString('vi-VN')} m`;
}

export async function hasGpsTable(client: Database, table: 'gps_devices' | 'management_attendance_locations' | 'management_staff_attendance' | 'management_shift_reports'): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS ok`, [`himoto.${table}`]);
  return Boolean(rows[0]?.ok);
}

export async function readBranchCoords(client: Database, storeId: number): Promise<BranchCoords | null> {
  if (!await hasGpsTable(client, 'management_attendance_locations')) return null;
  const { rows } = await client.query<{ latitude: string | number; longitude: string | number }>(
    'SELECT latitude, longitude FROM himoto.management_attendance_locations WHERE store_id = $1',
    [storeId],
  );
  if (!rows[0]) return null;
  const latitude = Number(rows[0].latitude);
  const longitude = Number(rows[0].longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

export function evaluatePhoneGps(
  rawHeader: string | null | undefined,
  branch: BranchCoords | null,
  maxAgeMs = 300_000,
): PhoneGpsEvaluation {
  const trimmed = (rawHeader || '').trim();
  if (!trimmed || trimmed === 'unavailable' || trimmed === 'missing') {
    return {
      location: null,
      distance_m: null,
      alert: true,
      issue: 'Không ghi nhận được GPS điện thoại lúc chụp',
    };
  }
  let parsed: Record<string, unknown> | null = null;
  try {
    const value = JSON.parse(trimmed);
    if (value && typeof value === 'object' && !Array.isArray(value)) parsed = value as Record<string, unknown>;
  } catch {
    parsed = null;
  }
  if (!parsed) {
    return {
      location: null,
      distance_m: null,
      alert: true,
      issue: 'Dữ liệu GPS điện thoại không hợp lệ',
    };
  }
  const latitude = Number(parsed.latitude);
  const longitude = Number(parsed.longitude);
  const accuracy = Number(parsed.accuracy);
  const timestamp = parsed.timestamp != null ? Number(parsed.timestamp) : Date.now();
  if (
    !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
    !Number.isFinite(longitude) || Math.abs(longitude) > 180 ||
    !Number.isFinite(accuracy) || accuracy < 0
  ) {
    return {
      location: null,
      distance_m: null,
      alert: true,
      issue: 'Tọa độ GPS điện thoại không hợp lệ',
    };
  }
  const location: ShiftGpsPoint = { latitude, longitude, accuracy: Math.round(accuracy), timestamp };
  const distance_m = branch ? attendanceDistanceMeters(location, branch) : null;
  const issues: string[] = [];
  if (Number.isFinite(timestamp) && Math.abs(Date.now() - timestamp) > maxAgeMs) {
    issues.push('Tọa độ GPS cũ (>5 phút)');
  }
  if (distance_m !== null && distance_m > GPS_ALERT_RADIUS_METERS) {
    issues.push(`Cách cơ sở ${formatDistanceVi(distance_m)} (vượt ${GPS_ALERT_RADIUS_METERS} m)`);
  }
  if (accuracy > SHIFT_STOCK_MAX_ACCURACY_METERS) {
    issues.push(`Sai số GPS cao (±${Math.round(accuracy)} m)`);
  }
  return {
    location,
    distance_m,
    alert: issues.length > 0,
    issue: issues.join(' · '),
  };
}

export interface VehicleGpsSnapshotItem {
  vehicle_id: number;
  license: string;
  name: string;
  distance_m: number | null;
  status: string;
  latitude: number | null;
  longitude: number | null;
  recorded_at: string | null;
  alert: boolean;
  issue: string;
}

export async function evaluateVehicleGpsSnapshot(
  client: Database,
  vehicles: ShiftStockVehicle[],
  branch: BranchCoords | null,
): Promise<VehicleGpsSnapshotItem[]> {
  if (!vehicles.length) return [];
  if (!await hasGpsTable(client, 'gps_devices')) return [];
  const ids = [...new Set(vehicles.map(v => v.id).filter(id => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return [];
  const { rows } = await client.query<{
    vehicle_id: string | number;
    management_status: string | null;
    provider_status: string | null;
    last_latitude: string | number | null;
    last_longitude: string | number | null;
    position_recorded_at: string | Date | null;
    sync_received_at: string | Date | null;
  }>(
    `SELECT DISTINCT ON (vehicle_id)
        vehicle_id, management_status, provider_status,
        last_latitude, last_longitude, position_recorded_at, sync_received_at
     FROM himoto.gps_devices
     WHERE vehicle_id = ANY($1::bigint[])
       AND COALESCE(management_status, '') <> 'not_visible_in_account'
     ORDER BY vehicle_id, sync_received_at DESC NULLS LAST, position_recorded_at DESC NULLS LAST, id DESC`,
    [ids],
  );
  const byVehicle = new Map(rows.map(row => [Number(row.vehicle_id), row]));
  return vehicles.map(vehicle => {
    const device = byVehicle.get(vehicle.id);
    if (!device) {
      return {
        vehicle_id: vehicle.id,
        license: vehicle.license,
        name: vehicle.name,
        distance_m: null,
        status: 'unmapped',
        latitude: null,
        longitude: null,
        recorded_at: null,
        alert: false,
        issue: '',
      };
    }
    const status = String(device.management_status || device.provider_status || 'unknown');
    const lat = device.last_latitude != null ? Number(device.last_latitude) : null;
    const lng = device.last_longitude != null ? Number(device.last_longitude) : null;
    const hasCoords = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
    const recordedRaw = device.position_recorded_at || device.sync_received_at;
    const recorded_at = recordedRaw ? new Date(recordedRaw).toISOString() : null;
    const distance_m = hasCoords && branch ? attendanceDistanceMeters({ latitude: lat!, longitude: lng! }, branch) : null;
    let alert = false;
    let issue = '';
    if (!hasCoords) {
      alert = true;
      issue = 'Thiết bị GPS trên xe chưa có tọa độ';
    } else if (distance_m !== null && distance_m > GPS_ALERT_RADIUS_METERS) {
      alert = true;
      issue = `GPS xe cách cơ sở ${formatDistanceVi(distance_m)} (vượt ${GPS_ALERT_RADIUS_METERS} m)`;
    } else if (status === 'offline' || status === 'warning') {
      alert = true;
      issue = status === 'offline' ? 'GPS xe ngoại tuyến / mất tín hiệu' : 'GPS xe cảnh báo tín hiệu';
    }
    return {
      vehicle_id: vehicle.id,
      license: vehicle.license,
      name: vehicle.name,
      distance_m,
      status,
      latitude: hasCoords ? lat : null,
      longitude: hasCoords ? lng : null,
      recorded_at,
      alert,
      issue,
    };
  });
}

export function buildShiftGpsAlerts(
  rawPayload: Record<string, unknown> | null | undefined,
  branch: BranchCoords | null,
  liveVehicleSnapshot?: VehicleGpsSnapshotItem[],
): ShiftGpsAlertSummary | null {
  const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
  const phoneAlerts: ShiftPhoneGpsAlert[] = [];
  const vehicleAlertsMap = new Map<number, ShiftVehicleGpsAlert>();

  const captures = Array.isArray(payload.stock_captures) ? (payload.stock_captures as ShiftStockCapture[]) : [];
  for (const cap of captures) {
    if (!cap || typeof cap !== 'object' || !cap.vehicle) continue;
    const dist = typeof cap.distance_m === 'number' && Number.isFinite(cap.distance_m) ? cap.distance_m : null;
    const phoneAlert = cap.gps_alert === true || (dist !== null && dist > GPS_ALERT_RADIUS_METERS);
    if (phoneAlert) {
      phoneAlerts.push({
        kind: 'stock',
        label: `Chụp biển số ${cap.vehicle.license || cap.plate}`,
        distance_m: dist,
        issue: cap.gps_issue || (dist !== null ? `Cách cơ sở ${formatDistanceVi(dist)} (vượt ${GPS_ALERT_RADIUS_METERS} m)` : 'Bất thường GPS điện thoại'),
        captured_at: cap.captured_at,
        actor_name: cap.actor_name,
        latitude: cap.phone_location?.latitude ?? null,
        longitude: cap.phone_location?.longitude ?? null,
        accuracy: cap.phone_location?.accuracy ?? null,
      });
    }
    const vDist = typeof cap.vehicle_gps_distance_m === 'number' && Number.isFinite(cap.vehicle_gps_distance_m) ? cap.vehicle_gps_distance_m : null;
    const vAlert = cap.vehicle_gps_alert === true || (vDist !== null && vDist > GPS_ALERT_RADIUS_METERS);
    if (vAlert && !vehicleAlertsMap.has(cap.vehicle.id)) {
      vehicleAlertsMap.set(cap.vehicle.id, {
        vehicle_id: cap.vehicle.id,
        license: cap.vehicle.license || cap.plate,
        name: cap.vehicle.name || '',
        distance_m: vDist,
        status: cap.vehicle_gps_status || 'unknown',
        issue: cap.vehicle_gps_issue || (vDist !== null ? `GPS xe cách cơ sở ${formatDistanceVi(vDist)} (vượt ${GPS_ALERT_RADIUS_METERS} m)` : 'GPS xe bất thường'),
        latitude: cap.vehicle_gps_lat ?? null,
        longitude: cap.vehicle_gps_lng ?? null,
        recorded_at: cap.vehicle_gps_at ?? null,
      });
    }
  }

  const mediaGps = Array.isArray(payload.media_gps) ? (payload.media_gps as MediaGpsAuditEntry[]) : [];
  for (const item of mediaGps) {
    if (!item || typeof item !== 'object') continue;
    const dist = typeof item.distance_m === 'number' && Number.isFinite(item.distance_m) ? item.distance_m : null;
    const alert = item.gps_alert === true || (dist !== null && dist > GPS_ALERT_RADIUS_METERS);
    if (alert) {
      const catLabel = PHOTO_LABELS.get(item.category) || item.category;
      phoneAlerts.push({
        kind: 'media',
        label: `${item.stage === 'audit' ? 'KTNB' : 'PGD'} · ${catLabel}`,
        distance_m: dist,
        issue: item.gps_issue || (dist !== null ? `Cách cơ sở ${formatDistanceVi(dist)} (vượt ${GPS_ALERT_RADIUS_METERS} m)` : 'Bất thường GPS điện thoại'),
        captured_at: item.captured_at,
        actor_name: item.actor_name,
        latitude: item.latitude ?? null,
        longitude: item.longitude ?? null,
        accuracy: item.accuracy ?? null,
      });
    }
  }

  const storedVehicleAudit = Array.isArray(payload.stock_gps_audit)
    ? (payload.stock_gps_audit as VehicleGpsSnapshotItem[])
    : [];
  for (const item of [...storedVehicleAudit, ...(liveVehicleSnapshot ?? [])]) {
    if (!item || typeof item !== 'object' || !item.alert) continue;
    if (!vehicleAlertsMap.has(item.vehicle_id)) {
      vehicleAlertsMap.set(item.vehicle_id, {
        vehicle_id: item.vehicle_id,
        license: item.license,
        name: item.name,
        distance_m: item.distance_m,
        status: item.status,
        issue: item.issue,
        latitude: item.latitude,
        longitude: item.longitude,
        recorded_at: item.recorded_at,
      });
    }
  }

  const vehicleAlerts = [...vehicleAlertsMap.values()];
  const total_alerts = phoneAlerts.length + vehicleAlerts.length;
  if (total_alerts === 0) return null;
  return {
    radius_m: GPS_ALERT_RADIUS_METERS,
    store_latitude: branch?.latitude ?? null,
    store_longitude: branch?.longitude ?? null,
    total_alerts,
    phone_alerts: phoneAlerts,
    vehicle_alerts: vehicleAlerts,
  };
}

export function stripStockCaptureForNonAdmin(capture: ShiftStockCapture): ShiftStockCapture {
  return {
    vehicle: capture.vehicle,
    plate: capture.plate,
    vehicle_photo_id: capture.vehicle_photo_id,
    plate_photo_id: capture.plate_photo_id,
    captured_at: capture.captured_at,
    actor_name: capture.actor_name,
  };
}

export function projectShiftReportForActor(report: ShiftReport, isAdmin: boolean): ShiftReport {
  if (isAdmin) return report;
  const copy: ShiftReport = { ...report };
  delete copy.gps_alerts;
  if (copy.stock_captures) {
    copy.stock_captures = copy.stock_captures.map(stripStockCaptureForNonAdmin);
  }
  return copy;
}

export function scheduleAdminGpsPush() {
  if (!mobilePushConfigured()) return;
  const run = () => import('./mobile-push').then(mod => mod.dispatchAdminGpsPush(15000)).catch(() => {});
  try {
    after(run);
  } catch {
    void run();
  }
}
