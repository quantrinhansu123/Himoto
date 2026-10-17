import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { CONTRACT_LIST_SQL, DraftSaveError, contractListScopeClause, saveDatabaseDraft } from '@/lib/server/contract-drafts';
import { protectDatabaseRequest } from '@/lib/server/management-session';
import { STORE_SELECT_SQL } from '@/lib/server/store-management';
import { createAccount, deleteAccount, listAccountTransactions, parseAccountCollectionPath, parseAccountPath, updateAccount } from '@/lib/server/cashbook-accounts';
import { createStaff, parseStaffPath, updateStaff } from '@/lib/server/staff-management';
import { parseCustomerRelatives } from '@/lib/management/customer-relatives';
import { validIdentityIssueDate } from '@/lib/management/customer-identity';
import { CUSTOMER_PROFILE_SQL, CUSTOMER_SEARCH_SQL } from '@/lib/server/customer-search';
import { CASHBOOK_LIST_SQL, CashbookQueryError, listCashbook } from '@/lib/server/cashbook-list';
import { ManagementTableError, readManagementTable } from '@/lib/server/management-table';
import { PageSummaryError, readOperationsSummary, readSalesSummary } from '@/lib/server/page-summaries';
import { VEHICLE_TRANSFER_JOIN_SQL } from '@/lib/server/vehicle-transfers';
import { dataAccess } from '@/lib/server/access-context';
import { hasPermission } from '@/lib/management/permissions';

export const runtime = 'nodejs';

type Params = { params: Promise<{ path: string[] }> };
type QueryConfig = { sql: string; values?: number[] };

const listQueries: Record<string, QueryConfig> = {
  'hr/staff': {
    sql: `SELECT p.id, p.staff_code, p.full_name, p.phone, p.email, p.position,
                 p.store_id, s.store_name, p.status, p.joined_at, p.notes
          FROM himoto.staff_profiles p
          LEFT JOIN himoto.stores s ON s.id = p.store_id
          ORDER BY p.id DESC`,
  },
  customers: {
    sql: `${CUSTOMER_PROFILE_SQL} ORDER BY c.id DESC`,
  },
  stores: {
    sql: `${STORE_SELECT_SQL} ORDER BY s.id`,
  },
  'vehicle/vehicles': {
    sql: `SELECT v.id, v.name, v.brand, v.type, v.year, v.status, v.license, v.odometer, NULL::numeric AS daily_price, NULL::numeric AS monthly_price,
                 v.color, v.chassis, v.engine, v.store_id, v.current_store_id, s.store_name, v.xmin::text AS vehicle_revision,
                 pending_transfer.id AS transfer_event_id,pending_transfer.from_store_id AS transfer_from_store_id,
                 pending_transfer.to_store_id AS transfer_to_store_id,pending_transfer.from_store_name AS transfer_from_store_name,
                 pending_transfer.to_store_name AS transfer_to_store_name,pending_transfer.receivable AS transfer_receivable,
                 r.rentals, b.beneficiary_store_id, bs.store_name AS beneficiary_store_name,
                 gps.has_device AS gps_has_device,
                 gps.normalized_status AS gps_normalized_status,
                 gps.last_at AS gps_last_at,gps.latitude AS gps_latitude,gps.longitude AS gps_longitude,gps.synced_at AS gps_last_sync,gps.provider AS gps_provider
          FROM himoto.vehicles v
          LEFT JOIN himoto.stores s ON s.id = COALESCE(v.current_store_id, v.store_id)
          ${VEHICLE_TRANSFER_JOIN_SQL}
          LEFT JOIN LATERAL (
            SELECT json_agg(json_build_object('order_id', o.id,
                     'code', COALESCE(NULLIF(o.contract_number, ''), NULLIF(o.draft_reference, ''), '#' || o.id::text),
                     'status', CASE WHEN o.order_status = 'renting' AND d.return_at < now() THEN 'overdue' ELSE o.order_status END,
                     'customer', COALESCE(c.name, o.customer_name, ''), 'return_at', d.return_at) ORDER BY d.rent_at DESC) AS rentals,
                   (array_agg(o.store_id ORDER BY d.rent_at DESC))[1] AS store_id
            FROM himoto.order_vehicle_details d
            JOIN himoto.orders o ON o.id = d.order_id
            LEFT JOIN himoto.customers c ON c.id = o.customer_id
            WHERE d.vehicle_id = v.id AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL
              AND o.order_status IN ('renting', 'overdue', 'wait_payment', 'pending', 'deposit_contract')
          ) r ON true
          LEFT JOIN LATERAL (
            SELECT e.ref_type, e.to_store_id FROM himoto.vehicle_location_events e
            WHERE e.vehicle_id = v.id AND e.event_type = 'status_change'
            ORDER BY e.created_at DESC, e.id DESC LIMIT 1
          ) ev ON true
          CROSS JOIN LATERAL (
            SELECT COALESCE(r.store_id, CASE WHEN v.status = 'using' AND ev.ref_type = 'using' THEN ev.to_store_id END, v.current_store_id, v.store_id) AS beneficiary_store_id
          ) b
          LEFT JOIN himoto.stores bs ON bs.id = b.beneficiary_store_id
          LEFT JOIN LATERAL (
            SELECT true AS has_device,CASE WHEN COALESCE(a.last_success_at,d.sync_received_at)<now()-interval '10 minutes' THEN 'stale' ELSE COALESCE(d.management_status,p.normalized_status) END AS normalized_status,
                   d.last_latitude AS latitude,d.last_longitude AS longitude,COALESCE(a.last_success_at,d.sync_received_at) AS synced_at,d.provider,
                   COALESCE(p.provider_recorded_at, p.received_at, p.created_at, d.last_sync_at) AS last_at
            FROM himoto.gps_devices d
            LEFT JOIN himoto.management_gps_accounts a ON a.id=d.source_account_id
            LEFT JOIN LATERAL (
              SELECT normalized_status, provider_recorded_at, received_at, created_at
              FROM himoto.gps_positions
              WHERE gps_device_id = d.id
              ORDER BY COALESCE(provider_recorded_at, received_at, created_at) DESC NULLS LAST
              LIMIT 1
            ) p ON true
            WHERE d.vehicle_id = v.id
            ORDER BY d.heartbeat_at DESC NULLS LAST,d.sync_received_at DESC NULLS LAST,d.id DESC
            LIMIT 1
          ) gps ON true
          ORDER BY v.id DESC`,
  },
  'order/car-rental': {
    sql: `${CONTRACT_LIST_SQL} ORDER BY o.id DESC`,
  },
  transactions: {
    sql: `${CASHBOOK_LIST_SQL} ORDER BY t.id DESC`,
  },
  'cashbook/accounts': {
    sql: `SELECT a.kind, a.id, a.store_id, s.store_name, a.label, a.name, a.bank_name, a.owner_name, a.account_number, a.owner_type, a.status, a.opening_balance,
                 COALESCE(t.income, 0) AS income, COALESCE(t.expense, 0) AS expense, COALESCE(t.voucher_count, 0)::int AS voucher_count,
                 a.opening_balance + COALESCE(t.income, 0) - COALESCE(t.expense, 0) AS balance
          FROM (
            SELECT 'bank' AS kind, b.id, b.store_id, concat_ws(' · ', b.bank_name, b.owner_name, b.account_number) AS label, NULL::text AS name,
                   b.bank_name::text AS bank_name, b.owner_name::text AS owner_name, b.account_number::text AS account_number,
                   COALESCE(b.owner_type, '') AS owner_type, b.status, COALESCE(b.opening_balance, 0) AS opening_balance
            FROM himoto.banks b
            UNION ALL
            SELECT 'cash', c.id, c.store_id, COALESCE(NULLIF(c.name, ''), 'Két tiền mặt #' || c.id::text), c.name::text, NULL, NULL, NULL, '', c.status, COALESCE(c.opening_balance, 0)
            FROM himoto.cash c
          ) a
          LEFT JOIN himoto.stores s ON s.id = a.store_id
          LEFT JOIN (
            SELECT CASE WHEN cash_id IS NOT NULL THEN 'cash' ELSE 'bank' END AS kind, COALESCE(cash_id, bank_id) AS account_id,
                   sum(value) FILTER (WHERE type IN ('in', 'addon')) AS income, sum(value) FILTER (WHERE type = 'out') AS expense, count(*) AS voucher_count
            FROM himoto.transactions
            WHERE status = 'approved' AND (cash_id IS NOT NULL OR bank_id IS NOT NULL)
            GROUP BY 1, 2
          ) t ON t.kind = a.kind AND t.account_id = a.id
          ORDER BY a.kind, a.id`,
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

async function GETHandler(request: NextRequest, { params }: Params) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;

  const { path } = await params;
  const key = path.join('/');
  try {
    if (key==='order/car-rental' && request.nextUrl.searchParams.get('summary')==='operations') {
      return NextResponse.json({status:'success',data:await readOperationsSummary(himotoPool)},{headers:{'Cache-Control':'no-store'}});
    }
    if (key==='order/car-rental' && request.nextUrl.searchParams.get('summary')==='sales') {
      return NextResponse.json({status:'success',data:await readSalesSummary(himotoPool,request.nextUrl.searchParams)},{headers:{'Cache-Control':'no-store'}});
    }
    if (request.nextUrl.searchParams.get('table')==='1' && ['customers','order/car-rental'].includes(key)) {
      const client=await himotoPool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const data=await readManagementTable(client,key==='customers'?'customers':'contracts',request.nextUrl.searchParams);
        await client.query('COMMIT');
        return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'no-store'}});
      } catch(error) { await client.query('ROLLBACK');throw error; }
      finally { client.release(); }
    }
    if (key === 'cashbook/vouchers') {
      const data = await listCashbook(request.nextUrl.searchParams);
      return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const accountTx = parseAccountPath(path, 'transactions');
    if (accountTx) return await listAccountTransactions(accountTx.kind, accountTx.id, request.nextUrl.searchParams);
    if (key === 'customers/search-by-id-card') {
      const idCard = request.nextUrl.searchParams.get('id_card')?.replace(/\s+/g, '') || '';
      const result = await himotoPool.query(
        `${CUSTOMER_PROFILE_SQL}
         WHERE regexp_replace(COALESCE(c.id_card, ''), '\\s+', '', 'g') = $1 LIMIT 2`,
        [idCard],
      );
      if (result.rows.length > 1) return NextResponse.json({ status: 'error', message: 'Có nhiều hồ sơ trùng giấy tờ.' }, { status: 409 });
      return NextResponse.json({ status: 'success', data: result.rows[0] || null }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (key === 'customers/search') {
      const query = request.nextUrl.searchParams.get('query')?.replace(/\D/g, '') || '';
      if (query.length < 9 || query.length > 13) return NextResponse.json({ status: 'success', data: [] }, { headers: { 'Cache-Control': 'no-store' } });
      const result = await himotoPool.query(CUSTOMER_SEARCH_SQL, [query]);
      return NextResponse.json({ status: 'success', data: result.rows }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const query = listQueries[key];
    if (!query) return NextResponse.json({ status: 'error' }, { status: 404 });
    if (key === 'hr/staff' && request.nextUrl.searchParams.has('store_id')) {
      const storeId = request.nextUrl.searchParams.get('store_id') || '';
      if (!/^\d+$/.test(storeId) || !Number.isSafeInteger(Number(storeId)) || Number(storeId) <= 0) {
        return NextResponse.json({ status: 'error', message: 'Mã cơ sở không hợp lệ.' }, { status: 400 });
      }
      const staffSql=hasPermission(dataAccess.getStore(),'hr.read')?query.sql:'SELECT p.id,p.full_name,p.position,p.status,p.store_id FROM himoto.staff_profiles p ORDER BY p.id DESC';
      return await readAll({ sql: staffSql.replace('ORDER BY p.id DESC', 'WHERE p.store_id=$1 ORDER BY p.id DESC'), values: [Number(storeId)] });
    }
    if (key === 'order/car-rental') {
      const customerId = request.nextUrl.searchParams.get('customer_id');
      if (customerId !== null) {
        if (!/^\d+$/.test(customerId) || !Number.isSafeInteger(Number(customerId)) || Number(customerId) <= 0) {
          return NextResponse.json({ status: 'error', message: 'Mã khách hàng không hợp lệ.' }, { status: 400 });
        }
        return await readAll({ sql: `${CONTRACT_LIST_SQL} AND o.customer_id=$1 AND o.order_status <> 'draft' ORDER BY o.id DESC`, values: [Number(customerId)] });
      }
      const scope = request.nextUrl.searchParams.get('scope');
      if (scope !== null && !['drafts', 'overdue', 'vat', 'ownership'].includes(scope)) {
        return NextResponse.json({ status: 'error', message: 'Phạm vi danh sách hợp đồng không hợp lệ.' }, { status: 400 });
      }
      const orderBy = scope === 'ownership'
        ? ` ORDER BY CASE WHEN o.order_status='draft' THEN 0 ELSE 1 END,
            CASE COALESCE(NULLIF(o.order_type,''), o.draft_payload->'management_composer'->>'rental_type')
              WHEN 'ownership_cd' THEN 0 WHEN 'ownership' THEN 1 ELSE 2 END,
            o.id DESC`
        : scope === 'drafts' ? ' ORDER BY o.id DESC'
        : ` ORDER BY CASE WHEN o.order_status='draft' THEN 0 ELSE 1 END, o.id DESC`;
      return await readAll({ sql: `${CONTRACT_LIST_SQL}${contractListScopeClause(scope)}${orderBy}` });
    }
    return await readAll(query);
  } catch (error) {
    if (error instanceof CashbookQueryError || error instanceof ManagementTableError || error instanceof PageSummaryError) return NextResponse.json({ status: 'error', message: error.message }, { status: 400 });
    console.error('Supabase read failed:', error instanceof Error ? error.name : 'Unknown database error');
    return NextResponse.json({ status: 'error', message: 'Không tải được dữ liệu từ Supabase.' }, { status: 500 });
  }
}

async function POSTHandler(request: NextRequest, { params }: Params) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  const { path } = await params;
  if (path.join('/') === 'order/car-rental') return writeDraft(request, null);
  if (path.join('/') === 'hr/staff') return createStaff(request);
  const newAccountKind = parseAccountCollectionPath(path);
  if (newAccountKind) return createAccount(newAccountKind, request);
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
  const incomplete = body.allow_incomplete === true && status === 'draft';
  if (body.allow_incomplete !== undefined && (typeof body.allow_incomplete !== 'boolean' || body.allow_incomplete && status !== 'draft')) return NextResponse.json({status:'error',message:'Hồ sơ tạm cần chọn trạng thái Chưa hoàn tất.'},{status:400});
  const warning = typeof body.warning_note === 'string' ? body.warning_note.trim() : '';
  const driverLicenseNumber = typeof body.driver_license_number === 'string' ? body.driver_license_number.trim() : '';
  const driverLicenseIssuedOn = typeof body.driver_license_issued_on === 'string' ? body.driver_license_issued_on.trim() : '';
  const idCardIssuedOn = typeof body.id_card_issued_on === 'string' ? body.id_card_issued_on.trim() : '';
  const idCardIssuedBy = typeof body.id_card_issued_by === 'string' ? body.id_card_issued_by.trim() : '';
  if (!validIdentityIssueDate(idCardIssuedOn) || idCardIssuedBy.length > 255) return NextResponse.json({ status: 'error', message: 'Ngày cấp hoặc nơi cấp CCCD/CMND không hợp lệ.' }, { status: 400 });
  let relatives: ReturnType<typeof parseCustomerRelatives>;
  try { relatives = parseCustomerRelatives(body.relatives ?? []); }
  catch (cause) { return NextResponse.json({ status: 'error', message: cause instanceof Error ? cause.message : 'Thông tin người thân không hợp lệ.' }, { status: 400 }); }
  if (!name || !incomplete && !address || !/^\+?\d{9,13}$/.test(phone.replace(/[\s.()-]/g, '')) || (idCard ? !/^\d{9}$|^\d{12}$/.test(idCard) : !incomplete) ||
      (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || !['active', 'warning', 'blacklist', 'draft'].includes(status) ||
      !validIdentityIssueDate(driverLicenseIssuedOn) || driverLicenseNumber.length > 100 ||
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
       WHERE ($1 <> '' AND regexp_replace(COALESCE(id_card, ''), '\\s+', '', 'g') = $1)
         OR ($1 = '' AND regexp_replace(COALESCE(phone,''),'[^0-9]','','g') = $2) LIMIT 1`,
      [idCard,phone.replace(/\D/g,'')],
    );
    if (duplicate.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ status: 'error', message: 'Số CCCD/CMND này đã có trong danh sách khách hàng.' }, { status: 409 });
    }
    const result = await client.query(
      `INSERT INTO himoto.customers (name, phone, email, address, id_card, status, store_id, warning, driver_license_number, driver_license_issued_on, relatives, id_card_issued_on, id_card_issued_by, created_at, updated_at)
       VALUES ($1, $2, NULLIF($3, ''), $4, NULLIF($5,''), $6, $7, $8, NULLIF($9,''), NULLIF($10,'')::date, $11::jsonb, NULLIF($12,'')::date, NULLIF($13,''), now(), now())
       RETURNING id, name, phone, email, address, id_card, driver_license_number, driver_license_issued_on::text AS driver_license_issued_on,
                 CASE WHEN status = 2 THEN 'bad_debt' WHEN NULLIF(BTRIM(warning), '') IS NOT NULL THEN 'warning'
                      WHEN status = 0 THEN 'draft' ELSE 'active' END AS status,
                 warning, created_at, xmin::text AS customer_revision, id_card_issued_on, id_card_issued_by, relatives, store_id`,
      [name, phone, email, address, idCard, status === 'blacklist' ? 2 : status === 'draft' ? 0 : 1, storeId, status === 'blacklist' ? warning || 'Blacklist' : status === 'warning' ? warning : null, driverLicenseNumber, driverLicenseIssuedOn, JSON.stringify(relatives), idCardIssuedOn, idCardIssuedBy],
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

async function PUTHandler(request: NextRequest, { params }: Params) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  const { path } = await params;
  if (path.length !== 3 || path[0] !== 'order' || path[1] !== 'car-rental' || !/^\d+$/.test(path[2])) return NextResponse.json({ status: 'error' }, { status: 404 });
  return writeDraft(request, Number(path[2]));
}

async function PATCHHandler(request: NextRequest, { params }: Params) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  const patchPath = (await params).path;
  const account = parseAccountPath(patchPath);
  if (account) return updateAccount(account.kind, account.id, request);
  const staffId = parseStaffPath(patchPath);
  if (staffId) return updateStaff(staffId, request);
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
  const idCardIssuedOn = typeof body.id_card_issued_on === 'string' ? body.id_card_issued_on.trim() : '';
  const idCardIssuedBy = typeof body.id_card_issued_by === 'string' ? body.id_card_issued_by.trim() : '';
  if (!validIdentityIssueDate(idCardIssuedOn) || idCardIssuedBy.length > 255) return NextResponse.json({ status: 'error', message: 'Ngày cấp hoặc nơi cấp CCCD/CMND không hợp lệ.' }, { status: 400 });
  let relatives: ReturnType<typeof parseCustomerRelatives> | undefined;
  try { relatives = body.relatives === undefined ? undefined : parseCustomerRelatives(body.relatives); }
  catch (cause) { return NextResponse.json({ status: 'error', message: cause instanceof Error ? cause.message : 'Thông tin người thân không hợp lệ.' }, { status: 400 }); }
  if (!name || !/^\+?\d{9,13}$/.test(phone.replace(/[\s.()-]/g, '')) || (idCard && !/^\d{9}$|^\d{12}$/.test(idCard)) ||
      (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || !['active', 'warning', 'blacklist', 'draft'].includes(status) ||
      !validIdentityIssueDate(driverLicenseIssuedOn) || driverLicenseNumber.length > 100 ||
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
         relatives=COALESCE($11::jsonb, relatives),
         id_card_issued_on=CASE WHEN $12::boolean THEN NULLIF($13,'')::date ELSE id_card_issued_on END,
         id_card_issued_by=CASE WHEN $14::boolean THEN NULLIF($15,'') ELSE id_card_issued_by END, updated_at=now()
       WHERE id=$1
       RETURNING id, name, email, phone, address, id_card, driver_license_number, driver_license_issued_on::text AS driver_license_issued_on,
         CASE WHEN status = 2 THEN 'bad_debt' WHEN NULLIF(BTRIM(warning), '') IS NOT NULL THEN 'warning'
              WHEN status = 0 THEN 'draft' ELSE 'active' END AS status,
         warning AS warning_note, created_at, xmin::text AS customer_revision, id_card_issued_on, id_card_issued_by, relatives, store_id`,
      [id, name, phone, address, idCard, dbStatus, dbWarning, storeId, driverLicenseNumber, driverLicenseIssuedOn, relatives === undefined ? null : JSON.stringify(relatives), 'id_card_issued_on' in body, idCardIssuedOn, 'id_card_issued_by' in body, idCardIssuedBy],
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

async function DELETEHandler(request: NextRequest, { params }: Params) {
  const denied = await protectDatabaseRequest(request);
  if (denied) return denied;
  const account = parseAccountPath((await params).path);
  if (account) return deleteAccount(account.kind, account.id);
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

export const GET = withAccessRequest(GETHandler);
export const POST = withAccessRequest(POSTHandler);
export const PUT = withAccessRequest(PUTHandler);
export const PATCH = withAccessRequest(PATCHHandler);
export const DELETE = withAccessRequest(DELETEHandler);
