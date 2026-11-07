export const SALES_REPORTS = [
  { value: "actual", label: "Doanh thu thực thu / NVKD" }, { value: "ledger", label: "Sổ thu / chi" },
  { value: "vehicles", label: "Doanh thu từng xe" }, { value: "overview", label: "Báo cáo theo cơ sở" },
  { value: "fleet", label: "Doanh thu xe theo cơ sở chủ quản" }, { value: "contracts", label: "Thống kê hợp đồng" },
  { value: "by-staff", label: "Theo NVKD ghi nhận doanh số" }, { value: "by-store", label: "Theo cơ sở ghi nhận doanh thu" },
  { value: "new-customers", label: "Khách mới theo nguồn" }, { value: "assigned", label: "NVKD / TLS phân công" },
] as const;
export type SalesReportKind = typeof SALES_REPORTS[number]["value"];
export type ReportFormat = "text" | "money" | "count" | "date" | "datetime";
export type ReportValue = string | number | null;
export interface ReportColumn { key: string; label: string; format: ReportFormat }
export interface ReportAction { label: string; kind: SalesReportKind | "contract" | "customer" | "vehicle"; query: string }
export interface ReportRow { key: string; values: ReportValue[]; action?: ReportAction; series?: { labels: string[]; values: number[] } }
export interface ReportSection { key: string; title: string; columns: ReportColumn[]; rows: ReportRow[]; total?: ReportValue[]; paging?: { page: number; size: number; total: number }; }
export interface ReportMetric { group: string; label: string; value: number | null; format: "money" | "count"; action?: ReportAction }
export interface MobileSalesReport { kind: SalesReportKind; title: string; notes: string[]; metrics: ReportMetric[]; sections: ReportSection[]; canExport: boolean; sources?: { value: string; label: string }[] }
export type ReportPageChange = (page: number, size: number, section?: string) => void;
/** Negotiated mobile paging; totals and export readers remain complete. */
export function paginateReportSections(report: MobileSalesReport, pages: Record<string, number>, size = 20): MobileSalesReport {
  return { ...report, sections: report.sections.map(section => {
    if (section.paging || section.rows.length <= size) return section;
    const total = section.rows.length, page = Math.min(pages[section.key] || 1, Math.max(1, Math.ceil(total / size)));
    return { ...section, rows: section.rows.slice((page - 1) * size, page * size), paging: { page, size, total } };
  }) };
}
export interface SalesReportOptions { canViewFleet: boolean; stores: { id: number; name: string }[]; ledgerCategories: { value: string; label: string }[]; ledgerMethods: { value: string; label: string }[] }
export function isSalesReportKind(value: unknown): value is SalesReportKind { return SALES_REPORTS.some(row => row.value === value); }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const text = (value: unknown) => typeof value === "string";
const cell = (value: unknown) => value === null || text(value) || typeof value === "number" && Number.isFinite(value);
export function isMobileSalesReport(value: unknown): value is MobileSalesReport {
  if (!object(value) || !isSalesReportKind(value.kind) || !text(value.title) || !Array.isArray(value.notes) || !value.notes.every(text) || typeof value.canExport !== "boolean" || !Array.isArray(value.metrics) || !Array.isArray(value.sections)) return false;
  if (!value.metrics.every(row => object(row) && text(row.group) && text(row.label) && ["money", "count"].includes(String(row.format)) && (row.value === null || typeof row.value === "number" && Number.isFinite(row.value)) && (row.action === undefined || object(row.action) && text(row.action.label) && isSalesReportKind(row.action.kind) && text(row.action.query)))) return false;
  if (!value.sections.every(section => {
    if (!object(section) || !text(section.key) || !text(section.title) || !Array.isArray(section.columns) || !section.columns.every(col => object(col) && text(col.key) && text(col.label) && ["text", "money", "count", "date", "datetime"].includes(String(col.format))) || !Array.isArray(section.rows)) return false;
    const width = section.columns.length;
    if (!section.rows.every(row => object(row) && text(row.key) && Array.isArray(row.values) && row.values.length === width && row.values.every(cell)
      && (row.action === undefined || object(row.action) && text(row.action.label) && (isSalesReportKind(row.action.kind) || ["contract", "customer", "vehicle"].includes(String(row.action.kind))) && text(row.action.query))
      && (row.series === undefined || object(row.series) && Array.isArray(row.series.labels) && row.series.labels.every(text) && Array.isArray(row.series.values) && row.series.labels.length === row.series.values.length && row.series.values.every(n => typeof n === "number" && Number.isFinite(n))))) return false;
    if (new Set(section.rows.map(row => row.key)).size !== section.rows.length || section.total !== undefined && (!Array.isArray(section.total) || section.total.length !== width || !section.total.every(cell))) return false;
    if (section.paging !== undefined && (!object(section.paging) || !count(section.paging.total) || !count(section.paging.page) || Number(section.paging.page) < 1 || !count(section.paging.size) || Number(section.paging.size) < 1 || Number(section.paging.page) > Math.max(1, Math.ceil(Number(section.paging.total) / Number(section.paging.size))) || section.rows.length > Number(section.paging.size))) return false;
    return true;
  })) return false;
  return value.sources === undefined || Array.isArray(value.sources) && value.sources.every(row => object(row) && text(row.value) && text(row.label));
}
export function isSalesReportOptions(value: unknown): value is SalesReportOptions { return object(value) && typeof value.canViewFleet === "boolean" && Array.isArray(value.stores) && value.stores.every(row => object(row) && count(row.id) && Number(row.id) > 0 && text(row.name)) && ["ledgerCategories", "ledgerMethods"].every(key => Array.isArray(value[key]) && (value[key] as unknown[]).every(row => object(row) && text(row.value) && text(row.label))); }
export const REPORT_PRESETS = [{ value: "today", label: "Hôm nay" }, { value: "yesterday", label: "Hôm qua" }, { value: "7d", label: "7 ngày qua" }, { value: "month", label: "Tháng này" }, { value: "last-month", label: "Tháng trước" }, { value: "quarter", label: "Quý này" }, { value: "year", label: "Năm nay" }] as const;
export function salesReportPeriod(preset: string, today: string): [string, string] {
  const [year, month, day] = today.split("-").map(Number), iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
  switch (preset) {
    case "today": return [today, today]; case "yesterday": return [iso(year, month - 1, day - 1), iso(year, month - 1, day - 1)];
    case "7d": return [iso(year, month - 1, day - 6), today]; case "last-month": return [iso(year, month - 2, 1), iso(year, month - 1, 0)];
    case "quarter": return [iso(year, Math.floor((month - 1) / 3) * 3, 1), today]; case "year": return [iso(year, 0, 1), today];
    default: return [`${today.slice(0, 7)}-01`, today];
  }
}
