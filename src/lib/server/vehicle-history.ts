import 'server-only';
import type { PoolClient } from 'pg';
import type { VehicleEvent, VehicleEventAction } from '@/lib/management/vehicle-history';
import { VEHICLE_STATUSES } from '@/lib/management/config';
import { formatMoney } from '@/lib/formatters';
import { readVehicleAudit } from './vehicle-audit';

type Database = Pick<PoolClient, 'query'>;
export class VehicleHistoryError extends Error { constructor(message: string, public status = 400) { super(message); } }

const iso = (value: unknown) => value instanceof Date ? value.toISOString() : value == null ? null : String(value);
const text = (value: unknown) => value == null ? '' : String(value).trim();
const statusLabel = (value: string) => VEHICLE_STATUSES.find(option => option.value === value)?.label || value;
const jsonArray = (path: string) => `jsonb_array_elements(CASE WHEN jsonb_typeof(o.draft_payload::jsonb #> '${path}')='array' THEN o.draft_payload::jsonb #> '${path}' ELSE '[]'::jsonb END)`;
const TRANSFER_LABELS: Record<string, string> = { transfer_dispatch: 'Xuất chuyển kho', transfer_receive: 'Nhận chuyển kho',manual_transfer_receive:'Nhận xe',manual_transfer_reject:'Từ chối điều chuyển',manual_transfer_cancel:'Huỷ điều chuyển' };
const STATUS_ACTION: Record<string, [VehicleEventAction, string]> = { repairing: ['repair', 'Sửa chữa / bảo dưỡng'], broken: ['repair', 'Báo hỏng'] };

export async function readVehicleHistory(client: Database, vehicleId: number): Promise<VehicleEvent[]> {
  if (!Number.isSafeInteger(vehicleId) || vehicleId <= 0) throw new VehicleHistoryError('Mã xe không hợp lệ.');
  const found = await client.query(`SELECT v.name,v.license,v.created_at,u.name AS actor,s.store_name
    FROM himoto.vehicles v LEFT JOIN himoto.users u ON u.id=v.created_by LEFT JOIN himoto.stores s ON s.id=v.store_id WHERE v.id=$1`, [vehicleId]);
  const vehicle = found.rows[0];
  if (!vehicle) throw new VehicleHistoryError('Không tìm thấy xe.', 404);
  const events: VehicleEvent[] = [];
  const push = (event: Omit<VehicleEvent, 'vehicle_name' | 'license'> & Partial<Pick<VehicleEvent,'vehicle_name'|'license'>>) => events.push({ vehicle_name: text(vehicle.name), license: text(vehicle.license), ...event });
  if (vehicle.created_at) push({ key: 'create', action: 'create', label: 'Nhập xe', location: text(vehicle.store_name), responsible_store: text(vehicle.store_name),
    beneficiary_store: '', note: '', at: iso(vehicle.created_at), actor: text(vehicle.actor), order_id: null });

  const rentals = await client.query(`SELECT d.id AS item_id,o.id AS order_id,o.order_status,
      COALESCE(NULLIF(o.contract_number,''),NULLIF(o.draft_reference,''),'#'||o.id::text) AS code,
      COALESCE(c.name,o.customer_name,'') AS customer_name,COALESCE(d.rent_at,o.rent_at) AS rent_at,d.return_at,d.completed_at,
      os.store_name AS order_store,COALESCE(ss.store_name,vs.store_name) AS stock_store,COALESCE(ru.name,lc.name) AS creator,COALESCE(au.name,lr.name) AS returner,ra.fee,ra.early
    FROM himoto.order_vehicle_details d
    JOIN himoto.orders o ON o.id=d.order_id
    LEFT JOIN himoto.customers c ON c.id=o.customer_id
    LEFT JOIN himoto.stores os ON os.id=o.store_id
    LEFT JOIN LATERAL (SELECT CASE WHEN x->>'stock_store_id' ~ '^[0-9]+$' THEN (x->>'stock_store_id')::bigint END AS id
      FROM ${jsonArray('{management_composer,draft,vehicles}')} x WHERE x->>'id'=d.vehicle_id::text LIMIT 1) st ON true
    LEFT JOIN himoto.stores ss ON ss.id=st.id
    LEFT JOIN himoto.vehicles v ON v.id=d.vehicle_id
    LEFT JOIN himoto.stores vs ON vs.id=COALESCE(v.current_store_id,v.store_id)
    LEFT JOIN himoto.users ru ON ru.id=o.contract_responsible_user_id
    LEFT JOIN LATERAL (SELECT CASE WHEN x->>'actor_id' ~ '^[0-9]+$' THEN (x->>'actor_id')::bigint END AS actor,x->>'fee' AS fee,x->>'early_discount' AS early
      FROM ${jsonArray('{management_composer,return_adjustments}')} x WHERE x->>'item_id'=d.id::text LIMIT 1) ra ON true
    LEFT JOIN himoto.users au ON au.id=ra.actor
    LEFT JOIN LATERAL (SELECT u.name FROM himoto.activity_logs l JOIN himoto.users u ON u.id=l.user_id
      WHERE l.order_id=o.id AND l.action='create' ORDER BY l.id LIMIT 1) lc ON true
    LEFT JOIN LATERAL (SELECT u.name FROM himoto.activity_logs l JOIN himoto.users u ON u.id=l.user_id
      WHERE l.order_id=o.id AND l.action='completed' ORDER BY l.id DESC LIMIT 1) lr ON d.completed_at IS NOT NULL
    WHERE d.vehicle_id=$1 AND d.deleted_at IS NULL AND o.deleted_at IS NULL AND o.order_status<>'draft'
    ORDER BY d.id DESC LIMIT 500`, [vehicleId]);
  for (const row of rentals.rows) {
    const orderId = Number(row.order_id), customer = text(row.customer_name), stock = text(row.stock_store), store = text(row.order_store);
    if (row.rent_at) push({ key: `rent-${row.item_id}`, action: 'rent', label: 'Thuê', location: customer ? `Khách: ${customer}` : 'Khách thuê',
      responsible_store: stock, beneficiary_store: store, note: [`HĐ ${row.code}`, row.order_status === 'cancelled' ? 'Đã hủy' : ''].filter(Boolean).join(' · '),
      at: iso(row.rent_at), actor: text(row.creator), order_id: orderId });
    if (row.completed_at) {
      const fee = Number(row.fee) || 0, early = Number(row.early) || 0;
      push({ key: `return-${row.item_id}`, action: 'return', label: 'Trả xe', location: stock, responsible_store: stock, beneficiary_store: store,
        note: [`HĐ ${row.code}`, early ? `Trả sớm, giảm ${formatMoney(early)}` : fee > 0 ? `Phí trả trễ ${formatMoney(fee)}` : ''].filter(Boolean).join(' · '),
        at: iso(row.completed_at), actor: text(row.returner), order_id: orderId });
    }
  }

  const located = await client.query(`SELECT e.id,e.event_type,e.ref_type,e.ref_id,e.notes,(e.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS at,
      e.customer_name,e.customer_phone,e.customer_id_card,e.audit_snapshot,
      fs.store_name AS from_store,ts.store_name AS to_store,u.name AS actor,t.transfer_code,t.reason
    FROM himoto.vehicle_location_events e
    LEFT JOIN himoto.stores fs ON fs.id=e.from_store_id
    LEFT JOIN himoto.stores ts ON ts.id=e.to_store_id
    LEFT JOIN himoto.users u ON u.id=e.created_by
    LEFT JOIN himoto.vehicle_transfers t ON e.ref_type='vehicle_transfers' AND t.id=e.ref_id
    WHERE e.vehicle_id=$1 ORDER BY e.id DESC LIMIT 500`, [vehicleId]);
  for (const row of located.rows) {
    const audit=readVehicleAudit(row.audit_snapshot);
    const type = text(row.event_type), from = audit?.from_store ?? text(row.from_store), to = audit?.to_store ?? text(row.to_store);
    const [action, label]: [VehicleEventAction, string] = type === 'status_change' ? STATUS_ACTION[text(row.ref_type)] || ['status', `Đổi trạng thái: ${statusLabel(text(row.ref_type))}`]
      : type === 'note' ? ['note', 'Ghi chú'] : type === 'vehicle_edit' ? ['edit','Chỉnh sửa thông tin xe'] : ['transfer', TRANSFER_LABELS[type] || 'Chuyển kho'];
    const customer = text(row.customer_name), rented = type === 'status_change' && text(row.ref_type) === 'using';
    push({ key: `event-${row.id}`, action, label,
      ...(['manual_transfer','manual_transfer_receive','manual_transfer_reject'].includes(type)?{telegram_event_id:type==='manual_transfer_reject'?undefined:Number(row.id)}:{}),
      location: type === 'transfer_dispatch' ? 'Đang điều chuyển' : rented && customer ? `Khách: ${customer}` : action === 'transfer' ? to || from : from || to,
      responsible_store: from, beneficiary_store: action === 'note' ? '' : to,
      note: [text(row.transfer_code), text(row.reason), text(row.notes), !rented && customer ? `Khách: ${customer}` : '',
        row.customer_phone ? `SĐT ${text(row.customer_phone)}` : '', row.customer_id_card ? `CCCD ${text(row.customer_id_card)}` : ''].filter(Boolean).join(' · '),
      at: iso(row.at), actor: audit?.actor ?? text(row.actor), order_id: type === 'status_change' && Number(row.ref_id) > 0 ? Number(row.ref_id) : null,
      ...(audit?{changes:audit.changes,vehicle_name:audit.vehicle_name,license:audit.license}:{}) });
  }

  const swapTable = await client.query("SELECT to_regclass('himoto.management_contract_vehicle_swaps') IS NOT NULL AS ready");
  if (swapTable.rows[0]?.ready) {
    const swaps = await client.query(`SELECT w.id,w.created_at,w.order_id,w.from_vehicle_id,u.name AS actor,s.store_name,
        COALESCE(NULLIF(o.contract_number,''),NULLIF(o.draft_reference,''),'#'||o.id::text) AS code,
        COALESCE(NULLIF(f.license,''),f.name) AS from_vehicle,COALESCE(NULLIF(t.license,''),t.name) AS to_vehicle
      FROM himoto.management_contract_vehicle_swaps w
      LEFT JOIN himoto.orders o ON o.id=w.order_id
      LEFT JOIN himoto.stores s ON s.id=o.store_id
      LEFT JOIN himoto.users u ON u.id=w.actor_id
      LEFT JOIN himoto.vehicles f ON f.id=w.from_vehicle_id
      LEFT JOIN himoto.vehicles t ON t.id=w.to_vehicle_id
      WHERE w.from_vehicle_id=$1 OR w.to_vehicle_id=$1 ORDER BY w.id DESC LIMIT 200`, [vehicleId]);
    for (const row of swaps.rows) {
      const out = Number(row.from_vehicle_id) === vehicleId;
      push({ key: `swap-${row.id}`, action: 'swap', label: out ? 'Đổi xe (thay ra)' : 'Đổi xe (thay vào)', location: '', responsible_store: '',
        beneficiary_store: text(row.store_name), note: [row.code ? `HĐ ${row.code}` : '', out ? `Thay bằng xe ${text(row.to_vehicle) || '—'}` : `Thay cho xe ${text(row.from_vehicle) || '—'}`].filter(Boolean).join(' · '),
        at: iso(row.created_at), actor: text(row.actor), order_id: Number(row.order_id) || null });
    }
  }
  return events.sort((a, b) => (b.at ? Date.parse(b.at) : 0) - (a.at ? Date.parse(a.at) : 0));
}
