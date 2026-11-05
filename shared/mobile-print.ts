export type MobilePrintKind = 'contracts' | 'battery-contracts';
export interface MobilePrintDocument { id: number; code: string; revision: string; version: string; versionLabel: string; versions: { id: string; label: string; at: string }[]; generatedAt: string; preview: boolean; portrait: boolean; qrIncluded: boolean; html: string; notices: string[] }
export function isMobilePrintDocument(v: unknown): v is MobilePrintDocument {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const p = v as Record<string, unknown>;
  return typeof p.id === 'number' && Number.isSafeInteger(p.id) && p.id > 0 && ['code', 'revision', 'version', 'versionLabel', 'generatedAt', 'html'].every(k => typeof p[k] === 'string') && /^[1-9]\d{0,19}$/.test(String(p.revision)) && Number.isFinite(Date.parse(String(p.generatedAt))) && typeof p.preview === 'boolean' && typeof p.portrait === 'boolean' && typeof p.qrIncluded === 'boolean' && String(p.html).startsWith('<!doctype html>') && String(p.html).length <= 2_097_152 && Array.isArray(p.notices) && p.notices.every(n => typeof n === 'string') && Array.isArray(p.versions) && p.versions.every(c => !!c && typeof c === 'object' && ['id', 'label', 'at'].every(k => typeof (c as Record<string, unknown>)[k] === 'string'));
}
