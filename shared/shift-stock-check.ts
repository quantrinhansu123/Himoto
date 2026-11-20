import {plateKey} from './mobile-plate-ocr';

export const SHIFT_STOCK_CATEGORY = 'vehicle_stock';
export const SHIFT_STOCK_RADIUS_METERS = 150;
export const SHIFT_STOCK_MAX_ACCURACY_METERS = 100;

export interface ShiftStockVehicle {
  id: number;
  name: string;
  license: string;
}
export interface ShiftStockCapture {
  vehicle: ShiftStockVehicle;
  plate: string;
  vehicle_photo_id: string;
  plate_photo_id: string;
  captured_at: string;
  actor_name: string;
  distance_m: number;
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
    photoId(value.vehicle_photo_id) && photoId(value.plate_photo_id) &&
    value.vehicle_photo_id !== value.plate_photo_id && typeof value.actor_name === 'string' &&
    typeof value.captured_at === 'string' && Number.isFinite(Date.parse(value.captured_at)) &&
    Number.isInteger(value.distance_m) && Number(value.distance_m) >= 0 && Number(value.distance_m) <= SHIFT_STOCK_RADIUS_METERS;
}
export function isShiftStockCheck(value: unknown): value is ShiftStockCheck {
  return object(value) && positiveId(value.revision) && typeof value.gps_configured === 'boolean' &&
    Array.isArray(value.expected) && value.expected.every(stockVehicle) &&
    Array.isArray(value.captures) && value.captures.every(isShiftStockCapture);
}
