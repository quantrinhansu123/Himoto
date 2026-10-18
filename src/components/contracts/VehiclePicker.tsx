'use client';

import { KeyboardEvent, useMemo, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { VEHICLE_STATUSES } from '@/lib/management/config';
import { formatDateTime } from '@/lib/formatters';
import { normalize } from '@/lib/management/table-utils';
import type { ManagementRow } from '@/lib/management/types';

interface VehicleRental { order_id: number; code: string; status: string; customer: string; return_at: string | null }
type Tone = 'ok' | 'warn' | 'danger';
export interface VehicleAvailability { tone: Tone; label: string; detail: string }

const RENTAL_LABELS: Record<string, string> = {
  renting: 'Đang được thuê', overdue: 'Quá hạn chưa trả', wait_payment: 'Hợp đồng cũ chưa đóng (chờ thanh toán)',
  pending: 'Đã đặt, chờ giao xe', deposit_contract: 'Đã đặt cọc giữ xe',
};
const TONE_ORDER: Record<Tone, number> = { ok: 0, warn: 1, danger: 2 };
const MAX_OPTIONS = 60;

function rentalsOf(vehicle: ManagementRow): VehicleRental[] {
  try { return vehicle.rentals_json ? JSON.parse(String(vehicle.rentals_json)) as VehicleRental[] : []; } catch { return []; }
}
const formatReturn = (value: string | null) => value ? formatDateTime(value) : 'chưa có ngày trả';

export function vehicleAvailability(vehicle: ManagementRow, ownOrderId?: number): VehicleAvailability {
  const all = rentalsOf(vehicle);
  const others = all.filter(rental => rental.order_id !== ownOrderId);
  if (others.length) {
    const [rental] = others;
    const more = others.length > 1 ? ` (+${others.length - 1} hợp đồng khác)` : '';
    return { tone: 'danger', label: RENTAL_LABELS[rental.status] || 'Đang có hợp đồng mở',
      detail: `HĐ ${rental.code} · ${rental.customer || 'Chưa rõ khách'} · hẹn trả ${formatReturn(rental.return_at)}${more}` };
  }
  if (all.length) return { tone: 'ok', label: 'Xe của hợp đồng này', detail: '' };
  if (vehicle.status === 'ready') return { tone: 'ok', label: 'Lưu kho', detail: '' };
  const status = VEHICLE_STATUSES.find(option => option.value === vehicle.status)?.label || String(vehicle.status || 'Chưa rõ trạng thái');
  return { tone: 'warn', label: status,
    detail: `Xe đang ở trạng thái ${status}. Cần đóng hợp đồng cũ và xác nhận xe về Lưu kho trước khi phát hành hợp đồng mới.` };
}

export function VehiclePicker({ id, index, vehicles, value, storeName, monthly, ownOrderId, takenIds, disabled, invalid, onChange }: {
  id: string; index: number; vehicles: ManagementRow[]; value: string; storeName: string; monthly: boolean; ownOrderId?: number;
  takenIds: string[]; disabled: boolean; invalid: boolean; onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = `${id}-options`;
  const selected = vehicles.find(item => String(item.id) === value);
  const ranked = useMemo(() => vehicles
    .map(item => ({ item, availability: vehicleAvailability(item, ownOrderId) }))
    .filter(({ item, availability }) => availability.tone === 'ok' || String(item.id) === value)
    .sort((a, b) => TONE_ORDER[a.availability.tone] - TONE_ORDER[b.availability.tone] || String(a.item.name).localeCompare(String(b.item.name), 'vi')),
  [vehicles, ownOrderId, value]);
  const term = normalize(query);
  const matches = term ? ranked.filter(({ item }) => normalize(`${item.name} ${item.license} ${item.brand || ''} ${item.store_name || ''}`).includes(term)) : ranked;
  const shown = matches.slice(0, MAX_OPTIONS);
  const selectedAvailability = selected ? vehicleAvailability(selected, ownOrderId) : null;

  function choose(next: string) {
    onChange(next);
    setQuery(''); setOpen(false); setActive(0);
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive(current => shown.length ? (current + step + shown.length) % shown.length : 0);
    } else if (event.key === 'Enter' && open && shown[active]) {
      event.preventDefault();
      choose(String(shown[active].item.id));
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false); setQuery('');
    }
  }

  return <div className="mg-vehicle-picker">
    <div className="mg-vehicle-picker-input">
      <input id={id} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off" disabled={disabled}
        aria-invalid={invalid} aria-activedescendant={open && shown[active] ? `${listId}-${shown[active].item.id}` : undefined}
        placeholder={disabled ? 'Chọn cửa hàng xe trước' : `Gõ tên xe hoặc biển số tại ${storeName}`}
        value={open ? query : selected ? `${selected.name} · ${selected.license}` : ''}
        onFocus={() => { setOpen(true); setQuery(''); setActive(0); }}
        onBlur={() => { setOpen(false); setQuery(''); }}
        onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0); }}
        onKeyDown={keyDown} />
      {selected && !disabled && <button type="button" className="mg-icon-button" aria-label={`Bỏ chọn xe ${index + 1}`} onClick={() => choose('')}><X size={15} /></button>}
    </div>
    {open && !disabled && <div className="mg-vehicle-option-list" id={listId} role="listbox" aria-label={`Danh sách xe ${index + 1}`}>
      {shown.map(({ item, availability }, position) => {
        const price = monthly ? item.monthly_price : item.daily_price;
        const taken = takenIds.includes(String(item.id)) && String(item.id) !== value;
        return <div key={item.id} id={`${listId}-${item.id}`} role="option" aria-selected={String(item.id) === value}
          className={`mg-vehicle-option${String(item.id) === value ? ' is-selected' : ''}${position === active ? ' is-active' : ''}`}
          onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(position)} onClick={() => choose(String(item.id))}>
          <div className="mg-vehicle-option-main"><strong>{item.name} · {item.license}</strong>
            <span className={`mg-vehicle-badge is-${availability.tone}`}>{availability.label}</span></div>
          <span>{[item.store_name, item.brand, price == null ? 'Chưa có đơn giá' : `${Number(price).toLocaleString('vi-VN')} đ/${monthly ? 'tháng' : 'ngày'}`, taken ? 'Đã chọn ở xe khác trên mẫu' : ''].filter(Boolean).join(' · ')}</span>
          {availability.detail && <em>{availability.detail}</em>}
        </div>;
      })}
      {!vehicles.length && <small>Cửa hàng đã chọn chưa có xe.</small>}
      {vehicles.length > 0 && !ranked.length && <small>Không có xe Lưu kho sẵn sàng cho thuê.</small>}
      {ranked.length > 0 && !matches.length && <small>Không có xe phù hợp khớp từ khóa.</small>}
      {matches.length > shown.length && <small>Còn {matches.length - shown.length} xe nữa, gõ thêm để thu hẹp.</small>}
    </div>}
    {selectedAvailability && selectedAvailability.tone !== 'ok' && <div className={`mg-vehicle-warning is-${selectedAvailability.tone}`} role="alert">
      <AlertTriangle size={16} /><div><strong>Cảnh báo: {selectedAvailability.label}</strong><span>{selectedAvailability.detail}</span></div>
    </div>}
  </div>;
}
