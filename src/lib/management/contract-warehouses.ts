import type { ManagementRow } from './types';

export function contractWarehouses(vehicles:Record<string,unknown>[]) {
  const active=vehicles.filter(vehicle=>!vehicle.completed_at);
  const relevant=active.length?active:vehicles;
  const ids=[...new Set(relevant.map(vehicle=>Number(vehicle.warehouse_store_id??vehicle.stock_store_id)).filter(id=>Number.isSafeInteger(id)&&id>0))];
  const names=[...new Set(relevant.map(vehicle=>String(vehicle.warehouse_store_name??vehicle.stock_store_name??'').trim()).filter(Boolean))];
  return {ids,names};
}
export function contractOwnerStores(vehicles:Record<string,unknown>[]) {
  const active=vehicles.filter(vehicle=>!vehicle.completed_at);
  const relevant=active.length?active:vehicles;
  const ids=[...new Set(relevant.map(vehicle=>Number(vehicle.owner_store_id??vehicle.store_id)).filter(id=>Number.isSafeInteger(id)&&id>0))];
  const names=[...new Set(relevant.map(vehicle=>String(vehicle.owner_store_name||'').trim()).filter(Boolean))];
  return {ids,names};
}
export function contractMatchesWarehouse(row:ManagementRow,store:string) {
  if(store==='all'||!store)return true;
  try {
    if(row.warehouse_store_ids_json)return (JSON.parse(String(row.warehouse_store_ids_json)) as number[]).includes(Number(store));
    return contractWarehouses(JSON.parse(String(row.vehicles_json||'[]'))).ids.includes(Number(store));
  }catch{return false;}
}
