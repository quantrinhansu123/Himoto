import 'server-only';
import type { PoolClient } from 'pg';
import { vietnamDate } from '@/lib/management/duty-roster';
import { emptyShiftSummary, type ShiftInput } from '@/lib/management/shift-reports';
import { SHIFT_AUTOFILL_SECTIONS, type ShiftAutofillSection, type ShiftAutofillResult } from '@/lib/management/shift-autofill';
import { VEHICLE_ORDER_SQL } from './contract-classification';
import { depositReceiptSql } from './contract-deposits';

type Database = Pick<PoolClient,'query'>;
export class ShiftAutofillError extends Error { constructor(message: string, public status=400) { super(message); } }
export function parseShiftAutofill(params: URLSearchParams) {
  const store=params.get('store_id')||'', date=params.get('date')||'', section=params.get('section')||'';
  if (!/^[1-9]\d*$/.test(store) || !Number.isSafeInteger(Number(store))) throw new ShiftAutofillError('Chọn PGD ở tab Thông tin trước khi tự điền.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date || date>vietnamDate()) throw new ShiftAutofillError('Chọn ngày báo cáo hợp lệ, không sau hôm nay.');
  if (!SHIFT_AUTOFILL_SECTIONS.includes(section as ShiftAutofillSection)) throw new ShiftAutofillError('Tab báo cáo không hợp lệ.');
  return {store_id:Number(store),date,section:section as ShiftAutofillSection};
}
export async function readShiftAutofill(db: Database, input: ReturnType<typeof parseShiftAutofill>): Promise<ShiftAutofillResult> {
  const {store_id,date,section}=input;
  const start=`${date}T00:00:00+07:00`, end=new Date(Date.parse(start)+86400000).toISOString();
  const cutoff=new Date(Math.min(Date.parse(end),Date.now())).toISOString();
  const values: Partial<ShiftInput>={},notices:string[]=[],sources:string[]=[];
  if (!(await db.query('SELECT id FROM himoto.stores WHERE id=$1::bigint',[store_id])).rowCount) throw new ShiftAutofillError('PGD không tồn tại hoặc nằm ngoài phạm vi truy cập.',404);
  if (section==='information') {
    const rows=(await db.query(`SELECT DISTINCT staff_name FROM himoto.store_duty_schedules
      WHERE store_id=$1::bigint AND deleted_at IS NULL AND (
        starts_at<$3::timestamptz AND ends_at>$2::timestamptz OR starts_at IS NULL AND duty_date=$4::date)
      ORDER BY staff_name`,[store_id,start,end,date])).rows;
    const names=rows.map(row=>String(row.staff_name||'').trim()).filter(Boolean);
    if(names.length) values.staff=names.join(', ');
    else notices.push('Chưa có lịch trực ngày này; giữ nguyên nhân sự đã nhập.');
    sources.push('Lịch trực của PGD trong ngày báo cáo.');
  }
  if (section==='inventory') {
    const row=(await db.query(`WITH active_rentals AS (
      SELECT DISTINCT ON (d.vehicle_id) d.vehicle_id,d.type,
        COALESCE(NULLIF(o.draft_payload #>> '{management_composer,rental_type}',''),NULLIF(o.order_type,''),'') AS rental_type
      FROM himoto.orders o JOIN himoto.order_vehicle_details d ON d.order_id=o.id
      WHERE o.store_id=$1::bigint AND o.deleted_at IS NULL AND d.deleted_at IS NULL
        AND ${VEHICLE_ORDER_SQL} AND o.order_status IN ('renting','overdue','wait_payment','bad_debt')
        AND d.completed_at IS NULL AND COALESCE(d.rent_at,o.rent_at,'-infinity'::timestamptz)<=now()
      ORDER BY d.vehicle_id,d.rent_at DESC NULLS LAST,d.id DESC
    ), classified AS (
      SELECT vehicle_id,CASE
        WHEN rental_type='daily' THEN 'daily'
        WHEN rental_type ~ '^monthly(_[0-9]+)?$' THEN 'monthly'
        WHEN rental_type IN ('ownership','ownership_cd') THEN 'other'
        WHEN type='day' THEN 'daily' WHEN type='month' THEN 'monthly' ELSE 'other' END AS category
      FROM active_rentals
    ) SELECT
      (SELECT count(*)::int FROM himoto.vehicles WHERE COALESCE(current_store_id,store_id)=$1::bigint AND status='ready') AS vehicles,
      count(DISTINCT vehicle_id) FILTER (WHERE category='daily')::int AS daily_vehicles,
      count(DISTINCT vehicle_id) FILTER (WHERE category='monthly')::int AS monthly_vehicles
      FROM classified`,[store_id])).rows[0];
    for(const key of ['vehicles','daily_vehicles','monthly_vehicles'] as const) {
      const count=Number(row?.[key]);
      if(!Number.isSafeInteger(count)||count<0)throw new ShiftAutofillError('Chưa xác định được số xe từ DB. Vui lòng thử lại.',503);
      values[key]=count;
    }
    sources.push('Theo cơ sở ở tab Thông tin: xe thuê ngày/tháng từ các hợp đồng đang thuê, xe lưu kho từ danh sách xe trạng thái Lưu kho.');
    notices.push('Số liệu hiện tại tại thời điểm tự điền. Tổng kết xe cuối ngày = xe thuê ngày + xe thuê tháng + xe lưu kho.');
  }
  if (section==='batteries') {
    const rented=(await db.query(`SELECT count(*)::int AS rented_batteries FROM himoto.battery_contracts
      WHERE store_id=$1::bigint AND deleted_at IS NULL AND status='renting' AND starts_at<=now()`,[store_id])).rows[0];
    values.rented_batteries=Number(rented.rented_batteries);
    sources.push('Pin đã cho thuê: số hợp đồng thuê pin đang thuê tại cơ sở được chọn (mỗi hợp đồng tương ứng một pin).');
    const snapshot=(await db.query(`SELECT payload FROM himoto.management_shift_reports
      WHERE store_id=$1::bigint AND report_date=$2::date AND ($3::boolean OR status='submitted')
      ORDER BY id DESC LIMIT 1`,[store_id,date,date===vietnamDate()])).rows[0];
    if(snapshot) for(const key of ['batteries','charged'] as const) {
      if(Number.isSafeInteger(snapshot.payload[key])) values[key]=snapshot.payload[key];
    }
    if(snapshot) sources.push('Số pin/pin đầy từ báo cáo kiểm kê đã lưu đúng PGD/ngày.');
    else notices.push('Chưa có số kiểm kê pin lưu trong DB cho ngày này; giữ số pin đã nhập, kiểm kê pin/pin đầy thực tế.');
  }
  if(section==='transfers') {
    const transfers=(await db.query(`SELECT count(*)::int AS total FROM himoto.vehicle_location_events
      WHERE from_store_id=$1::bigint AND event_type IN ('manual_transfer','transfer_dispatch')
      AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')>=$2::timestamptz AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')<$3::timestamptz
      AND COALESCE(audit_snapshot #>> '{reconciliation,superseded}','false')<>'true'`,[store_id,start,end])).rows[0];
    values.transfers=Number(transfers.total);
    sources.push('Lượt xe điều chuyển đi từ cơ sở trong ngày báo cáo.');
  }
  if(section==='summary') {
    const contracts=(await db.query(`SELECT count(*)::int AS contracts_total,
      count(*) FILTER (WHERE o.order_status='completed')::int AS contracts_completed,
      count(*) FILTER (WHERE o.order_status IN ('renting','overdue'))::int AS contracts_renting,
      count(*) FILTER (WHERE o.order_status='overdue' OR o.order_status='renting' AND COALESCE(o.return_at,ov.ends_at)<$4::timestamptz)::int AS contracts_overdue
      FROM himoto.orders o LEFT JOIN LATERAL (SELECT min(d.rent_at) AS starts_at,max(d.return_at) AS ends_at
        FROM himoto.order_vehicle_details d WHERE d.order_id=o.id AND d.deleted_at IS NULL) ov ON true
      WHERE o.store_id=$1::bigint AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL} AND o.order_status NOT IN ('draft','cancelled')
      AND COALESCE(o.rent_at,ov.starts_at)>=$2::timestamptz AND COALESCE(o.rent_at,ov.starts_at)<$3::timestamptz`,[store_id,start,end,cutoff])).rows[0];
    const tx=(await db.query(`SELECT
      COALESCE(sum(t.value) FILTER (WHERE t.type IN ('in','addon')),0) AS income_total,
      COALESCE(sum(t.value) FILTER (WHERE t.type='out'),0) AS expense_total,
      COALESCE(sum(t.value) FILTER (WHERE t.type IN ('in','addon') AND (${depositReceiptSql()} OR t.name='battery:deposit')),0) AS income_deposit,
      COALESCE(sum(t.value) FILTER (WHERE t.type IN ('in','addon') AND (t.name LIKE 'order:renewal%' OR t.name='battery:renewal' OR EXISTS(
        SELECT 1 FROM himoto.management_contract_payments p WHERE p.transaction_id=t.id AND p.renewal_payload IS NOT NULL))),0) AS income_renewal,
      COALESCE(sum(t.value) FILTER (WHERE t.type IN ('in','addon') AND t.name IN ('order:rental_fees','order:payment','battery:rental')
        AND NOT EXISTS(SELECT 1 FROM himoto.management_contract_payments p WHERE p.transaction_id=t.id AND p.renewal_payload IS NOT NULL)),0) AS income_rental,
      COALESCE(sum(t.value) FILTER (WHERE t.type='out' AND (t.name='order:deposit_refund' OR t.name LIKE 'order:complete:%' OR t.name='battery:deposit_refund')),0) AS deposit_refund,
      COALESCE(sum(t.value) FILTER (WHERE t.type='out' AND t.name='order:rental_refund'),0) AS early_refund,
      COALESCE(sum(t.value) FILTER (WHERE t.type IN ('in','addon') AND t.name='order:return_late'),0) AS late_penalty
      FROM himoto.transactions t WHERE t.store_id=$1::bigint AND t.status='approved' AND t.created_at>=$2::timestamptz AND t.created_at<$3::timestamptz`,[store_id,start,end])).rows[0];
    const summary=emptyShiftSummary();
    for(const key of Object.keys(summary) as (keyof typeof summary)[]) {
      const value=Number(({...contracts,...tx})[key]);
      if(!Number.isSafeInteger(value)||value<0) throw new ShiftAutofillError('DB có số liệu thu chi chưa hợp lệ; kiểm tra sổ quỹ trước khi tự điền.',409);
      summary[key]=value;
    }
    values.summary=summary;
    sources.push('Hợp đồng xe bắt đầu thuê trong ngày (trạng thái hiện tại); phiếu thu/chi đã duyệt trong ngày, theo giờ Việt Nam.');
    notices.push('Cọc phải trả và phạt muộn lấy theo phiếu hoàn cọc/thu phạt đã duyệt, chưa gồm khoản chưa thực chi/thu. Tổng thu/chi có thể gồm các khoản ngoài tiền thuê.');
  }
  if(section==='accounts') {
    const rows=(await db.query(`WITH accounts AS (
      SELECT 'cash'::text AS kind,id,COALESCE(opening_balance,0) AS opening FROM himoto.cash WHERE store_id=$1::bigint AND lower(status)='active'
      UNION ALL SELECT CASE WHEN owner_type='company' THEN 'company' ELSE 'personal' END,id,COALESCE(opening_balance,0)
        FROM himoto.banks WHERE store_id=$1::bigint AND lower(status)='active'
    ), movements AS (
      SELECT CASE WHEN cash_id IS NOT NULL THEN 'cash' ELSE 'bank' END AS kind,COALESCE(cash_id,bank_id) AS account_id,
        sum(CASE WHEN type IN ('in','addon') THEN value WHEN type='out' THEN -value ELSE 0 END) AS delta
      FROM himoto.transactions WHERE store_id=$1::bigint AND status='approved' AND created_at<$2::timestamptz
        AND (cash_id IS NOT NULL OR bank_id IS NOT NULL) GROUP BY 1,2
    ) SELECT a.kind,count(*)::int AS count,sum(a.opening+COALESCE(t.delta,0)) AS balance FROM accounts a
      LEFT JOIN movements t ON t.account_id=a.id AND t.kind=CASE WHEN a.kind='cash' THEN 'cash' ELSE 'bank' END GROUP BY a.kind`,[store_id,cutoff])).rows;
    for(const key of ['cash','personal','company'] as const) {
      const row=rows.find(row=>row.kind===key);
      if(!row) { notices.push(`Chưa có tài khoản ${key==='cash'?'tiền mặt':key==='personal'?'cá nhân':'Công ty'} đang hoạt động gắn với PGD; giữ nguyên ô đã nhập.`);continue; }
      const amount=Number(row.balance);
      if(Number.isSafeInteger(amount)&&amount>=0&&amount<=1e12) values[key]=amount;
      else notices.push(`Số dư ${key} âm hoặc vượt giới hạn biểu mẫu; giữ nguyên ô đã nhập để đối chiếu.`);
    }
    sources.push('Số dư đầu kỳ + thu − chi đã duyệt đến thời điểm báo cáo của các két/tài khoản đang hoạt động gắn với PGD.');
    notices.push('Đây là số dư sổ quỹ, cần đối chiếu tiền mặt thực đếm và số dư ngân hàng. Không cộng tài khoản Công ty dùng chung chưa phân công PGD.');
  }
  if(section==='safety') {
    const row=(await db.query(`SELECT payload FROM himoto.management_shift_reports WHERE store_id=$1::bigint AND report_date<=$2::date
      AND status='submitted' AND COALESCE(payload->>'electrical_devices','')<>'' ORDER BY report_date DESC,id DESC LIMIT 1`,[store_id,date])).rows[0];
    if(row) values.electrical_devices=String(row.payload.electrical_devices);
    else notices.push('Chưa có danh sách thiết bị điện trong báo cáo đã chốt của PGD; nhập danh sách thực tế.');
    sources.push('Danh sách thiết bị từ báo cáo đã chốt gần nhất của PGD, không sau ngày đang chọn.');
    notices.push('Chỉ điền danh sách thiết bị để tham khảo; nhân sự tự xác nhận tắt điện, ghi bất thường và đính kèm ảnh khóa cửa.');
  }
  return {...input,values,notices,sources,read_at:new Date().toISOString()};
}
