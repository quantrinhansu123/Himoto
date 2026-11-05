export const CATALOGUE_EXPORT_KINDS = ['customers', 'vehicles', 'contracts', 'staff', 'stores'] as const;
export type MobileCatalogueExportKind = typeof CATALOGUE_EXPORT_KINDS[number];
export interface MobileExportColumns { kind: MobileCatalogueExportKind; title: string; columns: { key: string; label: string; selected: boolean }[] }
export const isCatalogueExportKind = (v: unknown): v is MobileCatalogueExportKind => typeof v === 'string' && (CATALOGUE_EXPORT_KINDS as readonly string[]).includes(v);
export function isMobileExportColumns(v: unknown): v is MobileExportColumns {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return isCatalogueExportKind(r.kind) && typeof r.title === 'string' && Array.isArray(r.columns) && r.columns.length > 0 && r.columns.length <= 80 && r.columns.every(c => c && typeof c === 'object' && typeof c.key === 'string' && /^[a-z_]+$/.test(c.key) && typeof c.label === 'string' && typeof c.selected === 'boolean') && new Set(r.columns.map(c => c.key)).size === r.columns.length;
}
