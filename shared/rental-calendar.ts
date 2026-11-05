const DAY=86400000;
export function rentalLocalDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 16) === value ? date : null;
}
export function rentalBoundary(start: Date, interval: 'day'|'week'|'month'|'custom', index: number): Date {
  if (interval !== 'month') return new Date(start.getTime() + index * DAY * (interval === 'week' ? 7 : 1));
  const date = new Date(start);
  date.setUTCDate(1); date.setUTCMonth(start.getUTCMonth() + index);
  const last = new Date(date); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
  date.setUTCDate(Math.min(start.getUTCDate(), last.getUTCDate()));
  return date;
}
export function addRentalMonths(value: string, months: number): string {
  const start = rentalLocalDate(value);
  return start && Number.isInteger(months) && months > 0 && months <= 120 ? rentalBoundary(start, 'month', months).toISOString().slice(0,16) : '';
}
