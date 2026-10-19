import 'server-only';
import type { ContractEventType } from '@/lib/management/contract-telegram';
import { OWNERSHIP_TELEGRAM_DESTINATIONS } from '@/lib/management/telegram-destinations';
import { VEHICLE_ORDER_SQL } from './contract-classification';

// Keep classification consistent with the ownership contract list, including legacy imports.
export const OWNERSHIP_ORDER_SQL = `(${VEHICLE_ORDER_SQL} AND (s.kind='lease_to_own' OR COALESCE(NULLIF(o.order_type,''),o.draft_payload->'management_composer'->>'rental_type') IN ('ownership','ownership_cd')))`;
export const CONTRACT_TELEGRAM_ROUTE_SQL = `CASE
  WHEN n.event_type IN ('vehicle_transfer','vehicle_receive') AND n.event_key LIKE '%:store' THEN 'store'
  WHEN n.event_type IN ('vehicle_transfer','vehicle_receive') THEN 'ownership_new'
  WHEN ${OWNERSHIP_ORDER_SQL} AND n.event_type='renewal' THEN 'ownership_renewal'
  WHEN ${OWNERSHIP_ORDER_SQL} AND n.event_type IN ('rental','reservation','handover','return') THEN 'ownership_new'
  ELSE 'store' END`;
export function contractTelegramDestination(kind:ContractEventType,ownership:boolean,storeName:string) {
  const route=ownership&&(kind==='renewal'||['rental','reservation','handover','return'].includes(kind))?kind==='renewal'?'ownership_renewal':'ownership_new':null;
  return OWNERSHIP_TELEGRAM_DESTINATIONS.find(item=>item.route===route)?.label||`Nhóm cơ sở ${storeName||'của hợp đồng'}`;
}
export function vehicleTransferTelegramDestinations(fromKind:string|null,toKind:string|null,fromStoreId:number,toStoreId:number,fromName:string,toName:string,operationStoreId:number) {
  const ownershipLabel=OWNERSHIP_TELEGRAM_DESTINATIONS[0].label;
  const fromOwnership=fromKind==='lease_to_own',toOwnership=toKind==='lease_to_own';
  const branch= !fromOwnership ? {store_id:fromStoreId,name:fromName}
    : !toOwnership ? {store_id:toStoreId,name:toName}
    : null;
  return {
    labels:[...(branch?[`Nhóm cơ sở ${branch.name||'đối ứng'}`]:[]),ownershipLabel],
    targets:[
      {event_key_suffix:'ownership',store_id:operationStoreId},
      ...(branch?[{event_key_suffix:'store',store_id:branch.store_id}]:[]),
    ],
  };
}
