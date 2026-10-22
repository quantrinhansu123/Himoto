import 'server-only';
import { NextResponse } from 'next/server';

const PG: Record<string, { status: number; label: string }> = {
  '23505': { status: 409, label: 'Dữ liệu bị trùng' },
  '23503': { status: 409, label: 'Thiếu dữ liệu liên kết' },
  '23514': { status: 409, label: 'Không thỏa điều kiện kiểm tra' },
  '23P01': { status: 409, label: 'Xung đột khóa loại trừ' },
  '42501': { status: 409, label: 'Không đủ quyền hoặc dòng không thuộc cơ sở đang đăng nhập' },
  '57014': { status: 504, label: 'Hết thời gian chờ trên database' },
  '55P03': { status: 409, label: 'Đang bị khóa, thử lại' },
  '40P01': { status: 409, label: 'Hai thao tác khóa chéo nhau, đã hủy' },
  '40001': { status: 409, label: 'Giao dịch bị hủy do xung đột, thử lại' },
  '42883': { status: 503, label: 'Thiếu hàm trên database' },
  '42P01': { status: 503, label: 'Thiếu bảng trên database' },
  '42703': { status: 503, label: 'Thiếu cột trên database' },
  '22P02': { status: 400, label: 'Kiểu dữ liệu không hợp lệ' },
  '22001': { status: 400, label: 'Giá trị vượt độ dài cho phép' },
  '23502': { status: 400, label: 'Thiếu trường bắt buộc' },
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function sanitizeFailureReason(value: string): string {
  return value
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s]+/gi, '[uri]')
    .replace(/(password|secret|token|api[_-]?key|authorization)\s*[=:]\s*\S+/gi, '$1=[ẩn]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320);
}

function translate(message: string): string {
  if (/row-level security/i.test(message)) return 'Tài khoản không có quyền ghi dòng này (phạm vi cơ sở).';
  if (/rental line unavailable/i.test(message)) return 'Dòng thuê xe không còn mở hoặc không thuộc cơ sở đang đăng nhập.';
  if (/^not authorized$/i.test(message)) return 'Không được phép thực hiện trên cơ sở đang đăng nhập.';
  if (/violates unique constraint/i.test(message)) return 'Giá trị bị trùng với bản ghi đã có.';
  if (/violates foreign key constraint/i.test(message)) return 'Thiếu bản ghi liên kết (khách, xe, cơ sở hoặc phiếu).';
  if (/does not exist/i.test(message) && /function/i.test(message)) return 'Thiếu hàm trên database — cần chạy SQL cập nhật.';
  return '';
}

export function failureReason(error: unknown): string {
  if (error instanceof Error && error.message && !('code' in error)) {
    const cleaned = sanitizeFailureReason(error.message);
    if (cleaned) return cleaned;
  }
  const row = error && typeof error === 'object' ? error as {
    code?: unknown; message?: unknown; detail?: unknown; hint?: unknown; constraint?: unknown; table?: unknown;
  } : {};
  const code = text(row.code);
  const mapped = PG[code];
  const message = text(row.message) || (error instanceof Error ? error.message : '');
  const translated = translate(message);
  const parts = [
    translated || mapped?.label,
    translated ? '' : sanitizeFailureReason(message),
    sanitizeFailureReason(text(row.detail)),
    sanitizeFailureReason(text(row.hint)),
    text(row.constraint) ? `ràng buộc ${row.constraint}` : '',
    text(row.table) ? `bảng ${row.table}` : '',
    code && !mapped && !translated ? `mã ${code}` : '',
  ].filter(Boolean);
  const unique: string[] = [];
  for (const part of parts) {
    if (!unique.some(item => item === part || item.includes(part) || part.includes(item))) unique.push(part);
  }
  return unique.join(' · ') || 'Lỗi chưa xác định (máy chủ không trả mã).';
}

export function failureStatus(error: unknown, fallback = 500): number {
  if (error instanceof Error && 'status' in error) {
    const status = Number((error as { status: unknown }).status);
    if (Number.isInteger(status) && status >= 400 && status < 600) return status;
  }
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
  return PG[code]?.status ?? fallback;
}

export function publicFailure(action: string, error: unknown): string {
  const reason = failureReason(error);
  const prefix = action.replace(/[. ]+$/, '');
  if (!reason) return prefix;
  if (reason === prefix || reason.startsWith(`${prefix}.`) || reason.startsWith(`${prefix} `)) return reason;
  return `${prefix}. Nguyên nhân: ${reason}`;
}

export function failureResponse(action: string, error: unknown, fallbackStatus = 500) {
  console.error(action, error instanceof Error ? error.message : error);
  return NextResponse.json(
    { status: 'error', message: publicFailure(action, error) },
    { status: failureStatus(error, fallbackStatus) },
  );
}
