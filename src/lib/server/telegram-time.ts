/** A bad event can be blocked without hiding other, independently valid events. */
export class TelegramPreparationError extends Error {
  readonly name = 'TelegramPreparationError';
  readonly code = 'NOTIFICATION_INVALID';
}

/** Stored local business times are Vietnam wall clocks, never the host's timezone. */
export function telegramTimestamp(value: unknown): string | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?)?$/);
  if (!match) return null;
  const [year, month, day] = match.slice(1, 4).map(Number);
  const hour = Number(match[4] || 0), minute = Number(match[5] || 0), second = Number(match[6] || 0);
  const millisecond = Number((match[7]?.slice(1, 4) || '').padEnd(3, '0'));
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const wall = new Date(0);
  wall.setUTCFullYear(year, month - 1, day); wall.setUTCHours(hour, minute, second, millisecond);
  if (wall.getUTCFullYear() !== year || wall.getUTCMonth() !== month - 1 || wall.getUTCDate() !== day) return null;
  let offset = 420;
  if (match[8] === 'Z') offset = 0;
  else if (match[8]) {
    const zone = match[8].replace(':', ''), hours = Number(zone.slice(1, 3)), minutes = Number(zone.slice(3, 5));
    if (hours > 23 || minutes > 59) return null;
    offset = (hours * 60 + minutes) * (zone[0] === '-' ? -1 : 1);
  }
  const instant = new Date(wall.getTime() - offset * 60_000);
  return Number.isFinite(instant.getTime()) ? instant.toISOString() : null;
}

export function requireTelegramTimestamp(value: unknown, label = 'Ngày giờ giao dịch'): string {
  const time = telegramTimestamp(value);
  if (!time) throw new TelegramPreparationError(`${label} chưa hợp lệ. Mở hồ sơ để kiểm tra thời gian trước khi gửi Telegram.`);
  return time;
}
