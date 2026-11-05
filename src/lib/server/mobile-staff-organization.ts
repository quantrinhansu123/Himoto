import 'server-only';
import type {SessionUser} from './management-session';
import {hasPermission} from '@/lib/management/permissions';
import {withMobileData} from './mobile-context';
import {himotoPool} from './himoto-database';
import {MobileError} from './mobile-session';
import {buildStaffOrganization} from '../../../shared/staff-organization';
import {normalizeStaffPosition} from '../../../shared/staff-positions';
import type {MobileStaffOrganization,MobileOrganizationPerson} from '../../../shared/mobile-staff-organization';
export async function readMobileStaffOrganization(user:SessionUser,params:URLSearchParams):Promise<MobileStaffOrganization>{
  if(!hasPermission(user,'hr.read'))throw new MobileError('Không có quyền xem sơ đồ nhân sự.',403,'FORBIDDEN');
  const store=params.get('store')||'all',search=params.get('search')||'',departed=params.get('departed')||'0';
  if([...params.keys()].some(k=>!['store','search','departed'].includes(k)||params.getAll(k).length!==1)||store!=='all'&&(!/^[1-9]\d{0,14}$/.test(store)||!Number.isSafeInteger(Number(store)))||search.length>120||!['0','1'].includes(departed))throw new MobileError('Bộ lọc sơ đồ nhân sự chưa hợp lệ.');
  return withMobileData(user,'',async()=>{const db=await himotoPool.connect();try{
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
    const stores=(await db.query('SELECT id,store_name FROM himoto.stores ORDER BY id')).rows.map(r=>({id:Number(r.id),name:String(r.store_name||'')}));
    // Same full staff source as the web chart, on the scoped pool; TLS filtering never grants access to hidden rows.
    const rows=(await db.query(`SELECT p.id,p.staff_code,p.full_name,p.phone,p.email,p.position,p.store_id,s.store_name,p.status
      FROM himoto.staff_profiles p LEFT JOIN himoto.stores s ON s.id=p.store_id ORDER BY p.id DESC`)).rows.map(r=>({id:Number(r.id),name:String(r.full_name||''),code:String(r.staff_code||''),phone:String(r.phone||''),email:String(r.email||''),position:normalizeStaffPosition(r.position),store_id:r.store_id==null?null:Number(r.store_id),store_name:String(r.store_name||''),status:String(r.status||'')}));
    if(store!=='all'&&!stores.some(s=>String(s.id)===store))throw new MobileError('Cơ sở không tồn tại hoặc ngoài phạm vi.',404,'NOT_FOUND');
    const chart=buildStaffOrganization(rows,stores,store,departed==='1',search);
    const person=(p:typeof rows[number]):MobileOrganizationPerson=>({id:p.id,name:p.name,code:p.code,phone:p.phone,email:p.email,position:p.position,storeId:p.store_id,storeName:p.store_name,status:p.status});
    const result:MobileStaffOrganization={stores,total:chart.shown.length,working:chart.working,storeCount:chart.stores.length,sections:[
      ...chart.departments.map(d=>({key:`department:${d.role}`,title:d.label,kind:'department' as const,storeId:null,people:d.people.map(person)})),
      ...(chart.unassigned.length?[{key:'unassigned',title:'Chưa phân bổ cơ sở',kind:'unassigned' as const,storeId:null,people:chart.unassigned.map(person)}]:[]),
      ...chart.stores.map(s=>({key:`store:${s.id}`,title:s.name,kind:'store' as const,storeId:s.id,people:s.people.map(person)}))]};
    await db.query('COMMIT');return result;
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}});
}
