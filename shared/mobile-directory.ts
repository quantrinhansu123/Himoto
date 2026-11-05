export type MobileDirectoryKind = "staff" | "stores";
export interface MobileDirectoryRecord {
  id: number;
  code: string;
  name: string;
  status: string;
  storeId: number | null;
  storeName: string;
  phone: string;
  email: string;
  address: string;
  position: string;
  managerName: string;
  joinedAt: string;
  notes: string;
  vehicleCount: number | null;
  staffCount: number | null;
}
export interface MobileDirectoryPage {
  rows: MobileDirectoryRecord[];
  total: number;
  page: number;
  pages: number;
}
export function isDirectoryRecord(value: unknown): value is MobileDirectoryRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Number.isSafeInteger(row.id) && Number(row.id) > 0
    && ["code", "name", "status", "storeName", "phone", "email", "address", "position", "managerName", "joinedAt", "notes"].every(key => typeof row[key] === "string")
    && (row.storeId === null || Number.isSafeInteger(row.storeId) && Number(row.storeId) > 0)
    && ["vehicleCount", "staffCount"].every(key => row[key] === null || Number.isSafeInteger(row[key]) && Number(row[key]) >= 0);
}
export function isDirectoryPage(value: unknown): value is MobileDirectoryPage {
  if (!value || typeof value !== "object") return false;
  const page = value as MobileDirectoryPage;
  return Array.isArray(page.rows) && page.rows.length <= 50 && page.rows.every(isDirectoryRecord)
    && Number.isSafeInteger(page.total) && page.total >= 0
    && Number.isSafeInteger(page.page) && page.page >= 1 && Number.isSafeInteger(page.pages) && page.pages >= page.page;
}
