import 'server-only';
import type {PoolClient} from 'pg';
import {RENTAL_REVENUE_CTE} from './rental-revenue';
import {VEHICLE_ORDER_SQL} from './contract-classification';
import {contractVehicleReadSource} from './contract-vehicle-reads';
import {REVENUE_LEDGER_CATEGORIES,REVENUE_LEDGER_METHODS,type RevenueLedgerReport,type RevenueLedgerTotals,type RevenueLedgerRow,type RevenueLedgerMethod} from '@/lib/management/revenue-ledger';

type Database=Pick<PoolClient,'query'>;
export class RevenueLedgerError extends Error {constructor(message:string,public status=400){super(message);}}
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(`${s}T00:00Z`).toISOString().slice(0,10)===s;
export function parseRevenueLedger(params:URLSearchParams){
 const from=params.get('from')||'',to=params.get('to')||'',search=(params.get('search')||'').trim(),category=params.get('category')||'',method=params.get('method')||'';
 const integer=(key:string,defaultValue:number,max:number)=>{const raw=params.get(key)||String(defaultValue);if(!/^[1-9]\d*$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)>max)throw new RevenueLedgerError('Phân trang sổ giao dịch không hợp lệ.');return Number(raw);};
 if(params.has('store_id')&&!params.get('store_id'))throw new RevenueLedgerError('Cơ sở không hợp lệ.');
 const store=params.has('store_id')?integer('store_id',1,Number.MAX_SAFE_INTEGER):null;
 if(!validDate(from)||!validDate(to)||from>to||search.length>200||Array.from(search).some(c=>c.charCodeAt(0)<32)||category&&!Object.hasOwn(REVENUE_LEDGER_CATEGORIES,category)&&category!=='revenue'||method&&!Object.hasOwn(REVENUE_LEDGER_METHODS,method)||params.has('all')&&params.get('all')!=='1')throw new RevenueLedgerError('Kiểm tra ngày, cơ sở và bộ lọc sổ giao dịch.');
 return {from,to,store,search,category,method,page:integer('page',1,1000000),size:integer('size',20,100),all:params.get('all')==='1'};
}
const REVENUE_AMOUNT=`CASE WHEN category='rental' THEN GREATEST(regular_total-initial_fees,0)-GREATEST(regular_total-value-initial_fees,0) WHEN category='early' THEN -value WHEN category IN('renewal','late') THEN value ELSE 0 END`;
const categorySql=`CASE WHEN category<>'excluded' THEN category WHEN name='order:deposit_refund' OR name LIKE 'order:complete:%' THEN 'deposit_refund' WHEN name='order:return_repair' THEN 'repair' WHEN name IN('order:extra','order:outside') THEN 'extra' ELSE 'deposit' END`;
const methodSql=`CASE WHEN payment_method=3 THEN 'mixed' WHEN bank_owner_type='company' AND (bank_id IS NOT NULL OR payment_method=2) THEN 'company' WHEN bank_id IS NOT NULL OR payment_method=2 THEN CASE WHEN bank_owner_type='personal' THEN 'personal' ELSE 'unknown' END WHEN cash_id IS NOT NULL OR payment_method=1 THEN 'cash' ELSE 'unknown' END`;
const number=(value:unknown)=>{const n=Number(value);if(value==null||!Number.isSafeInteger(n))throw new RevenueLedgerError('Số tiền trong phiếu chưa hợp lệ; cần đối chiếu.',409);return n;};

export async function revenueLedger(db:Database,params:URLSearchParams):Promise<RevenueLedgerReport>{
 const input=parseRevenueLedger(params);
 const relevant=(await db.query(`SELECT DISTINCT t.order_id FROM himoto.transactions t JOIN himoto.orders o ON o.id=t.order_id
   WHERE t.status='approved' AND t.type IN('in','addon','out') AND ${VEHICLE_ORDER_SQL}
     AND t.created_at>=($1::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') AND t.created_at<(($2::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
     AND ($3::bigint IS NULL OR t.store_id=$3)`,[input.from,input.to,input.store])).rows.map(r=>String(r.order_id));
 const methods=Object.fromEntries(Object.keys(REVENUE_LEDGER_METHODS).map(key=>[key,{income:0,expense:0,revenue:0,count:0}])) as RevenueLedgerTotals['methods'];
 const empty:RevenueLedgerTotals={count:0,contracts:0,income_count:0,expense_count:0,revenue_count:0,income:0,expense:0,net:0,revenue:0,deposit:0,deposit_refund:0,methods};
 if(!relevant.length)return {rows:[],total:0,page:1,pages:1,page_size:input.size,totals:empty,export_all:input.all};
 const values:unknown[]=[input.from,input.to,input.store,relevant];
 const bind=(value:unknown)=>{values.push(value);return `$${values.length}`;};
 const where=[`l.created_at>=($1::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`,`($3::bigint IS NULL OR l.store_id=$3)`];
 if(input.category)where.push(input.category==='revenue'?`l.revenue_amount<>0`:`l.ledger_category=${bind(input.category)}`);
 if(input.method)where.push(`l.ledger_method=${bind(input.method)}`);
 const searchParameter=input.search?bind('%'+input.search.replace(/[\\%_]/g,'\\$&')+'%'):null;
 const searchSql=searchParameter?` AND (concat_ws(' ',o.contract_number,o.draft_reference,o.customer_name,c.name,l.id::text,l.order_id::text,l.note,st.full_name,l.staff_name,u.name) ILIKE ${searchParameter}
  OR EXISTS(SELECT 1 FROM himoto.order_vehicle_details d JOIN ${contractVehicleReadSource()} v ON v.id=d.vehicle_id WHERE d.order_id=l.order_id AND d.deleted_at IS NULL AND v.license ILIKE ${searchParameter}))`:'';
 const searchJoins=input.search?`LEFT JOIN himoto.customers c ON c.id=o.customer_id LEFT JOIN himoto.staff_profiles st ON st.id::text=l.staff_id LEFT JOIN himoto.users u ON u.id=l.user_id`:'';
 const limit=bind(input.all?10000:input.size),requestedPage=input.all?'1':bind(input.page);
 const aggregateMethods=Object.keys(REVENUE_LEDGER_METHODS).map(key=>`'${key}',jsonb_build_object('income',COALESCE(sum(value) FILTER(WHERE ledger_method='${key}' AND type<>'out'),0),'expense',COALESCE(sum(value) FILTER(WHERE ledger_method='${key}' AND type='out'),0),'revenue',COALESCE(sum(revenue_amount) FILTER(WHERE ledger_method='${key}'),0),'count',count(*) FILTER(WHERE ledger_method='${key}')::int)`).join(',');
 const result=(await db.query(`${RENTAL_REVENUE_CTE}, ledger AS (
   SELECT a.*,${REVENUE_AMOUNT} AS revenue_amount,${categorySql} AS ledger_category,${methodSql} AS ledger_method FROM allocated a
 ), matched AS MATERIALIZED (
   SELECT l.* FROM ledger l JOIN himoto.orders o ON o.id=l.order_id ${searchJoins} WHERE ${where.map(w=>'('+w+')').join(' AND ')}${searchSql}
 ), totals AS (
   SELECT count(*)::int AS count,count(DISTINCT order_id)::int AS contracts,count(*) FILTER(WHERE type<>'out')::int AS income_count,count(*) FILTER(WHERE type='out')::int AS expense_count,
     count(*) FILTER(WHERE revenue_amount<>0)::int AS revenue_count,COALESCE(sum(value) FILTER(WHERE type<>'out'),0) AS income,COALESCE(sum(value) FILTER(WHERE type='out'),0) AS expense,
     COALESCE(sum(revenue_amount),0) AS revenue,COALESCE(sum(value) FILTER(WHERE ledger_category='deposit'),0) AS deposit,COALESCE(sum(value) FILTER(WHERE ledger_category='deposit_refund'),0) AS deposit_refund,
     jsonb_build_object(${aggregateMethods}) AS methods FROM matched
 ), page_rows AS (
   SELECT * FROM matched ORDER BY created_at DESC,id DESC LIMIT ${limit}
     OFFSET (SELECT ${input.all?'0':`(LEAST(${requestedPage},GREATEST(1,ceil(count::numeric/${limit})))::int-1)*${limit}`} FROM totals)
 ) SELECT (SELECT to_jsonb(totals) FROM totals) AS totals,COALESCE((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object(
     'code',COALESCE(NULLIF(o.contract_number,''),o.draft_reference,'#'||o.id::text),'customer',COALESCE(NULLIF(o.customer_name,''),c.name,''),
     'store_name',COALESCE(s.store_name,''),'person',COALESCE(NULLIF(p.staff_name,''),st.full_name,''),'actor',COALESCE(u.name,''),
     'vehicles',COALESCE((SELECT string_agg(DISTINCT v.license,', ' ORDER BY v.license) FROM himoto.order_vehicle_details d JOIN ${contractVehicleReadSource()} v ON v.id=d.vehicle_id WHERE d.order_id=o.id AND d.deleted_at IS NULL),''),
     'start_at',o.rent_at,'end_at',o.return_at) ORDER BY p.created_at DESC,p.id DESC)
     FROM page_rows p JOIN himoto.orders o ON o.id=p.order_id LEFT JOIN himoto.customers c ON c.id=o.customer_id LEFT JOIN himoto.stores s ON s.id=p.store_id
     LEFT JOIN himoto.staff_profiles st ON st.id::text=p.staff_id LEFT JOIN himoto.users u ON u.id=p.user_id),'[]'::jsonb) AS rows`,values)).rows[0];
 if(!result?.totals||!Array.isArray(result.rows))throw new RevenueLedgerError('Không đọc được tổng sổ giao dịch.',409);
 const t=result.totals,count=number(t.count),pages=Math.max(1,Math.ceil(count/input.size));
 if(input.all&&count>10000)throw new RevenueLedgerError('Có hơn 10.000 phiếu. Chọn khoảng ngày hoặc cơ sở hẹp hơn để xuất đủ dữ liệu.',413);
 for(const key of Object.keys(methods) as RevenueLedgerMethod[])methods[key]={income:number(t.methods[key].income),expense:number(t.methods[key].expense),revenue:number(t.methods[key].revenue),count:number(t.methods[key].count)};
 const income=number(t.income),expense=number(t.expense);
 const totals:RevenueLedgerTotals={count,contracts:number(t.contracts),income_count:number(t.income_count),expense_count:number(t.expense_count),revenue_count:number(t.revenue_count),income,expense,net:income-expense,revenue:number(t.revenue),deposit:number(t.deposit),deposit_refund:number(t.deposit_refund),methods};
 const rows:RevenueLedgerRow[]=result.rows.map((r:Record<string,unknown>)=>({id:String(r.id),order_id:number(r.order_id),code:String(r.code),customer:String(r.customer),store_id:r.store_id==null?null:number(r.store_id),store_name:String(r.store_name),
   at:new Date(String(r.created_at)).toISOString(),day:new Date(new Date(String(r.created_at)).getTime()+7*3600000).toISOString().slice(0,10),category:r.ledger_category as RevenueLedgerRow['category'],method:r.ledger_method as RevenueLedgerRow['method'],type:r.type as RevenueLedgerRow['type'],amount:number(r.value),revenue:number(r.revenue_amount),staff_name:String(r.person),actor_name:String(r.actor),note:String(r.note||''),vehicles:String(r.vehicles),start_at:r.start_at==null?null:new Date(String(r.start_at)).toISOString(),end_at:r.end_at==null?null:new Date(String(r.end_at)).toISOString()}));
 return {rows,total:count,page:input.all?1:Math.min(input.page,pages),pages:input.all?1:pages,page_size:input.all?Math.max(1,count):input.size,totals,export_all:input.all};
}
