import 'server-only';
import type {SessionUser} from './management-session';
import {hasPermission} from '@/lib/management/permissions';
import {normalize} from '@/lib/management/table-utils';
import {withMobileData} from './mobile-context';
import {himotoPool} from './himoto-database';
import {MobileError} from './mobile-session';
import {isFleetInventory,type MobileFleetInventory} from '../../../shared/mobile-fleet-inventory';

export async function readMobileFleetInventory(user:SessionUser,query:URLSearchParams):Promise<MobileFleetInventory>{
  if(!hasPermission(user,'vehicles.read'))throw new MobileError('Tài khoản không có quyền xem kho xe.',403,'FORBIDDEN');
  const keys=['search','store','availability','page'];
  if([...query].some(([key])=>!keys.includes(key)||query.getAll(key).length!==1))throw new MobileError('Bộ lọc kho xe không hợp lệ.');
  const search=(query.get('search')||'').trim(),store=query.get('store')||'',availability=query.get('availability')||'',page=query.get('page')||'1';
  if(search.length>100||store&&!/^[1-9]\d{0,14}$/.test(store)||!['','ready','blocked'].includes(availability)||!/^[1-9]\d{0,5}$/.test(page))throw new MobileError('Bộ lọc kho xe không hợp lệ.');
  return withMobileData(user,'fleet_read',async()=>{
    const plate=search.toUpperCase().replace(/[^A-Z0-9]/g,''),needle=normalize(search);
    // The authoritative inventory function already computes availability. Do not
    // fetch rental blockers, draft payloads or all vehicles into application RAM.
    // One statement keeps rows/counts/store choices on the same DB snapshot.
    const folded=`lower(translate(regexp_replace(normalize(concat_ws(' ',license,name,store_name,from_store_name,to_store_name),NFD) COLLATE "C",'[\u0300-\u036f]','','g'),'đĐ','dD'))`;
    const data=await himotoPool.query(`WITH inventory AS MATERIALIZED (
      SELECT * FROM himoto.vehicle_inventory() WHERE store_id>0
    ), filtered AS MATERIALIZED (
      SELECT * FROM inventory WHERE ($1::bigint IS NULL OR store_id=$1)
      AND ($2::text='' OR available=($2='ready'))
      AND (strpos(${folded},$3)>0 OR ($4::text<>'' AND strpos(regexp_replace(upper(license),'[^A-Z0-9]','','g'),$4)>0))
    ), counts AS (SELECT count(*)::int AS total FROM filtered), bounds AS (
      SELECT total,greatest(1,ceil(total/25.0)::int) AS pages,least($5::int,greatest(1,ceil(total/25.0)::int)) AS page FROM counts
    ) SELECT bounds.*,(SELECT count(*)::int FROM inventory) AS "scopeCount",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',store_id,'name',coalesce(nullif(store_name,''),'Cơ sở #'||store_id)) ORDER BY store_name,store_id)
        FROM (SELECT DISTINCT ON(store_id) store_id,store_name FROM inventory ORDER BY store_id,store_name) stores),'[]'::jsonb) AS stores,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',coalesce(name,''),'license',coalesce(license,''),'type',coalesce(type,''),
        'status',coalesce(status,''),'storeId',store_id,'storeName',coalesce(store_name,''),'fromStoreName',coalesce(from_store_name,''),
        'toStoreName',coalesce(to_store_name,''),'available',available) ORDER BY store_name,license,id)
        FROM (SELECT * FROM filtered ORDER BY store_name,license,id LIMIT 25 OFFSET (SELECT (page-1)*25 FROM bounds)) paged),'[]'::jsonb) AS rows
      FROM bounds`,[store?Number(store):null,availability,needle,plate,Number(page)]);
    const result=data.rows[0] as MobileFleetInventory;
    if(!isFleetInventory(result))throw new MobileError('Dữ liệu kho xe chưa đầy đủ. Vui lòng tải lại.',503,'SERVICE_UNAVAILABLE');
    return result;
  });
}
