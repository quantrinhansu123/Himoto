const assert = require('node:assert/strict');
const path = require('node:path');
const { NextRequest } = require('next/server');
const { load, root } = require('./lib/load-typescript.cjs');
const { parseShiftInput, SHIFT_PHOTOS, emptyShiftSummary, shiftVehicleTotal } = load(path.join(root, 'lib/management/shift-reports'));
const base = { store_id: 1, date: '2026-10-21', staff: 'Chu Văn Tú, Nguyễn Anh Tú', vehicles: 19, batteries: 4, charged: 2, transfers: 1, cash: 1865000, personal: 64300134, company: 26790959, electricity_off: false, notes: 'Không' };
async function main() {
  assert.deepEqual(parseShiftInput(base), base);
  const vehicles = parseShiftInput({ ...base, vehicles: 20, daily_vehicles: 16, monthly_vehicles: 7 });
  assert.equal(shiftVehicleTotal(vehicles), 43);
  assert.equal(shiftVehicleTotal(base), null);
  assert.equal(shiftVehicleTotal({ vehicles: 0, daily_vehicles: 0, monthly_vehicles: 0 }), 0);
  for (const counts of [{ daily_vehicles: -1, monthly_vehicles: 7 },{ daily_vehicles: 1.5, monthly_vehicles: 7 },{ daily_vehicles: 16 },{ daily_vehicles: '16', monthly_vehicles: 7 }]) assert.throws(() => parseShiftInput({ ...base,...counts }));
  console.log('PASS: tổng xe 16 + 7 + 20 = 43; kiểm tra số lượng và báo cáo cũ thiếu số liệu.');
  const summary = { ...emptyShiftSummary(), contracts_total: 1, contracts_renting: 1, income_total: 770000, income_renewal: 570000, income_rental: 200000, expense_total: 9000000, deposit_refund: 9000000 };
  assert.deepEqual(parseShiftInput({ ...base, summary }).summary, summary);
  for (const patch of [{ contracts_total: -1 }, { contracts_completed: 1.5 }, { income_total: '770000' }, { late_penalty: Infinity }, { expense_total: 1e13 }, { income_deposit: undefined }]) assert.throws(() => parseShiftInput({ ...base, summary: { ...summary, ...patch } }));
  for (const invalid of [null, [], 'invalid']) assert.throws(() => parseShiftInput({ ...base, summary: invalid }));
  console.log('PASS: lưu đủ 12 trường thống kê, chặn số liệu không hợp lệ, tương thích báo cáo cũ chưa có thống kê.');
  for (const patch of [{ store_id: 0 },{ store_id: '1' },{ date: '2026-02-30' },{ date: 'bad' },{ staff: ' ' },{ vehicles: -1 },{ batteries: 1.5 },{ charged: 5 },{ cash: '1865000' },{ personal: Infinity },{ company: 1e13 },{ notes: 'x'.repeat(5001) },{ electricity_off: 'true' }]) assert.throws(() => parseShiftInput({ ...base,...patch }));
  assert.equal(SHIFT_PHOTOS.length, 6);
  const session = load(path.join(root,'lib/server/management-session'));
  const { GET, POST } = load(path.join(root,'app/api/auth/shift-reports/route'));
  const noSession = await GET(new NextRequest('http://localhost/api/auth/shift-reports'));
  assert.equal(noSession.status, 401);
  const crossOrigin = await POST(new NextRequest('http://localhost/api/auth/shift-reports', { method: 'POST', headers: { origin: 'https://invalid.example' }, body: '{}' }));
  assert.equal(crossOrigin.status, 403);
  console.log('PASS: số lượng, số tiền, ngày, nhân sự, pin đầy, 6 loại ảnh, phiên đăng nhập và chống gửi khác origin.');
  if (process.argv.includes('--live-read')) {
    require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
    const { ownerDatabase } = load(path.join(root,'lib/server/himoto-database'));
    const admins = (await ownerDatabase.query("SELECT u.id FROM himoto.users u LEFT JOIN himoto.management_account_access a ON a.user_id=u.id WHERE u.status='active' AND u.deleted_at IS NULL AND (a.access_role='admin' OR (a.access_role IS NULL AND u.role_id=1)) LIMIT 1")).rows;
    assert(admins.length, 'Cần admin hoạt động để kiểm tra đọc API.');
    const token = session.signSession(Number(admins[0].id));
    const headers = { cookie: `himoto_management_session=${token}` };
    const response = await GET(new NextRequest('http://localhost/api/auth/shift-reports',{headers}));
    assert.equal(response.status,200); assert(Array.isArray((await response.json()).data));
    const invalid = await POST(new NextRequest('http://localhost/api/auth/shift-reports',{method:'POST',headers:{...headers,origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({payload:{...base,charged:5},status:'draft'})}));
    assert.equal(invalid.status,400);
    const store = (await ownerDatabase.query('SELECT id FROM himoto.stores ORDER BY id LIMIT 1')).rows[0];
    const incomplete = await POST(new NextRequest('http://localhost/api/auth/shift-reports',{method:'POST',headers:{...headers,origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({payload:{...base,store_id:Number(store.id),electricity_off:true},status:'submitted'})}));
    assert.equal(incomplete.status,400); assert.match((await incomplete.json()).message,/6 ảnh/);
    const branch = (await ownerDatabase.query("SELECT u.id FROM himoto.users u JOIN himoto.management_account_access a ON a.user_id=u.id WHERE u.status='active' AND u.deleted_at IS NULL AND a.enabled AND NOT a.scope_all AND a.store_id IS NOT NULL AND a.permissions ? 'contracts.read' LIMIT 1")).rows[0];
    if (branch) {
      const branchHeaders = {cookie:`himoto_management_session=${session.signSession(Number(branch.id))}`};
      const scoped = await GET(new NextRequest('http://localhost/api/auth/shift-reports',{headers:branchHeaders})); assert.equal(scoped.status,200);
      const branchUser = await session.userFromSession(session.signSession(Number(branch.id)));
      const outOfScope = (await ownerDatabase.query('SELECT id FROM himoto.stores WHERE id<>$1 LIMIT 1',[branchUser.store_id])).rows[0];
      if (outOfScope) {
        const forbidden = await POST(new NextRequest('http://localhost/api/auth/shift-reports',{method:'POST',headers:{...branchHeaders,origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({payload:{...base,store_id:Number(outOfScope.id)},status:'draft'})})); assert.equal(forbidden.status,403);
      }
      console.log('PASS: API hoạt động với vai trò PGD và từ chối ghi ngoài phạm vi.');
    }
    const schema = (await ownerDatabase.query("SELECT count(*)::int AS count FROM pg_policies WHERE schemaname='himoto' AND tablename IN ('management_shift_reports','management_shift_photos')")).rows[0];
    assert.equal(schema.count,2);
    console.log('PASS: API đọc dữ liệu thật, từ chối số pin đầy không hợp lệ, có policy cho cả báo cáo và ảnh. Không ghi dữ liệu nghiệp vụ.');
  }
}
main().catch(error => { console.error(error.message); process.exitCode=1; }).finally(async()=>{await globalThis.himotoPool?.end();});
