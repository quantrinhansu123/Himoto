import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { CONTRACT_LIST_SQL, DraftSaveError, saveDatabaseDraft } from '@/lib/server/contract-drafts';
import { protectDatabaseRequest } from '@/lib/server/management-session';
import { STORE_SELECT_SQL } from '@/lib/server/store-management';
import { parseCustomerRelatives } from '@/lib/management/customer-relatives';

export const runtime = 'nodejs';

type Params = { params: Promise<{ path: string[] }> };
type QueryConfig = { sql: string; values?: number[] };

const listQueries: Record<string, QueryConfig> = {
  'hr/staff': {
    sql: `SELECT p.id, p.staff_code, p.full_name, p.phone, p.email, p.position,
                 p.store_id, s.store_name, p.status, p.joined_at
          FROM himoto.staff_profiles p
          LEFT JOIN himoto.stores s ON s.id = p.store_id
          ORDER BY p.id DESC`,
  },
  customers: {
    sql: `SELECT c.id, c.name, c.email, c.phone, c.address, c.id_card, c.driver_license_number, c.driver_license_issued_on::text AS driver_license_issued_on,
                 CASE WHEN c.status = 2 THEN 'bad_debt' WHEN c.status = 0 THEN 'draft'
                      WHEN NULLIF(BTRIM(c.warning), '') IS NOT NULL THEN 'warning' ELSE 'active' END AS status,
                 c.warning, c.created_at, c.xmin::text AS customer_revision, c.id_card_issued_on, c.id_card_issued_by, c.relatives,
                 c.store_id, s.store_name, COALESCE(oc.contract_count, 0) AS contract_count
          FROM himoto.customers c
          LEFT JOIN himoto.stores s ON s.id = c.store_id
          LEFT JOIN (SELECT customer_id, count(*)::int AS contract_count FROM himoto.orders
                     WHERE deleted_at IS NULL GROUP BY customer_id) oc ON oc.customer_id = c.id
          ORDER BY c.id DESC`,
  },
  stores: {
    sql: `${STORE_SELECT_SQL} ORDER BY s.id`,
  },
  'vehicle/vehicles': {
    sql: `SELECT v.id, v.name, v.brand, v.type, v.year, v.status, v.license, v.odometer, NULL::numeric AS daily_price, NULL::numeric AS monthly_price,
                 v.color, v.chassis, v.engine, v.store_id, v.current_store_id, s.store_name
          FROM himoto.vehicles v
          LEFT JOIN himoto.stores s ON s.id = COALESCE(v.current_store_id, v.store_id)
          ORDER BY v.id DESC`,
  },
  'order/car-rental': {
    sql: `${CONTRACT_LIST_SQL} ORDER BY o.id DESC`,
  },
  transactions: {
    sql: `SELECT t.id, t.created_at, t.type, t.user_id, u.name AS user_name, t.store_id, s.store_name,
                 CASE WHEN t.name='order:payment' THEN 'Thanh toán hợp đồng' WHEN t.name='order:renewal' THEN 'Thu tiền gia hạn' WHEN t.name='order:extra' THEN 'Phiếu thu thêm hợp đồng' ELSE t.name END AS reason,
                 COALESCE(t."desc", t.note) AS content, t.value AS amount,t.order_id,
                 COALESCE(o.contract_number,o.draft_reference,'#' || t.order_id::text) AS contract_code,
                 CASE WHEN t.payment_method=3 THEN 'Tiền mặt + Chuyển khoản'
                      WHEN t.cash_id IS NOT NULL OR t.payment_method=1 THEN 'Tiền mặt'
                      WHEN t.bank_owner_type='company' THEN 'CK tài khoản công ty'
                      WHEN t.bank_id IS NOT NULL OR t.payment_method=2 THEN 'Chuyển khoản' END AS payment_method,
                 CASE WHEN t.cash_id IS NOT NULL THEN 'Két tiền mặt #' || t.cash_id::text
                      ELSE b.bank_name || ' · ' || b.owner_name || ' · ' || b.account_number END AS account
          FROM himoto.transactions t
          LEFT JOIN himoto.users u ON u.id = t.user_id
          LEFT JOIN himoto.orders o ON o.id=t.order_id
          LEFT JOIN himoto.stores s ON s.id=t.store_id
          LEFT JOIN himoto.banks b ON b.id=t.bank_id
          ORDER BY t.id DESC`,
  },
};

async function readAll(query: QueryConfig) {
  const data = await himotoPool.query(query.sql, query.values);
  // The UI filters and sorts locally, so return each current dataset in one
  // response instead of making dozens of sequential page requests.
  return NextResponse.json({ status: 'success', data: data.rows }, { headers: { 'Cache-Control': 'no-store' } });
}

async function writeDraft(request: NextRequest, id: number | null) {
  let client;
  try {
    const body: unknown = await request.json();
    client = await himotoPool.connect();
    await client.query('BEGIN');
    const row = await saveDatabaseDraft(client, id, body);
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data: row }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    if (error instanceof DraftSaveError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Thông tin bản nháp không hợp lệ.' }, { status: 400 });
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') return NextResponse.json({ status: 'error', message: 'Mã bản nháp đã được sử dụng.' }, { status: 409 });
    console.error('Supabase draft write failed:', error instanceof Error ? error.name : 'Unknown database error');
    return NextResponse.json({ status: 'error', message: 'Không lưu được bản nháp vào Supabase. Thông tin đang nhập vẫn được giữ trong form.' }, { status: 500 });
  } finally { client?.release(); }
}

export async function GET(request: NextRequest, { params }: Params) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;

  const { path } = await params;
  const key = path.join('/');
  try {
    if (key === 'customers/search-by-id-card') {
      const idCard = request.nextUrl.searchParams.get('id_card')?.replace(/\s+/g, '') || '';
      const result = await himotoPool.query(
        `SELECT c.id, c.name, c.email, c.phone, c.address, c.id_card, c.driver_license_number, c.driver_license_issued_on::text AS driver_license_issued_on,
                CASE WHEN c.status = 2 THEN 'bad_debt' WHEN c.status = 0 THEN 'draft'
                     WHEN NULLIF(BTRIM(c.warning), '') IS NOT NULL THEN 'warning' ELSE 'active' END AS status,
                c.warning, c.created_at, c.id_card_issued_on, c.id_card_issued_by, c.relatives,
                c.store_id, s.store_name
         FROM himoto.customers c LEFT JOIN himoto.stores s ON s.id = c.store_id
         WHERE regexp_replace(COALESCE(c.id_card, ''), '\\s+', '', 'g') = $1 LIMIT 2`,
        [idCard],
      );
      if (result.rows.length > 1) return NextResponse.json({ status: 'error', message: 'Có nhiều hồ sơ trùng giấy tờ.' }, { status: 409 });
      return NextResponse.json({ status: 'success', data: result.rows[0] || null });
    }
    if (key === 'customers/search') {
      const query = request.nextUrl.searchParams.get('query')?.replace(/\D/g, '') || '';
      const storeId = Number(request.nextUrl.searchParams.get('store_id'));
      if (query.length < 9 || query.length > 13 || !Number.isSafeInteger(storeId) || storeId <= 0) return NextResponse.json({ status: 'success', data: [] });
      const result = await himotoPool.query(
        `SELECT c.id, c.name, c.email, c.phone, c.address, c.id_card, c.driver_license_number, c.driver_license_issued_on::text AS driver_license_issued_on,
                CASE WHEN c.status = 2 THEN 'bad_debt' WHEN c.status = 0 THEN 'draft'
                     WHEN NULLIF(BTRIM(c.warning), '') IS NOT NULL THEN 'warning' ELSE 'active' END AS status,
                c.warning AS warning_note, c.created_at, c.id_card_issued_on, c.id_card_issued_by,
                c.relatives, c.store_id, s.store_name
         FROM himoto.customers c LEFT JOIN himoto.stores s ON s.id = c.store_id
         WHERE (c.store_id = $2 OR (c.store_id IS NULL AND EXISTS (
                  SELECT 1 FROM himoto.orders o WHERE o.customer_id = c.id AND o.store_id = $2 AND o.deleted_at IS NULL
                )))
           AND (regexp_replace(COALESCE(c.id_card, ''), '\\D', '', 'g') = $1
             OR regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g') = $1)
         ORDER BY c.id DESC LIMIT 25`, [query, storeId],
      );
      return NextResponse.json({ status: 'success', data: result.rows });
    }
    const query = listQueries[key];
    if (!query) return NextResponse.json({ status: 'error' }, { status: 404 });
    if (key === 'hr/staff' && request.nextUrl.searchParams.has('store_id')) {
      const storeId = request.nextUrl.searchParams.get('store_id') || '';
      if (!/^\d+$/.test(storeId) || !Number.isSafeInteger(Number(storeId)) || Number(storeId) <= 0) {
        return NextResponse.json({ status: 'error', message: 'Mã cơ sở không hợp lệ.' }, { status: 400 });
      }
      return await readAll({ sql: query.sql.replace('ORDER BY p.id DESC', 'WHERE p.store_id=$1 ORDER BY p.id DESC'), values: [Number(storeId)] });
    }
    if (key === 'order/car-rental') {
      const customerId = request.nextUrl.searchParams.get('customer_id');
      if (customerId !== null) {
        if (!/^\d+$/.test(customerId) || !Number.isSafeInteger(Number(customerId)) || Number(customerId) <= 0) {
          return NextResponse.json({ status: 'error', message: 'Mã khách hàng không hợp lệ.' }, { status: 400 });
        }
        return await readAll({ sql: `${CONTRACT_LIST_SQL} AND o.customer_id=$1 AND o.order_status <> 'draft' ORDER BY o.id DESC`, values: [Number(customerId)] });
      }
      return await readAll({ sql: query.sql });
    }
    return await readAll(query);
  } catch (error) {
    console.error('Supabase read failed:', error instanceof Error ? error.name : 'Unknown database error');
    return NextResponse.json({ status: 'error', message: 'Không tải được dữ liệu từ Supabase.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  const { path } = await params;
  if (path.join('/') === 'order/car-rental') return writeDraft(request, null);
  if (path.join('/') !== 'customers') return NextResponse.json({ status: 'error' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid body');
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ status: 'error', message: 'Thông tin khách hàng không hợp lệ.' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const address = typeof body.address === 'string' ? body.address.trim() : '';
  const idCard = typeof body.id_card === 'string' ? body.id_card.replace(/\s+/g, '') : '';
  const storeId = body.store_id == null || body.store_id === '' ? null : Number(body.store_id);
  const status = String(body.status || 'active');
  const warning = typeof body.warning_note === 'string' ? body.warning_note.trim() : '';
  const driverLicenseNumber = typeof body.driver_license_number === 'string' ? body.driver_license_number.trim() : '';
  const driverLicenseIssuedOn = typeof body.driver_license_issued_on === 'string' ? body.driver_license_issued_on.trim() : '';
  let relatives: ReturnType<typeof parseCustomerRelatives>;
  try { relatives = parseCustomerRelatives(body.relatives ?? []); }
  catch (cause) { return NextResponse.json({ status: 'error', message: cause instanceof Error ? cause.message : 'Thông tin người thân không hợp lệ.' }, { status: 400 }); }
  if (!name || !address || !/^\+?\d{9,13}$/.test(phone.replace(/[\s.()-]/g, '')) || !/^\d{9}$|^\d{12}$/.test(idCard) ||
      (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || !['active', 'warning', 'blacklist', 'draft'].includes(status) ||
      (driverLicenseIssuedOn && !/^\d{4}-\d{2}-\d{2}$/.test(driverLicenseIssuedOn)) || driverLicenseNumber.length > 100 ||
      (status === 'warning' && !warning) || (storeId !== null && (!Number.isInteger(storeId) || storeId <= 0))) {
    return NextResponse.json({ status: 'error', message: 'Kiểm tra họ tên, điện thoại, CCCD/CMND, địa chỉ và email.' }, { status: 400 });
  }

  const client = await himotoPool.connect();
  try {
    await client.query('BEGIN');
    // Serialize duplicate preflight with Excel imports and other customer writes.
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query('LOCK TABLE himoto.customers IN SHARE ROW EXCLUSIVE MODE');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [idCard]);
    const duplicate = await client.query(
      `SELECT id FROM himoto.customers
       WHERE regexp_replace(COALESCE(id_card, ''), '\\s+', '', 'g') = $1 LIMIT 1`,
      [idCard],
    );
    if (duplicate.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ status: 'error', message: 'Số CCCD/CMND này đã có trong danh sách khách hàng.' }, { status: 409 });
    }
    const result = await client.query(
      `INSERT INTO himoto.customers (name, phone, email, address, id_card, status, store_id, warning, driver_license_number, driver_license_issued_on, relatives, created_at, updated_at)
       VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, $7, $8, NULLIF($9,''), NULLIF($10,'')::date, $11::jsonb, now(), now())
       RETURNING id, name, phone, email, address, id_card, driver_license_number, driver_license_issued_on::text AS driver_license_issued_on,
                 CASE WHEN status = 2 THEN 'bad_debt' WHEN NULLIF(BTRIM(warning), '') IS NOT NULL THEN 'warning'
                      WHEN status = 0 THEN 'draft' ELSE 'active' END AS status,
                 warning, created_at, xmin::text AS customer_revision, id_card_issued_on, id_card_issued_by, relatives, store_id`,
      [name, phone, email, address, idCard, status === 'blacklist' ? 2 : status === 'draft' ? 0 : 1, storeId, status === 'blacklist' ? warning || 'Blacklist' : status === 'warning' ? warning : null, driverLicenseNumber, driverLicenseIssuedOn, JSON.stringify(relatives)],
    );
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data: result.rows[0] }, { status: 201 });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Supabase customer insert failed:', error instanceof Error ? error.name : 'Unknown database error');
    return NextResponse.json({ status: 'error', message: 'Không lưu được khách hàng vào Supabase.' }, { status: 500 });
  } finally {
    client.release();
  }
}

async function getCustomerId(params: Params['params']) {
  const { path } = await params;
  if (path.length !== 2 || path[0] !== 'customers' || !/^\d+$/.test(path[1])) return null;
  const id = Number(path[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function PUT(request: NextRequest, { params }: Params) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  const { path } = await params;
  if (path.length !== 3 || path[0] !== 'order' || path[1] !== 'car-rental' || !/^\d+$/.test(path[2])) return NextResponse.json({ status: 'error' }, { status: 404 });
  return writeDraft(request, Number(path[2]));
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  const id = await getCustomerId(params);
  if (!id) return NextResponse.json({ status: 'error', message: 'Mã khách hàng không hợp lệ.' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid body');
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ status: 'error', message: 'Thông tin khách hàng không hợp lệ.' }, { status: 400 });
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const address = typeof body.address === 'string' ? body.address.trim() : '';
  const idCard = typeof body.id_card === 'string' ? body.id_card.replace(/\s+/g, '') : '';
  const warning = typeof body.warning_note === 'string' ? body.warning_note.trim() : '';
  const storeId = body.store_id == null || body.store_id === '' ? null : Number(body.store_id);
  const status = String(body.status || '');
  const driverLicenseNumber = typeof body.driver_license_number === 'string' ? body.driver_license_number.trim() : '';
  const driverLicenseIssuedOn = typeof body.driver_license_issued_on === 'string' ? body.driver_license_issued_on.trim() : '';
  let relatives: ReturnType<typeof parseCustomerRelatives> | undefined;
  try { relatives = body.relatives === undefined ? undefined : parseCustomerRelatives(body.relatives); }
  catch (cause) { return NextResponse.json({ status: 'error', message: cause instanceof Error ? cause.message : 'Thông tin người thân không hợp lệ.' }, { status: 400 }); }
  if (!name || !/^\+?\d{9,13}$/.test(phone.replace(/[\s.()-]/g, '')) || (idCard && !/^\d{9}$|^\d{12}$/.test(idCard)) ||
      (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || !['active', 'warning', 'blacklist', 'draft'].includes(status) ||
      (driverLicenseIssuedOn && !/^\d{4}-\d{2}-\d{2}$/.test(driverLicenseIssuedOn)) || driverLicenseNumber.length > 100 ||
      (status === 'warning' && !warning) || (storeId !== null && (!Number.isInteger(storeId) || storeId <= 0))) {
    return NextResponse.json({ status: 'error', message: 'Kiểm tra họ tên, số điện thoại, giấy tờ, email, cơ sở và trạng thái hồ sơ.' }, { status: 400 });
  }

  const client = await himotoPool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query('LOCK TABLE himoto.customers IN SHARE ROW EXCLUSIVE MODE');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`customer:${idCard || `id:${id}`}`]);
    const duplicate = idCard ? await client.query(
      `SELECT id FROM himoto.customers WHERE id <> $1 AND regexp_replace(COALESCE(id_card, ''), '\\s+', '', 'g') = $2 LIMIT 1`, [id, idCard],
    ) : { rowCount: 0 };
    if (duplicate.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ status: 'error', message: 'Số CCCD/CMND này đã thuộc hồ sơ khách hàng khác.' }, { status: 409 });
    }
    const dbStatus = status === 'blacklist' ? 2 : status === 'draft' ? 0 : 1;
    const dbWarning = status === 'blacklist' ? warning || 'Blacklist' : status === 'warning' ? warning : null;
    const result = await client.query(
      `UPDATE himoto.customers SET name=$2, phone=$3, address=NULLIF($4,''),
         id_card=NULLIF($5,''), status=$6, warning=$7, store_id=$8,
         driver_license_number=NULLIF($9,''), driver_license_issued_on=NULLIF($10,'')::date,
         relatives=COALESCE($11::jsonb, relatives), updated_at=now()
       WHERE id=$1
       RETURNING id, name, email, phone, address, id_card, driver_license_number, driver_license_issued_on::text AS driver_license_issued_on,
         CASE WHEN status = 2 THEN 'bad_debt' WHEN NULLIF(BTRIM(warning), '') IS NOT NULL THEN 'warning'
              WHEN status = 0 THEN 'draft' ELSE 'active' END AS status,
         warning AS warning_note, created_at, xmin::text AS customer_revision, id_card_issued_on, id_card_issued_by, relatives, store_id`,
      [id, name, phone, address, idCard, dbStatus, dbWarning, storeId, driverLicenseNumber, driverLicenseIssuedOn, relatives === undefined ? null : JSON.stringify(relatives)],
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ status: 'error', message: 'Không tìm thấy khách hàng cần cập nhật.' }, { status: 404 });
    }
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Supabase customer update failed:', error instanceof Error ? error.name : 'Unknown database error');
    return NextResponse.json({ status: 'error', message: 'Không lưu được thay đổi khách hàng vào Supabase.' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  const id = await getCustomerId(params);
  if (!id) return NextResponse.json({ status: 'error', message: 'Mã khách hàng không hợp lệ.' }, { status: 400 });
  const client = await himotoPool.connect();
  try {
    await client.query('BEGIN');
    const customer = await client.query('SELECT id FROM himoto.customers WHERE id=$1 FOR UPDATE', [id]);
    if (!customer.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ status: 'error', message: 'Không tìm thấy khách hàng cần xóa.' }, { status: 404 });
    }
    const linkedOrders = await client.query('SELECT count(*)::int AS count FROM himoto.orders WHERE customer_id=$1', [id]);
    const count = Number(linkedOrders.rows[0]?.count || 0);
    if (count > 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ status: 'error', message: `Không thể xóa hồ sơ này vì đang liên kết với ${count} đơn thuê. Hãy giữ lại hồ sơ để bảo toàn lịch sử hợp đồng.` }, { status: 409 });
    }
    await client.query('DELETE FROM himoto.customers WHERE id=$1', [id]);
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data: null });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Supabase customer delete failed:', error instanceof Error ? error.name : 'Unknown database error');
    return NextResponse.json({ status: 'error', message: 'Không xóa được hồ sơ khách hàng.' }, { status: 500 });
  } finally {
    client.release();
  }
}
