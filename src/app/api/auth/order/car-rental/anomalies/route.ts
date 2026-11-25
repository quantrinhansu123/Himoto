import {NextRequest,NextResponse} from 'next/server';
import {withAccessRequest} from '@/lib/server/access-request';
import {himotoPool} from '@/lib/server/himoto-database';
import {failureResponse} from '@/lib/server/public-failure';

export const GET = withAccessRequest(async (request:NextRequest) => {
  const query = request.nextUrl.searchParams;
  const date = query.get('date') || '';
  const page = Number(query.get('page') || 1);
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date) ||
      !Number.isSafeInteger(page) || page < 1 || page > 100000) {
    return NextResponse.json({message:'Ngày hoặc trang không hợp lệ.'},{status:400});
  }
  const employee = (query.get('employee') || '').trim().slice(0,100);
  const store = (query.get('store') || '').trim().slice(0,100);
  const contract = (query.get('contract') || '').trim().slice(0,100);
  try {
    const {rows} = await himotoPool.query(`
      SELECT a.transaction_id,a.contract_code,a.occurred_at,a.amount,a.expected_amount,t.status AS transaction_status,
        COALESCE(u.name,'#'||a.actor_id::text) AS employee,COALESCE(s.store_name,'#'||a.store_id::text) AS store
      FROM himoto.management_contract_anomalies a
      LEFT JOIN himoto.users u ON u.id=a.actor_id
      LEFT JOIN himoto.stores s ON s.id=a.store_id
      LEFT JOIN himoto.transactions t ON t.id=a.transaction_id
      WHERE ($1::date IS NULL OR a.occurred_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        AND a.occurred_at < (($1::date+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'))
        AND strpos(lower(COALESCE(u.name,'#'||a.actor_id::text)),lower($2))>0
        AND strpos(lower(COALESCE(s.store_name,'#'||a.store_id::text)),lower($3))>0
        AND strpos(lower(a.contract_code),lower($4))>0
      ORDER BY a.occurred_at DESC,a.transaction_id DESC LIMIT 51 OFFSET $5`,[date||null,employee,store,contract,(page-1)*50]);
    return NextResponse.json({status:'success',data:{rows:rows.slice(0,50),hasMore:rows.length>50}},{headers:{'Cache-Control':'private, no-store'}});
  } catch(error) {
    return failureResponse('Không tải được bất thường hợp đồng.',error);
  }
});
