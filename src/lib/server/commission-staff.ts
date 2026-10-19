import 'server-only';
import { staffRoles } from '@/lib/management/staff-positions';
import { ownerDatabase } from './himoto-database';

/** Company-wide commission attribution (NVKD / TLS), not branch RLS. */
export async function loadCommissionStaff(id: string | number, role: 'NVKD' | 'TLS') {
  const result = await ownerDatabase.query(
    'SELECT id, full_name AS name, position, status FROM himoto.staff_profiles WHERE id=$1',
    [id],
  );
  const row = result.rows[0];
  if (!row || !['active', '1'].includes(String(row.status).toLowerCase()) || !staffRoles(row.position).includes(role)) return null;
  return { staff_id: Number(row.id), name: String(row.name) };
}
