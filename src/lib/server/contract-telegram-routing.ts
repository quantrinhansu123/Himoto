import 'server-only';
import type { ContractEventType } from '@/lib/management/contract-telegram';
import { OWNERSHIP_TELEGRAM_DESTINATIONS } from '@/lib/management/telegram-destinations';

// Keep classification consistent with the ownership contract list, including legacy imports.
export const OWNERSHIP_ORDER_SQL = `(s.kind='lease_to_own' OR COALESCE(NULLIF(o.order_type,''),o.draft_payload->'management_composer'->>'rental_type') IN ('ownership','ownership_cd'))`;
export const CONTRACT_TELEGRAM_ROUTE_SQL = `CASE
  WHEN n.event_type IN ('vehicle_transfer','vehicle_receive') THEN 'ownership_new'
  WHEN ${OWNERSHIP_ORDER_SQL} AND n.event_type='renewal' THEN 'ownership_renewal'
  WHEN ${OWNERSHIP_ORDER_SQL} AND n.event_type IN ('rental','reservation','handover','return') THEN 'ownership_new'
  ELSE 'store' END`;
export function contractTelegramDestination(kind:ContractEventType,ownership:boolean,storeName:string) {
  const route=ownership&&(kind==='renewal'||['rental','reservation','handover','return'].includes(kind))?kind==='renewal'?'ownership_renewal':'ownership_new':null;
  return OWNERSHIP_TELEGRAM_DESTINATIONS.find(item=>item.route===route)?.label||`Nhóm cơ sở ${storeName||'của hợp đồng'}`;
}
