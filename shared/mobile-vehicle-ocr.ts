export const VEHICLE_OCR_FIELDS = ["license", "chassis", "engine", "color", "year"] as const;
export type VehicleOcrValues = Record<typeof VEHICLE_OCR_FIELDS[number], string>;
export interface MobileVehicleOcr { requestId: string; fields: Partial<VehicleOcrValues>; warnings: string[] }
export function isVehicleOcr(v: unknown): v is MobileVehicleOcr {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const row = v as MobileVehicleOcr;
  return typeof row.requestId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(row.requestId)
    && !!row.fields && typeof row.fields === "object" && !Array.isArray(row.fields)
    && Object.entries(row.fields).every(([key, value]) => VEHICLE_OCR_FIELDS.includes(key as keyof VehicleOcrValues) && typeof value === "string" && value.length <= 255)
    && Array.isArray(row.warnings) && row.warnings.every(value => typeof value === "string" && value.length <= 4000);
}
/** Same web merge: edits during OCR and manually entered values win. */
export function mergeVehicleOcr(current: VehicleOcrValues, fields: Partial<VehicleOcrValues>, before: VehicleOcrValues, previousAi: Partial<VehicleOcrValues>) {
  const values = { ...current }, applied: Partial<VehicleOcrValues> = {};
  for (const key of VEHICLE_OCR_FIELDS) if (fields[key] && current[key] === before[key] && (!current[key].trim() || current[key] === previousAi[key])) {
    values[key] = fields[key]; applied[key] = fields[key];
  }
  return { values, applied };
}
