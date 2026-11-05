import 'server-only';
import type {PoolClient} from 'pg';
import type {SessionUser} from './management-session';
import {hasPermission} from '@/lib/management/permissions';
import {withNotificationSnapshot} from './mobile-notifications';
import {MobileError} from './mobile-session';
import {isMobileActivityPage,type MobileActivityPage} from '../../../shared/mobile-activity';

export function activityGrants(user:SessionUser) {
  const contracts=hasPermission(user,'contracts.read');
  return {contracts,finance:contracts&&(hasPermission(user,'finance.read')||hasPermission(user,'finance.write')),vehicles:hasPermission(user,'vehicles.read')};
}
type Database=Pick<PoolClient,'query'>;
export async function scopedActivity(db:Database,user:SessionUser,before:number|null,ids?:number[]):Promise<MobileActivityPage> {
  const grants=activityGrants(user);
  const result=await db.query(`SELECT e.id,e.kind,e.action,e.resource_id,e.created_at,
      CASE WHEN e.kind='transfer' THEN COALESCE(NULLIF(v.license,''),NULLIF(v.name,''),'Xe #'||e.resource_id)
        ELSE COALESCE(NULLIF(o.contract_number,''),NULLIF(o.draft_reference,''),'Hợp đồng #'||e.resource_id) END AS resource_label
    FROM himoto.management_mobile_activity_events e
    LEFT JOIN himoto.orders o ON e.kind<>'transfer' AND o.id=e.resource_id
    LEFT JOIN himoto.vehicles v ON e.kind='transfer' AND v.id=e.resource_id
    WHERE e.created_at >= now()-interval '7 days' AND ($1::bigint IS NULL OR e.id<$1)
      AND ($2::bigint[] IS NULL OR e.id=ANY($2))
      AND ((e.kind='payment' AND $3::boolean) OR (e.kind='transfer' AND $4::boolean)
        OR (e.kind IN ('contract_created','renewal','return') AND $5::boolean))
    ORDER BY e.id DESC LIMIT 21`,[before,ids??null,grants.finance,grants.vehicles,grants.contracts]);
  const rows=result.rows.slice(0,20).map(r=>({id:Number(r.id),kind:r.kind,action:r.action,resourceId:Number(r.resource_id),resourceLabel:String(r.resource_label).slice(0,400),createdAt:new Date(r.created_at).toISOString()}));
  const page={rows,nextBefore:result.rows.length>20?rows[rows.length-1].id:null};
  if(!isMobileActivityPage(page))throw new Error('Invalid activity page');
  return page;
}
export async function readMobileActivity(user:SessionUser,params:URLSearchParams):Promise<MobileActivityPage>{
  if([...params.keys()].some(k=>k!=='before'||params.getAll(k).length!==1))throw new MobileError('Bộ lọc sự kiện không hợp lệ.');
  const value=params.get('before');
  if(value!==null&&(!/^[1-9]\d{0,14}$/.test(value)||!Number.isSafeInteger(Number(value))))throw new MobileError('Trang sự kiện không hợp lệ.');
  return withNotificationSnapshot(user,db=>scopedActivity(db,user,value===null?null:Number(value)));
}
