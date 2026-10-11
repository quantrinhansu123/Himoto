import { NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';

const json = (status: number, message: string) => NextResponse.json({ status: 'error', message }, { status });
const STATUSES = ['active', 'inactive', 'leave'];

/** Parses `hr/staff/{id}`; returns null when the path is not a staff item. */
export function parseStaffPath(path: string[]): number | null {
  if (path.length !== 3 || path[0] !== 'hr' || path[1] !== 'staff' || !/^\d+$/.test(path[2])) return null;
  const id = Number(path[2]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function updateStaff(id: number, request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
    body = parsed as Record<string, unknown>;
  } catch { return json(400, 'Thông tin nhân sự không hợp lệ.'); }
  const str = (value: unknown) => typeof value === 'string' ? value.trim() : '';
  const name = str(body.name), phone = str(body.phone), email = str(body.email), position = str(body.position), status = str(body.status);
  const storeId = body.store_id == null || body.store_id === '' ? null : Number(body.store_id);
  if (!name || name.length > 191 || position.length > 191 || !/^\+?\d{9,13}$/.test(phone.replace(/[\s.()-]/g, '')) ||
      (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || !STATUSES.includes(status) || (storeId !== null && (!Number.isInteger(storeId) || storeId <= 0))) {
    return json(400, 'Kiểm tra họ tên, số điện thoại, email, cơ sở và trạng thái.');
  }
  try {
    const result = await himotoPool.query(
      `UPDATE himoto.staff_profiles SET full_name=$2, phone=$3, email=NULLIF($4,''), position=NULLIF($5,''), store_id=$6, status=$7 WHERE id=$1 RETURNING id`,
      [id, name, phone, email, position, storeId, status]);
    if (!result.rowCount) return json(404, 'Không tìm thấy nhân sự cần cập nhật.');
    return NextResponse.json({ status: 'success', data: null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Supabase staff update failed:', error instanceof Error ? error.name : 'Unknown database error');
    return json(500, 'Không lưu được thay đổi nhân sự.');
  }
}
