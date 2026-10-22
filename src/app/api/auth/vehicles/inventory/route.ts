import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime='nodejs';
export const GET=withAccessRequest(async(_request:NextRequest)=>{
  try {
    const inventory=await himotoPool.query('SELECT * FROM himoto.vehicle_inventory() WHERE store_id>0');
    const ids=inventory.rows.map((row:{id:number|string})=>Number(row.id)).filter(id=>Number.isSafeInteger(id)&&id>0);
    const blockers=ids.length
      ? await himotoPool.query('SELECT * FROM himoto.vehicle_rental_blockers($1::bigint[])',[ids])
      : { rows: [] as { vehicle_id: number }[] };
    const byVehicle=new Map<number,{order_id:number;code:string;status:string;store_name:string;rent_at:string|null;return_at:string|null}[]>();
    for(const row of blockers.rows){
      const vehicleId=Number(row.vehicle_id);
      const list=byVehicle.get(vehicleId)||[];
      list.push({
        order_id:Number(row.order_id),code:String(row.code||''),status:String(row.status||''),store_name:String(row.store_name||''),
        rent_at:row.rent_at?String(row.rent_at):null,return_at:row.return_at?String(row.return_at):null,
      });
      byVehicle.set(vehicleId,list);
    }
    const data=inventory.rows.map(row=>({
      ...row,
      rental_blockers:byVehicle.get(Number(row.id))||[],
    }));
    return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){
    return failureResponse('Không tải được kho xe chung.',error);
  }
});
