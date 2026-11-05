import 'server-only';
import type {PoolClient} from 'pg';
import {readDraftVehicleRentals} from './draft-vehicle-rentals';

export async function readVehicleInventory(db:Pick<PoolClient,'query'>) {
  const inventory=await db.query('SELECT * FROM himoto.vehicle_inventory() WHERE store_id>0');
  const ids=inventory.rows.map(row=>Number(row.id)).filter(id=>Number.isSafeInteger(id)&&id>0);
  const blockers=ids.length?await db.query('SELECT * FROM himoto.vehicle_rental_blockers($1::bigint[])',[ids]):{rows:[]};
  const drafts=ids.length?await readDraftVehicleRentals(db,ids):[];
  const byVehicle=new Map<number,{order_id:number;code:string;status:string;store_name:string;rent_at:string|null;return_at:string|null}[]>();
  for(const row of blockers.rows){
    const id=Number(row.vehicle_id),list=byVehicle.get(id)||[];
    list.push({order_id:Number(row.order_id),code:String(row.code||''),status:String(row.status||''),store_name:String(row.store_name||''),rent_at:row.rent_at?String(row.rent_at):null,return_at:row.return_at?String(row.return_at):null});
    byVehicle.set(id,list);
  }
  const draftsByVehicle=new Map<number,typeof drafts>();
  for(const row of drafts){const list=draftsByVehicle.get(row.vehicle_id)||[];list.push(row);draftsByVehicle.set(row.vehicle_id,list);}
  return inventory.rows.map(row=>({...row,rental_blockers:byVehicle.get(Number(row.id))||[],draft_rentals:(draftsByVehicle.get(Number(row.id))||[]).map(item=>({order_id:item.order_id,code:item.code,status:item.status,customer:item.customer,store_name:item.store_name,rent_at:item.rent_at,return_at:item.return_at}))}));
}
