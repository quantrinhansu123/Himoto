import 'server-only';
import type {PoolClient} from 'pg';
import {blankOwnershipReport,type OwnershipReport,type OwnershipReportKey} from '@/lib/management/ownership-report';
import {vietnamDate} from '@/lib/management/duty-roster';
import {OWNERSHIP_ORDER_SQL} from './contract-telegram-routing';
import {depositReceiptSql} from './contract-deposits';
import {RENTAL_REVENUE_SQL} from './rental-revenue';
import {summarizeRentalRevenue,type RevenueReceipt} from '@/lib/management/rental-revenue';

type Database=Pick<PoolClient,'query'>;
export async function readOwnershipReport(db:Database,store:number,date:string):Promise<OwnershipReport>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>vietnamDate())throw Error('Ngày báo cáo không được sau hôm nay.');
  const report=blankOwnershipReport(),v=report.values,month=date.slice(0,7)+'-01';
  const number=(n:unknown)=>{if(n===null||n===undefined)return null;const value=Number(n);if(!Number.isSafeInteger(value)||Math.abs(value)>1e12)throw Error('Số liệu thuê sở hữu cần đối chiếu.');return value;};
  if(date===vietnamDate()){
    const active=(await db.query(`SELECT DISTINCT ON(d.vehicle_id) d.vehicle_id,
      COALESCE(o.draft_payload #>> '{management_composer,profile,ownership_term_months}',o.draft_payload #>> '{management_composer,draft,ownership_term_months}') AS term
      FROM himoto.orders o JOIN himoto.stores s ON s.id=o.store_id JOIN himoto.order_vehicle_details d ON d.order_id=o.id
      WHERE o.store_id=$1 AND o.deleted_at IS NULL AND ${OWNERSHIP_ORDER_SQL} AND d.deleted_at IS NULL AND d.completed_at IS NULL
        AND o.order_status IN('renting','overdue') ORDER BY d.vehicle_id,o.rent_at DESC NULLS LAST,o.id DESC`,[store])).rows;
    v.running=active.length;
    for(const term of ['24','18','12','6'])v[`term_${term}` as OwnershipReportKey]=active.filter(r=>r.term===term).length;
    v.term_other=active.filter(r=>r.term&&!['24','18','12','6'].includes(r.term)).length;
    v.term_unknown=active.filter(r=>!r.term).length;
    v.stock=number((await db.query('SELECT count(*)::int AS total FROM himoto.vehicles WHERE deleted_at IS NULL AND COALESCE(current_store_id,store_id)=$1 AND status<>\'sold\'',[store])).rows[0]?.total);
    v.bad_debt=number((await db.query(`SELECT count(*)::int AS total FROM himoto.orders o JOIN himoto.stores s ON s.id=o.store_id WHERE o.store_id=$1 AND o.deleted_at IS NULL AND ${OWNERSHIP_ORDER_SQL} AND o.order_status='bad_debt'`,[store])).rows[0]?.total);
    v.reserved=number((await db.query(`SELECT count(*)::int AS total FROM himoto.orders o JOIN himoto.stores s ON s.id=o.store_id WHERE o.store_id=$1 AND o.deleted_at IS NULL AND ${OWNERSHIP_ORDER_SQL} AND o.order_status='reserved'`,[store])).rows[0]?.total);
  }
  const counts=(await db.query(`SELECT count(*) FILTER(WHERE (COALESCE(o.rent_at,d.starts_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=$2::date)::int AS new_day,
    count(*) FILTER(WHERE (COALESCE(o.rent_at,d.starts_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $3::date AND $2::date)::int AS new_month
    FROM himoto.orders o JOIN himoto.stores s ON s.id=o.store_id
    LEFT JOIN LATERAL(SELECT min(rent_at) AS starts_at FROM himoto.order_vehicle_details d WHERE d.order_id=o.id AND d.deleted_at IS NULL) d ON true
    WHERE o.store_id=$1 AND o.deleted_at IS NULL AND ${OWNERSHIP_ORDER_SQL} AND o.order_status NOT IN('draft','pending','deposit_contract','cancelled')`,[store,date,month])).rows[0];
  for(const key of ['new_day','new_month'] as const)v[key]=number(counts?.[key]);
  const returns=(await db.query(`SELECT count(DISTINCT o.customer_id)::int AS total,count(*) FILTER(WHERE o.customer_id IS NULL)::int AS unknown FROM himoto.order_vehicle_details d
    JOIN himoto.orders o ON o.id=d.order_id JOIN himoto.stores s ON s.id=o.store_id
    WHERE o.store_id=$1 AND o.deleted_at IS NULL AND ${OWNERSHIP_ORDER_SQL} AND d.deleted_at IS NULL
      AND (d.completed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $3::date AND $2::date`,[store,date,month])).rows[0];
  v.returned_month=Number(returns?.unknown)>0?null:number(returns?.total);
  const ids=(await db.query(`SELECT DISTINCT t.order_id FROM himoto.transactions t JOIN himoto.orders o ON o.id=t.order_id JOIN himoto.stores s ON s.id=o.store_id
    WHERE t.store_id=$1 AND ${OWNERSHIP_ORDER_SQL} AND t.status='approved' AND t.created_at>=($2::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
      AND t.created_at<(($3::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`,[store,month,date])).rows.map(row=>String(row.order_id));
  const revenue=ids.length?summarizeRentalRevenue((await db.query(RENTAL_REVENUE_SQL,[month,date,store,ids])).rows as RevenueReceipt[]):summarizeRentalRevenue([]);
  v.rental_day=revenue.days.find(day=>day.key===date)?.revenue??0;v.revenue_month=revenue.total.revenue;
  const tx=(await db.query(`SELECT
    COALESCE(sum(t.value) FILTER(WHERE t.type IN('in','addon') AND (t.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=$2::date),0) AS income_day,
    COALESCE(sum(t.value) FILTER(WHERE t.type IN('in','addon') AND ${depositReceiptSql()} AND (t.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=$2::date),0) AS deposit_day,
    COALESCE(sum(t.value) FILTER(WHERE t.type='out' AND (t.name='order:deposit_refund' OR t.name LIKE 'order:complete:%') AND (t.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=$2::date),0) AS refund_day
    FROM himoto.transactions t JOIN himoto.orders o ON o.id=t.order_id JOIN himoto.stores s ON s.id=o.store_id
    WHERE t.store_id=$1 AND ${OWNERSHIP_ORDER_SQL} AND t.status='approved' AND t.created_at>=($3::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
      AND t.created_at<(($2::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`,[store,date,month])).rows[0];
  for(const key of ['income_day','deposit_day','refund_day'] as const)v[key]=number(tx?.[key]);
  const battery=(await db.query(`SELECT t.name,t.type,(t.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS day,sum(t.value) AS amount
    FROM himoto.transactions t LEFT JOIN himoto.orders o ON o.id=t.order_id
    WHERE t.store_id=$1 AND t.status='approved' AND (t.object_type='battery_contract' OR t.name LIKE 'battery:%' OR o.draft_payload #>> '{legacy_migration,sourceStoreId}'='30')
      AND t.created_at>=($3::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') AND t.created_at<(($2::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
    GROUP BY t.name,t.type,day`,[store,date,month])).rows;
  const sum=(names:string[],type:'in'|'out',daily:boolean)=>battery.filter(r=>(!daily||r.day===date)&&(type==='in'?['in','addon'].includes(r.type):r.type==='out')&&names.includes(r.name)).reduce((n,r)=>n+number(r.amount)!,0);
  v.battery_deposit_day=sum(['battery:deposit','battery:legacy:deposit','order:deposit','order:additional_deposit'], 'in',true);
  // Legacy battery anchors use the same names as vehicle contracts, including suffixed deposits.
  v.battery_deposit_day+=battery.filter(r=>r.day===date&&['in','addon'].includes(r.type)&&r.name.startsWith('order:deposit:')).reduce((n,r)=>n+number(r.amount)!,0);
  v.battery_refund_day=sum(['battery:deposit_refund','order:deposit_refund'],'out',true)+battery.filter(r=>r.day===date&&r.type==='out'&&r.name.startsWith('order:complete:')).reduce((n,r)=>n+number(r.amount)!,0);
  const rentNames=['battery:rental','battery:legacy:rental','battery:renewal','order:rental_fees','order:payment','order:renewal','addon'];
  v.battery_rental_day=sum(rentNames,'in',true)-sum(['battery:rental_refund','order:rental_refund'],'out',true);
  v.battery_income_day=battery.filter(r=>r.day===date&&['in','addon'].includes(r.type)).reduce((n,r)=>n+number(r.amount)!,0);
  // No sale workflow exists in the imported/new app. Sales and the combined
  // monthly total need the actual sales book; zero would imply false completeness.
  const balances=(await db.query(`SELECT b.owner_type,sum(COALESCE(b.opening_balance,0)+COALESCE(t.delta,0)) AS balance
    FROM himoto.banks b LEFT JOIN LATERAL(SELECT sum(CASE WHEN t.type='out' THEN -t.value ELSE t.value END) AS delta FROM himoto.transactions t
      WHERE t.bank_id=b.id AND t.status='approved' AND t.type IN('in','addon','out') AND t.created_at<(($2::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')) t ON true
    WHERE b.store_id=$1 AND (b.created_at IS NULL OR b.created_at<(($2::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')) GROUP BY b.owner_type`,[store,date])).rows;
  report.thu_balance=number(balances.find(r=>r.owner_type==='personal')?.balance);
  report.company_balance=number(balances.find(r=>r.owner_type==='company')?.balance);
  report.app={...v};report.read_at=new Date().toISOString();
  report.sources=[
    'Đếm xe đang thuê không trùng theo ID xe; kho là toàn bộ xe chưa bán tại cơ sở. Kỳ hạn chỉ lấy trường đã lưu, không suy từ ngày dự kiến trả.',
    date===vietnamDate()?'Tồn kho / trạng thái hợp đồng tại thời điểm đọc.':'Không có ảnh chụp tồn kho / trạng thái của ngày cũ: nhập theo kiểm kê, không lấy kho hiện tại.',
    'HĐMM theo ngày bắt đầu thuê; khách trả xe theo ngày trả thực tế trên dòng xe, đếm ID khách không trùng trong tháng. Nợ xấu đếm hợp đồng đã đánh dấu nợ xấu.',
    'Thu / chi chỉ gồm phiếu đã duyệt, ngày Việt Nam. Doanh thu tháng cộng từ đầu tháng đến ngày báo cáo. Lãi thuê là doanh thu thuê thuần (gia hạn + thuê + phạt trễ − hoàn trả sớm), chưa trừ chi phí vận hành.',
    'Bảo lưu đếm hợp đồng đang bảo lưu trên app ở ngày hiện tại. Khách mua xe / bán pin / bán sạc chưa có luồng dữ liệu nguồn; cần nhập sổ thực tế. Tổng doanh thu pin + sạc nhập theo sổ tháng.',
    'TK THU dùng tài khoản cá nhân được phân công PGD; TK CTY dùng tài khoản công ty được phân công. Số thực tế và sổ đối chiếu phải nhập độc lập.',
    ...(revenue.unclassified_count?[`${revenue.unclassified_count} phiếu xe chưa phân loại (${revenue.unclassified_amount.toLocaleString('vi-VN')} đồng) chưa cộng vào doanh thu thuê.`]:[]),
  ];
  return report;
}
