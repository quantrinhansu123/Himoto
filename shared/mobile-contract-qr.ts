export interface MobileContractQr {
  id: number; code: string; configured: boolean; mode: 'test' | 'live'; amount: number; total: number | null; paid: number | null;
  bank: { bankCode: string; accountNumber: string; accountName: string } | null; bankId: number | null;
  accounts: { id: number; bankCode: string; accountNumber: string; accountName: string; ownerType: string }[];
  memo: string; qrUrl: string | null; receivedDemo: number; eventVersion: number; configurationMessage: string;
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const amount = (v: unknown) => v === null || integer(v);
function bank(v: unknown): v is { bankCode: string; accountNumber: string; accountName: string } { return object(v) && ['bankCode', 'accountNumber', 'accountName'].every(k => typeof v[k] === 'string' && (v[k] as string).length > 0); }
const plain = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
export function isMobileContractQr(v: unknown): v is MobileContractQr {
  if (!object(v) || !integer(v.id) || v.id <= 0 || typeof v.code !== 'string' || typeof v.configured !== 'boolean' || !['test', 'live'].includes(String(v.mode)) || !integer(v.amount) || !amount(v.total) || !amount(v.paid) || !integer(v.receivedDemo) || !integer(v.eventVersion) || typeof v.memo !== 'string' || typeof v.configurationMessage !== 'string' || !(v.bankId === null || integer(v.bankId) && v.bankId > 0) || !Array.isArray(v.accounts)) return false;
  if (!v.accounts.every((a): boolean => object(a) && integer(a.id) && a.id > 0 && typeof a.ownerType === 'string' && bank(a))) return false;
  if (!v.configured) return v.bank === null && v.bankId === null && v.qrUrl === null;
  if (!bank(v.bank) || !v.bankId || !v.accounts.some(a => a.id === v.bankId) || typeof v.qrUrl !== 'string') return false;
  const selected = v.accounts.find(a => a.id === v.bankId);
  if (selected.accountNumber !== v.bank.accountNumber || selected.accountName !== v.bank.accountName || selected.bankCode !== v.bank.bankCode) return false;
  try {
    const url = new URL(v.qrUrl), p = url.searchParams;
    return url.protocol === 'https:' && url.hostname === 'vietqr.app' && url.port === '' && url.pathname === '/img' && !url.username && !url.password && !url.hash &&
      [...p.keys()].every(k => ['acc', 'bank', 'template', 'holder', 'des', 'amount'].includes(k) && p.getAll(k).length === 1) &&
      p.get('acc') === v.bank.accountNumber && p.get('holder') === plain(v.bank.accountName) && p.get('des') === plain(v.memo) && p.get('template') === 'qronly' && /^\d{6}$/.test(p.get('bank') || '') &&
      (v.amount > 0 ? p.get('amount') === String(v.amount) : !p.has('amount'));
  } catch { return false; }
}
