import 'server-only';
import type {SessionUser} from './management-session';
import {hasPermission} from '@/lib/management/permissions';
import {normalize} from '@/lib/management/table-utils';
import {withMobileData} from './mobile-context';
import {himotoPool} from './himoto-database';
import {MobileError} from './mobile-session';
import {readVehicleInventory} from './vehicle-inventory';
import {isFleetInventory,type MobileFleetInventory,type MobileFleetVehicle} from '../../../shared/mobile-fleet-inventory';

export async function readMobileFleetInventory(user:SessionUser,query:URLSearchParams):Promise<MobileFleetInventory>{
  if(!hasPermission(user,'vehicles.read'))throw new MobileError('Tài khoản không có quyền xem kho xe.',403,'FORBIDDEN');
  const keys=['search','store','availability','page'];
  if([...query].some(([key])=>!keys.includes(key)||query.getAll(key).length!==1))throw new MobileError('Bộ lọc kho xe không hợp lệ.');
  const search=(query.get('search')||'').trim(),store=query.get('store')||'',availability=query.get('availability')||'',page=query.get('page')||'1';
  if(search.length>100||store&&!/^[1-9]\d{0,14}$/.test(store)||!['','ready','blocked'].includes(availability)||!/^[1-9]\d{0,5}$/.test(page))throw new MobileError('Bộ lọc kho xe không hợp lệ.');
  return withMobileData(user,'fleet_read',async()=>{
    const inventory=await readVehicleInventory(himotoPool);
    // Keep the same source and availability decision as the web inventory.
    // Customer/rental snapshots from the web reader are not part of this DTO.
    const all:MobileFleetVehicle[]=inventory.map(row=>({id:Number(row.id),name:String(row.name||''),license:String(row.license||''),type:String(row.type||''),status:String(row.status||''),storeId:Number(row.store_id),storeName:String(row.store_name||''),fromStoreName:String(row.from_store_name||''),toStoreName:String(row.to_store_name||''),available:row.available===true}));
    const plate=search.toUpperCase().replace(/[^A-Z0-9]/g,''),needle=normalize(search);
    const found=all.filter(row=>(!store||String(row.storeId)===store)&&(!availability||(availability==='ready'?row.available:!row.available))&&(normalize([row.license,row.name,row.storeName,row.fromStoreName,row.toStoreName].join(' ')).includes(needle)||!!plate&&row.license.toUpperCase().replace(/[^A-Z0-9]/g,'').includes(plate)));
    const pages=Math.max(1,Math.ceil(found.length/25)),current=Math.min(Number(page),pages);
    const result={rows:found.slice((current-1)*25,current*25),total:found.length,scopeCount:all.length,page:current,pages,stores:[...new Map(all.map(row=>[row.storeId,{id:row.storeId,name:row.storeName||`Cơ sở #${row.storeId}`}])).values()].sort((a,b)=>a.name.localeCompare(b.name,'vi'))};
    if(!isFleetInventory(result))throw new MobileError('Dữ liệu kho xe chưa đầy đủ. Vui lòng tải lại.',503,'SERVICE_UNAVAILABLE');
    return result;
  });
}
