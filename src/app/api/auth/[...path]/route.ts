import { CASHBOOK_ACCOUNTS_SQL } from '@/lib/server/cashbook-account-domain';
import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest, NextResponse } from 'next/server';
import { himotoPool, ownerDatabase } from '@/lib/server/himoto-database';
import { CONTRACT_LIST_SQL, DraftSaveError, contractListScopeClause, saveDatabaseDraft } from '@/lib/server/contract-drafts';
import { protectDatabaseRequest } from '@/lib/server/management-session';
import { STORE_SELECT_SQL } from '@/lib/server/store-management';
import { createAccount, deleteAccount, listAccountTransactions, parseAccountCollectionPath, parseAccountPath, updateAccount,setAccountStatus } from '@/lib/server/cashbook-accounts';
import { createStaff, parseStaffPath, updateStaff } from '@/lib/server/staff-management';
import { CustomerWriteError, parseCustomerWrite, insertCustomer, updateCustomer } from '@/lib/server/customer-writes';
import { CUSTOMER_PROFILE_SQL, CUSTOMER_SEARCH_SQL } from '@/lib/server/customer-search';
import { CASHBOOK_LIST_SQL, CashbookQueryError, listCashbook } from '@/lib/server/cashbook-list';
import { ManagementTableError, readManagementTable } from '@/lib/server/management-table';
import { PageSummaryError, readOperationsSummary, readSalesSummary } from '@/lib/server/page-summaries';
import { VEHICLE_TRANSFER_JOIN_SQL } from '@/lib/server/vehicle-transfers';
import { VEHICLE_GPS_JOIN_SQL } from '@/lib/server/vehicle-gps-query';
import { VEHICLE_STATUS_SQL } from '@/lib/server/vehicle-status';
import { normalizeCustomerLookup, validCustomerLookup } from '@/lib/management/contract-document';
import { dataAccess } from '@/lib/server/access-context';
import { hasPermission } from '@/lib/management/permissions';
import { VEHICLE_ORDER_SQL } from '@/lib/server/contract-classification';
import { DRAFT_VEHICLE_HOLDS_CTE_SQL } from '@/lib/server/draft-vehicle-rentals';
import { contractVehicleDetailsSql } from '@/lib/server/contract-vehicle-reads';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime = 'nodejs';
export const maxDuration = 30;

const normalizeId=(value:string)=>value.trim().replace(/\s/g,'').toUpperCase();
type Params = { params: Promise<{ path: string[] }> };
type QueryConfig = { sql: string; values?: number[] };

const listQueries: Record<string, QueryConfig> = {
  'hr/staff': {
    sql: `SELECT p.id, p.staff_code, p.full_name, p.phone, p.email, p.position,
                 p.store_id, s.store_name, p.status, p.joined_at, p.notes, p.user_id
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
    sql: `WITH rental_blockers AS MATERIALIZED (
            SELECT b.vehicle_id,jsonb_agg(jsonb_build_object(
              'order_id',b.order_id,'code',b.code,'status',b.status,'store_name',b.store_name,
              'customer',COALESCE(NULLIF(c.name,''),NULLIF(o.customer_name,''),''),
              'rent_at',b.rent_at,'return_at',b.return_at) ORDER BY b.rent_at DESC NULLS LAST, b.order_id DESC) AS rentals
            FROM himoto.vehicle_rental_blockers(ARRAY(SELECT id FROM himoto.vehicles WHERE COALESCE(current_store_id,store_id)>0)) b
            LEFT JOIN himoto.orders o ON o.id=b.order_id
            LEFT JOIN himoto.customers c ON c.id=o.customer_id
            GROUP BY b.vehicle_id
          ), ${DRAFT_VEHICLE_HOLDS_CTE_SQL}
          SELECT v.id, v.name, v.brand, v.type, v.year, v.license, v.odometer, NULL::numeric AS daily_price, NULL::numeric AS monthly_price,
                 v.color, v.chassis, v.engine, v.store_id, v.current_store_id, s.store_name, os.store_name AS owner_store_name, v.xmin::text AS vehicle_revision,
                 pending_transfer.id AS transfer_event_id,pending_transfer.from_store_id AS transfer_from_store_id,
                 pending_transfer.to_store_id AS transfer_to_store_id,pending_transfer.from_store_name AS transfer_from_store_name,
                 pending_transfer.to_store_name AS transfer_to_store_name,pending_transfer.receivable AS transfer_receivable,pending_transfer.created_by AS transfer_created_by,
                 r.rentals, COALESCE(blockers.rentals,'[]'::jsonb) AS rental_blockers, COALESCE(drafts.draft_rentals,'[]'::jsonb) AS draft_rentals,
                 rental_source.store_id AS beneficiary_store_id, bs.store_name AS beneficiary_store_name,
                 COALESCE(NULLIF(r.rentals #>> '{0,customer}', ''), 'Lưu kho') AS holder_name,
                 ${VEHICLE_STATUS_SQL} AS status,
                 gps.has_device AS gps_has_device,
                 gps.normalized_status AS gps_normalized_status,
                 gps.last_at AS gps_last_at,gps.latitude AS gps_latitude,gps.longitude AS gps_longitude,gps.synced_at AS gps_last_sync,gps.provider AS gps_provider,
                 gps.heartbeat_at AS gps_heartbeat_at,gps.position_recorded_at AS gps_position_at,gps.provider_reported_at AS gps_reported_at,gps.last_ignition AS gps_ignition
          FROM himoto.vehicles v
          LEFT JOIN rental_blockers blockers ON blockers.vehicle_id=v.id
          LEFT JOIN draft_vehicle_rentals drafts ON drafts.vehicle_id=v.id
          LEFT JOIN himoto.stores s ON s.id = COALESCE(v.current_store_id, v.store_id)
          LEFT JOIN himoto.stores os ON os.id=v.store_id
          ${VEHICLE_TRANSFER_JOIN_SQL}
          LEFT JOIN LATERAL (
            SELECT json_agg(json_build_object('order_id', o.id,
                     'code', COALESCE(NULLIF(o.contract_number, ''), NULLIF(o.draft_reference, ''), '#' || o.id::text),
                     'status', CASE WHEN o.order_status = 'renting' AND d.return_at < now() THEN 'overdue' ELSE o.order_status END,
                     'customer', COALESCE(c.name, o.customer_name, ''), 'rent_at', d.rent_at, 'return_at', d.return_at) ORDER BY d.rent_at DESC) AS rentals,
                   (array_agg(o.store_id ORDER BY d.rent_at DESC))[1] AS store_id
            FROM himoto.order_vehicle_details d
            JOIN himoto.orders o ON o.id = d.order_id
            LEFT JOIN himoto.customers c ON c.id = o.customer_id
            WHERE d.vehicle_id = v.id AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}
              AND o.order_status IN ('renting', 'overdue', 'wait_payment', 'pending', 'deposit_contract')
          ) r ON true
          LEFT JOIN himoto.vehicle_rental_sources(ARRAY(SELECT id FROM himoto.vehicles WHERE deleted_at IS NULL AND COALESCE(current_store_id,store_id)>0)) rental_source ON rental_source.vehicle_id=v.id
          LEFT JOIN himoto.stores bs ON bs.id = rental_source.store_id
          ${VEHICLE_GPS_JOIN_SQL}
          WHERE v.deleted_at IS NULL AND COALESCE(v.current_store_id,v.store_id)>0
          ORDER BY v.id DESC`,
  },
  'order/car-rental': {
    sql: `${CONTRACT_LIST_SQL} ORDER BY o.id DESC`,
  },
  transactions: {
    sql: `${CASHBOOK_LIST_SQL} ORDER BY t.id DESC`,
  },
  'cashbook/accounts': { sql: `${CASHBOOK_ACCOUNTS_SQL} ORDER BY a.kind,a.id` },
};

async function readAll(query: QueryConfig) {
  const data = await himotoPool.query(contractVehicleDetailsSql(query.sql), query.values);
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
    if (error instanceof DraftSaveError) return NextResponse.json({ status: 'error', message: error.message,...(Object.keys(error.fields).length?{fields:error.fields}:{}) }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ status: 'error', message: 'Chưa đọc được dữ liệu gửi lên. Giữ form đang nhập và thử lưu lại; nếu vẫn lỗi, báo người phụ trách kèm số hợp đồng.' }, { status: 400 });
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') return failureResponse('Mã bản nháp đã được sử dụng.', error);
    return failureResponse('Không lưu được bản nháp. Thông tin đang nhập vẫn được giữ trong form.', error);
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
    const tableKind=({customers:'customers','order/car-rental':'contracts','vehicle/vehicles':'vehicles','hr/staff':'staff',stores:'stores'} as const)[key];
    if (request.nextUrl.searchParams.get('table')==='1' && tableKind) {
      if(request.nextUrl.searchParams.get('all')==='1' && tableKind!=='contracts' && tableKind!=='customers'){
        return await readAll(listQueries[key]);
      }
      const client=await himotoPool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        // Bound abandoned/slow list queries so they cannot occupy the pool indefinitely.
        await client.query(request.nextUrl.searchParams.get('all')==='1'
          ? "SET LOCAL statement_timeout='60s'" : "SET LOCAL statement_timeout='20s'");
        const data=await readManagementTable(client,tableKind,request.nextUrl.searchParams);
        await client.query('COMMIT');
        return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'no-store'}});
      } catch(error) {
        await client.query('ROLLBACK');
        if(error&&typeof error==='object'&&'code' in error&&error.code==='57014')return NextResponse.json(
          {status:'error',message:'Dữ liệu đang phản hồi chậm. Vui lòng bấm Thử lại để tải danh sách.'},
          {status:503,headers:{'Cache-Control':'no-store','Retry-After':'5'}});
        throw error;
      }
      finally { client.release(); }
    }
    if (key === 'cashbook/vouchers') {
      const data = await listCashbook(request.nextUrl.searchParams);
      return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const accountTx = parseAccountPath(path, 'transactions');
    if (accountTx) return await listAccountTransactions(accountTx.kind, accountTx.id, request.nextUrl.searchParams);
    if (key === 'customers/search-by-id-card') {
      const idCard = normalizeId(request.nextUrl.searchParams.get('id_card') || '');
      if (!validCustomerLookup(idCard)) return NextResponse.json({ status: 'success', data: null }, { headers: { 'Cache-Control': 'no-store' } });
      // Exact identity lookup is shared across branches. Keep list/detail reads
      // and every mutation on the scoped pool.
      const result = await ownerDatabase.query(
        `${CUSTOMER_PROFILE_SQL}
         WHERE regexp_replace(COALESCE(c.id_card, ''), '\\s+', '', 'g') = $1 LIMIT 2`,
        [idCard],
      );
      if (result.rows.length > 1) return NextResponse.json({ status: 'error', message: 'Có nhiều hồ sơ trùng giấy tờ.' }, { status: 409 });
      return NextResponse.json({ status: 'success', data: result.rows[0] || null }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (key === 'customers/search') {
      const query = request.nextUrl.searchParams.get('query') ? normalizeCustomerLookup(request.nextUrl.searchParams.get('query') || '') : '';
      if (!validCustomerLookup(query)) return NextResponse.json({ status: 'success', data: [] }, { headers: { 'Cache-Control': 'no-store' } });
      const result = await ownerDatabase.query(CUSTOMER_SEARCH_SQL, [query]);
      return NextResponse.json({ status: 'success', data: result.rows }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const query = listQueries[key];
    if (!query) return NextResponse.json({ status: 'error' }, { status: 404 });
    if (key === 'hr/staff' && request.nextUrl.searchParams.has('store_id')) {
      const storeId = request.nextUrl.searchParams.get('store_id') || '';
      if (!/^\d+$/.test(storeId) || !Number.isSafeInteger(Number(storeId)) || Number(storeId) <= 0) {
        return NextResponse.json({ status: 'error', message: 'Mã cơ sở không hợp lệ.' }, { status: 400 });
      }
      // Contract composer loads representative staff by vehicle store across branches.
      const staffSql=hasPermission(dataAccess.getStore(),'hr.read')?query.sql:'SELECT p.id,p.full_name,p.position,p.status,p.store_id,p.user_id FROM himoto.staff_profiles p ORDER BY p.id DESC';
      const scopedSql=staffSql.replace('ORDER BY p.id DESC', 'WHERE p.store_id=$1 ORDER BY p.id DESC');
      const data=(await ownerDatabase.query(scopedSql,[Number(storeId)])).rows;
      return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'no-store' } });
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
    return failureResponse('Không tải được dữ liệu.', error);
  }
}

async function writeCustomer(request: NextRequest, id: number | null) {
  let data: ReturnType<typeof parseCustomerWrite>;
  try { data = parseCustomerWrite(await request.json(), id === null ? 'create' : 'update'); }
  catch (error) { return NextResponse.json({ status: 'error', message: error instanceof CustomerWriteError ? error.message : 'Thông tin khách hàng không hợp lệ.' }, { status: 400 }); }
  const client = await himotoPool.connect();
  try {
    await client.query('BEGIN');
    const row = id === null ? await insertCustomer(client, data) : await updateCustomer(client, id, data);
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data: row }, { status: id === null ? 201 : 200 });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error instanceof CustomerWriteError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    return failureResponse(id === null ? 'Không lưu được khách hàng.' : 'Không lưu được thay đổi khách hàng.', error);
  } finally { client.release(); }
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

  return writeCustomer(request, null);
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
  const statusAccount=parseAccountPath(patchPath,'status');
  if(statusAccount)return setAccountStatus(statusAccount.kind,statusAccount.id,request);
  const account = parseAccountPath(patchPath);
  if (account) return updateAccount(account.kind, account.id, request);
  const staffId = parseStaffPath(patchPath);
  if (staffId) return updateStaff(staffId, request);
  const id = await getCustomerId(params);
  if (!id) return NextResponse.json({ status: 'error', message: 'Mã khách hàng không hợp lệ.' }, { status: 400 });

  return writeCustomer(request, id);
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
    return failureResponse('Không xóa được hồ sơ khách hàng.', error);
  } finally {
    client.release();
  }
}

export const GET = withAccessRequest(GETHandler);
export const POST = withAccessRequest(POSTHandler);
export const PUT = withAccessRequest(PUTHandler);
export const PATCH = withAccessRequest(PATCHHandler);
export const DELETE = withAccessRequest(DELETEHandler);
