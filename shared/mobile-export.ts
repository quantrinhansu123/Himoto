/** Explicit user-initiated CSV artifact; never retained in query cache or write ledger. */
export interface MobileCsvExport { filename: string; mimeType: "text/csv"; content: string; rowCount: number }
export interface MobileWorkbookExport { filename: string; mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; contentBase64: string; rowCount: number }
export interface MobileTextExport { filename:string;mimeType:'text/plain';content:string;rowCount:number }
export interface MobileJsonExport { filename: string; mimeType: 'application/json'; content: string; rowCount: number }
export type MobileFileExport = MobileCsvExport | MobileWorkbookExport | MobileTextExport | MobileJsonExport;
export function isMobileFileExport(value: unknown): value is MobileFileExport {
  if (isMobileCsvExport(value)) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (row.mimeType === 'application/json') return typeof row.filename === 'string' && /^HIMOTO-(?:xe|contracts)-backup-[0-9a-f-]{36}\.json$/.test(row.filename) && typeof row.content === 'string' && row.content.startsWith('{') && row.content.length <= 32 * 1024 * 1024 && Number.isSafeInteger(row.rowCount) && Number(row.rowCount) >= 0;
  if(row.mimeType==='text/plain')return typeof row.filename==='string'&&/^himoto-[a-zA-Z0-9._-]{1,120}\.txt$/.test(row.filename)&&typeof row.content==='string'&&row.content.length<=(/^himoto-ktnb-[1-9]\d*-r[1-9]\d*\.txt$/.test(row.filename)?2*1024*1024:16384)&&Number.isSafeInteger(row.rowCount)&&Number(row.rowCount)>=0;
  return typeof row.filename === "string" && /^(himoto|HIMOTO)-[a-zA-Z0-9-]{1,120}\.xlsx$/.test(row.filename) && row.mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    && typeof row.contentBase64 === "string" && row.contentBase64.startsWith("UEsDB") && row.contentBase64.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(row.contentBase64) && Number.isSafeInteger(row.rowCount) && Number(row.rowCount) >= 0;
}
export function isMobileCsvExport(value: unknown): value is MobileCsvExport {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.filename === "string" && /^himoto-[a-z0-9-]{1,100}\.csv$/.test(row.filename) && row.mimeType === "text/csv"
    && typeof row.content === "string" && row.content.startsWith("\uFEFF") && Number.isSafeInteger(row.rowCount) && Number(row.rowCount) >= 0;
}
