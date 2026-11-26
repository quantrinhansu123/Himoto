import 'server-only';
import type { NextRequest } from 'next/server';
import type { PoolClient } from 'pg';
import { formatDateTime } from '@/lib/formatters';
import { hasPermission } from '@/lib/management/permissions';
import { canWriteCrossStoreCollectionFollowup } from '@/lib/management/collection-report';
import {
  CONTACT_STATUSES, HANDLING_STATUSES, filterCollectionRows, parseCollectionFollowup,
} from '../../../shared/collection-report';
import { GPS_STATE_LABELS } from '../../../shared/gps';
import { VEHICLE_ORDER_SQL } from './contract-classification';
import { CollectionFollowupError, readCollectionFollowups, writeCollectionFollowup } from './collection-followups';
import { queueCollectionReport, readCollectionReport, readCollectionReportView } from './collection-report';
import { himotoPool } from './himoto-database';
import { dataAccess } from './access-context';
import type { SessionUser } from './management-session';
import { canMobileCrossStoreRead, withMobileData, withMobileReadData } from './mobile-context';
import { mobileContractId } from './mobile-contracts';
import { mobileFilteredWorkbook } from './mobile-filtered-workbook';
import { MobileError } from './mobile-session';
import { mobileBody } from './mobile-writes';

function transaction<T>(user: SessionUser, write: boolean, task: (db: PoolClient) => Promise<T>, followup = false) {
  if (!hasPermission(user, 'contracts.read') || write && !hasPermission(user, 'contracts.draft')) {
    throw new MobileError('Tài khoản chưa có quyền xử lý báo cáo nợ chậm.', 403, 'FORBIDDEN');
  }
  const scope = write ? withMobileData : withMobileReadData;
  const run = async () => {
    const client = await himotoPool.connect();
    try {
      await client.query(write ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL statement_timeout='25s'");
      await client.query("SET LOCAL lock_timeout='5s'");
      const data = await task(client);
      await client.query('COMMIT');
      return data;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error instanceof CollectionFollowupError) throw new MobileError(error.message, error.status, 'COLLECTION_CONFLICT');
      throw error;
    } finally { client.release(); }
  };
  if (followup && (write ? canWriteCrossStoreCollectionFollowup(user) : user.scope_all_contracts_read === true)) {
    return dataAccess.run({ ...user, store_id: user.store_id ?? null, scope_all: true,
      operation: write ? 'collection_note' : '', cross_store_read: !write }, run);
  }
  return scope(user, '', run);
}

function readStore(user: SessionUser, params: URLSearchParams, fields: string[]) {
  if ([...params.keys()].some(key => !fields.includes(key) || params.getAll(key).length !== 1)) throw new MobileError('Bộ lọc nợ chậm không hợp lệ.');
  const store = params.get('store') ?? (canMobileCrossStoreRead(user) ? 'all' : String(user.store_id ?? ''));
  if (store !== 'all' && !/^[1-9]\d{0,14}$/.test(store)) throw new MobileError('Chọn PGD hợp lệ.');
  if (!canMobileCrossStoreRead(user) && user.store_id !== Number(store)) throw new MobileError('PGD nằm ngoài phạm vi được phân công.', 403, 'FORBIDDEN');
  return store;
}

export function readMobileCollectionReport(user: SessionUser, params: URLSearchParams) {
  const store = readStore(user, params, ['store']);
  return transaction(user, false, db => readCollectionReportView(db, store));
}

export function exportMobileCollectionReport(user: SessionUser, params: URLSearchParams) {
  const store = readStore(user, params, ['store', 'search', 'handling']);
  const search = params.get('search') ?? '', handling = params.get('handling') ?? '';
  if (search.length > 300 || handling && !Object.hasOwn(HANDLING_STATUSES, handling)) throw new MobileError('Bộ lọc nợ chậm không hợp lệ.');
  return transaction(user, false, async db => {
    const data = await readCollectionReport(db, store);
    const rows = filterCollectionRows(data.rows, search, handling);
    return mobileFilteredWorkbook('himoto-no-cham',
      ['Mã HĐ','Khách hàng','Điện thoại','Cơ sở','Xe','Hạn trả','Số ngày quá hạn','Nợ đến hạn','Phí trễ tạm tính','GPS','Liên hệ','Tình trạng khách','Xử lý','Ghi chú'],
      rows.map(row => [
        row.code,row.customer,row.phone,row.store_name,row.vehicle,formatDateTime(row.due_at),row.days,row.amount,row.late_fee,
        row.gps.map(state => GPS_STATE_LABELS[state] || state).join(', '),CONTACT_STATUSES[row.followup.contact_status],
        row.followup.customer_condition || row.customer_status,HANDLING_STATUSES[row.followup.handling_status],row.followup.notes,
      ]));
  });
}

export function readMobileCollectionFollowup(user: SessionUser, rawId: string) {
  const id = mobileContractId(rawId);
  return transaction(user, false, async db => {
    const row = (await db.query(`SELECT id,store_id,COALESCE(NULLIF(contract_number,''),draft_reference,'#'||id::text) AS code
      FROM himoto.orders o WHERE id=$1 AND deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}`, [id])).rows[0];
    const snapshot = row && (await readCollectionFollowups(db, [id]))[0];
    if (!snapshot) throw new MobileError('Không tìm thấy hợp đồng trong phạm vi.', 404, 'NOT_FOUND');
    const canUpdateStatus = hasPermission(user, 'contracts.draft') && (user.scope_all === true || user.store_id === Number(row.store_id));
    return { ...snapshot, code: String(row.code), can_update_status: canUpdateStatus,
      can_write: canUpdateStatus || canWriteCrossStoreCollectionFollowup(user) };
  }, true);
}

export async function saveMobileCollectionFollowup(user: SessionUser, rawId: string, request: NextRequest) {
  const id = mobileContractId(rawId), body = await mobileBody(request, 16_384);
  let input;
  try { input = parseCollectionFollowup(body); }
  catch (error) { throw new MobileError((error as Error).message); }
  if (input.order_id !== id) throw new MobileError('Hợp đồng không khớp ghi chú đang sửa.');
  return transaction(user, true, db => writeCollectionFollowup(db, dataAccess.getStore()!, input), true);
}

export async function sendMobileCollectionReport(user: SessionUser, request: NextRequest) {
  const body = await mobileBody(request, 1024), id = Number(body.store_id), hash = body.hash;
  if (Object.keys(body).some(key => key !== 'store_id' && key !== 'hash') || !Number.isSafeInteger(body.store_id) || id < 1 ||
      typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw new MobileError('Chọn PGD và kiểm tra nội dung trước khi gửi.');
  if (user.scope_all !== true && user.store_id !== id) throw new MobileError('PGD nằm ngoài phạm vi được phân công.', 403, 'FORBIDDEN');
  return transaction(user, true, db => queueCollectionReport(db, id, hash));
}
