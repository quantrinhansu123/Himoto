import 'server-only';
import type { SessionUser } from './management-session';
import { hasPermission } from '@/lib/management/permissions';
import { himotoPool } from './himoto-database';
import { withMobileData } from './mobile-context';
import { MobileError } from './mobile-session';
import { readOperationsSummary } from './page-summaries';
import type { MobileOperations } from '../../../shared/mobile-operations';
export function readMobileOperations(user:SessionUser,params:URLSearchParams):Promise<MobileOperations>{if(!hasPermission(user,'contracts.read'))throw new MobileError('Không có quyền xem thao tác hợp đồng.',403,'FORBIDDEN');for(const[k]of params)if(k!=='store_id'||params.getAll(k).length!==1)throw new MobileError('Bộ lọc vận hành không hợp lệ.');const store=params.get('store_id');if(store&&!/^[1-9]\d{0,14}$/.test(store))throw new MobileError('Cơ sở vận hành không hợp lệ.');return withMobileData(user,'',async()=>{const c=await himotoPool.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const raw=await readOperationsSummary(c),names=(await c.query('SELECT id,store_name FROM himoto.stores ORDER BY store_name,id')).rows;const stores=raw.stores.filter(r=>!store||Number(r.store_id)===Number(store)).map(r=>({storeId:r.store_id==null?null:Number(r.store_id),storeName:String(names.find(s=>Number(s.id)===Number(r.store_id))?.store_name||'Chưa phân cơ sở'),active:Number(r.active),overdue:Number(r.overdue)}));await c.query('COMMIT');return{stores,active:stores.reduce((sum,s)=>sum+s.active,0),overdue:stores.reduce((sum,s)=>sum+s.overdue,0)};}catch(error){await c.query('ROLLBACK').catch(()=>{});throw error;}finally{c.release();}});}
