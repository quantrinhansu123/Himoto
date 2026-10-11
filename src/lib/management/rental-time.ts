export function vietnamRentalTime(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

function localMilliseconds(value: string): number | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day); date.setUTCHours(hour, minute, 0, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || date.getUTCHours() !== hour || date.getUTCMinutes() !== minute) return null;
  return date.getTime();
}

export function addRentalDays(start: string, days: string): string {
  const time = localMilliseconds(start), count = Number(days);
  if (time === null || !/^\d+$/.test(days) || !Number.isSafeInteger(count) || count < 1) return '';
  const end = new Date(time + count * 86_400_000);
  if (!Number.isFinite(end.getTime())) return '';
  const result = end.toISOString().slice(0, 16);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(result) ? result : '';
}

export function rentalDayCount(start: string, end: string): string {
  const from = localMilliseconds(start), to = localMilliseconds(end);
  return from !== null && to !== null && to > from ? String(Math.ceil((to - from) / 86_400_000)) : '';
}
