import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminAccount } from '@/lib/management/permissions';
import { ownerDatabase } from './himoto-database';
import type { SessionUser } from './management-session';
import { failureResponse } from './public-failure';

const error = (message: string, status: number) => NextResponse.json({ status: 'error', message }, { status });
export async function handleAttendanceLocations(request: NextRequest, user: SessionUser) {
  const scope = [isAdminAccount(user) || user.scope_all === true, user.store_id ?? null];
  try {
    if (request.method === 'GET') {
      const { rows } = await ownerDatabase.query(`SELECT s.id,s.store_name,l.latitude,l.longitude
        FROM himoto.stores s LEFT JOIN himoto.management_attendance_locations l ON l.store_id=s.id
        WHERE $1::boolean OR s.id=$2 ORDER BY s.store_name,s.id`, scope);
      return NextResponse.json({ status: 'success', data: rows }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const body = await request.json().catch(() => null), { storeId, latitude, longitude } = body ?? {};
    if (typeof storeId !== 'string' || !/^[1-9]\d{0,14}$/.test(storeId) || !Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return error('Chọn cơ sở và nhập tọa độ hợp lệ.', 400);
    const { rowCount } = await ownerDatabase.query(`INSERT INTO himoto.management_attendance_locations(store_id,latitude,longitude)
      SELECT id,$4,$5 FROM himoto.stores WHERE id=$3 AND ($1::boolean OR id=$2)
      ON CONFLICT (store_id) DO UPDATE SET latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude`, [...scope, storeId, latitude, longitude]);
    if (!rowCount) return error('Không tìm thấy cơ sở trong phạm vi quản lý.', 404);
    return NextResponse.json({ status: 'success', data: null });
  } catch (cause) { return failureResponse('Không xử lý được vị trí chấm công.', cause); }
}
