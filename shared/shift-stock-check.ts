import {plateKey} from './mobile-plate-ocr';

export const SHIFT_STOCK_CATEGORY = 'vehicle_stock';
export const GPS_ALERT_RADIUS_METERS = 200;
export const SHIFT_STOCK_RADIUS_METERS = GPS_ALERT_RADIUS_METERS;
export const SHIFT_STOCK_MAX_ACCURACY_METERS = GPS_ALERT_RADIUS_METERS;
export const SHIFT_STOCK_FORMAT_HEADER = 'x-himoto-shift-stock';
export const SHIFT_STOCK_PLATE_FORMAT = 'plate';

export interface ShiftGpsPoint {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp?: number;
}
export interface ShiftStockVehicle {
  id: number;
  name: string;
  license: string;
}
export interface ShiftStockCapture {
  vehicle: ShiftStockVehicle;
  plate: string;
  vehicle_photo_id: string | null;
  plate_photo_id: string;
  captured_at: string;
  actor_name: string;
  distance_m?: number | null;
  gps_alert?: boolean;
  gps_issue?: string;
  phone_location?: ShiftGpsPoint | null;
  vehicle_gps_distance_m?: number | null;
  vehicle_gps_status?: string | null;
  vehicle_gps_lat?: number | null;
  vehicle_gps_lng?: number | null;
  vehicle_gps_at?: string | null;
  vehicle_gps_alert?: boolean;
  vehicle_gps_issue?: string;
}
export interface ShiftPhoneGpsAlert {
  kind: 'stock' | 'media';
  label: string;
  distance_m: number | null;
  issue: string;
  captured_at: string;
  actor_name?: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
}
export interface ShiftVehicleGpsAlert {
  vehicle_id: number;
  license: string;
  name: string;
  distance_m: number | null;
  status: string;
  issue: string;
  latitude: number | null;
  longitude: number | null;
  recorded_at: string | null;
}
export interface ShiftGpsAlertSummary {
  radius_m: number;
  store_latitude: number | null;
  store_longitude: number | null;
  total_alerts: number;
  phone_alerts: ShiftPhoneGpsAlert[];
  vehicle_alerts: ShiftVehicleGpsAlert[];
}
export interface ShiftStockCheck {
  revision: number;
  gps_configured: boolean;
  expected: ShiftStockVehicle[];
  captures: ShiftStockCapture[];
}

export function isShiftStockDay(date: string, now = Date.now()) {
  return date === new Date(now + 7 * 3600000).toISOString().slice(0, 10);
}

export function matchShiftStockPlate(plate: string, expected: ShiftStockVehicle[]) {
  const key = plateKey(plate);
  return key ? expected.filter(vehicle => plateKey(vehicle.license) === key) : [];
}

export function compareShiftStock(expected: ShiftStockVehicle[], captures: ShiftStockCapture[]) {
  const vehicleKeys = new Map(expected.map(vehicle => [vehicle.id, plateKey(vehicle.license)]));
  const captureKeys = new Map(captures.map(capture => [capture.vehicle.id, plateKey(capture.plate)]));
  const matches = (id: number) => !!vehicleKeys.get(id) && vehicleKeys.get(id) === captureKeys.get(id);
  return {
    missing: expected.filter(vehicle => !matches(vehicle.id)),
    unexpected: captures.filter(capture => !matches(capture.vehicle.id)),
  };
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const positiveId = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0;
const photoId = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const stockVehicle = (value: unknown): value is ShiftStockVehicle =>
  object(value) && positiveId(value.id) && typeof value.name === 'string' && typeof value.license === 'string';
export function isShiftStockCapture(value: unknown): value is ShiftStockCapture {
  return object(value) && stockVehicle(value.vehicle) && typeof value.plate === 'string' &&
    !!plateKey(value.plate) && plateKey(value.plate) === plateKey(value.vehicle.license) &&
    (value.vehicle_photo_id === null || photoId(value.vehicle_photo_id)) && photoId(value.plate_photo_id) &&
    value.vehicle_photo_id !== value.plate_photo_id && typeof value.actor_name === 'string' &&
    typeof value.captured_at === 'string' && Number.isFinite(Date.parse(value.captured_at)) &&
    (value.distance_m === undefined || value.distance_m === null || (Number.isInteger(value.distance_m) && Number(value.distance_m) >= 0)) &&
    (value.gps_alert === undefined || typeof value.gps_alert === 'boolean') &&
    (value.vehicle_gps_alert === undefined || typeof value.vehicle_gps_alert === 'boolean');
}
export function isShiftGpsAlertSummary(value: unknown): value is ShiftGpsAlertSummary {
  return object(value) && Number.isSafeInteger(value.radius_m) && Number(value.radius_m) > 0 &&
    Number.isSafeInteger(value.total_alerts) && Number(value.total_alerts) >= 0 &&
    (value.store_latitude === null || typeof value.store_latitude === 'number') &&
    (value.store_longitude === null || typeof value.store_longitude === 'number') &&
    Array.isArray(value.phone_alerts) && value.phone_alerts.every(item =>
      object(item) && (item.kind === 'stock' || item.kind === 'media') &&
      typeof item.label === 'string' && typeof item.issue === 'string' && typeof item.captured_at === 'string' &&
      (item.distance_m === null || (Number.isInteger(item.distance_m) && Number(item.distance_m) >= 0))) &&
    Array.isArray(value.vehicle_alerts) && value.vehicle_alerts.every(item =>
      object(item) && positiveId(item.vehicle_id) && typeof item.license === 'string' &&
      typeof item.name === 'string' && typeof item.status === 'string' && typeof item.issue === 'string' &&
      (item.distance_m === null || (Number.isInteger(item.distance_m) && Number(item.distance_m) >= 0)));
}
export function isShiftStockCheck(value: unknown): value is ShiftStockCheck {
  return object(value) && positiveId(value.revision) && typeof value.gps_configured === 'boolean' &&
    Array.isArray(value.expected) && value.expected.every(stockVehicle) &&
    Array.isArray(value.captures) && value.captures.every(isShiftStockCapture);
}
