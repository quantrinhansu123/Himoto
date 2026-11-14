export interface MobileAttendanceLocation { id: string | number; store_name: string; latitude: number | null; longitude: number | null }
export function isMobileAttendanceLocations(value: unknown): value is MobileAttendanceLocation[] {
  return Array.isArray(value) && value.every(row => row && typeof row === 'object' && /^[1-9]\d{0,14}$/.test(String(row.id)) && typeof row.store_name === 'string' && (row.latitude === null || typeof row.latitude === 'number' && Number.isFinite(row.latitude) && Math.abs(row.latitude) <= 90) && (row.longitude === null || typeof row.longitude === 'number' && Number.isFinite(row.longitude) && Math.abs(row.longitude) <= 180));
}
