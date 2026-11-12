/** Payments and later profile edits must never move the bad-debt transition time. */
export function badDebtCutoff(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return;
  const composer=(payload as {management_composer?:{lifecycle?:{bad_debt?:{at?:unknown};payment_closure?:{at?:unknown};events?:{action?:unknown;at?:unknown}[]}}}).management_composer;
  const lifecycle=composer?.lifecycle;
  const at=lifecycle?.bad_debt?.at||(Array.isArray(lifecycle?.events)?lifecycle.events.findLast(event=>event?.action==='mark_bad_debt')?.at:undefined)||lifecycle?.payment_closure?.at;
  if (typeof at==='string'&&Number.isFinite(Date.parse(at))) return at;
}
export function badDebtClock(status: string, cutoff: unknown, now: number): number | undefined {
  if (status!=='bad_debt'&&!(status==='completed'&&cutoff)) return now;
  const at=typeof cutoff==='string'?Date.parse(cutoff):NaN;
  return Number.isFinite(at)?Math.min(at,now):undefined;
}
