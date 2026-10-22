'use client';

import { KeyboardEvent, useMemo, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { VEHICLE_STATUSES } from '@/lib/management/config';
import { formatDateTime } from '@/lib/formatters';
import { normalize } from '@/lib/management/table-utils';
import type { ManagementRow } from '@/lib/management/types';
import { classifyReservationWindow, type OpenVehicleRental } from '@/lib/management/vehicle-reservation-window';

type Tone = 'ok' | 'warn' | 'danger';
export interface VehicleAvailability { tone: Tone; label: string; detail: string; selectable: boolean }

const RENTAL_LABELS: Record<string, string> = {
  renting: 'Đang được thuê', overdue: 'Quá hạn chưa trả', wait_payment: 'Hợp đồng cũ chưa đóng (chờ tất toán)',
  pending: 'Đã đặt, chờ giao xe', deposit_contract: 'Đã đặt cọc giữ xe', bad_debt: 'Hợp đồng cũ chưa đóng (nợ xấu)',
};
const TONE_ORDER: Record<Tone, number> = { ok: 0, warn: 1, danger: 2 };
const MAX_OPTIONS = 60;
const plateKey = (value: unknown) => normalize(String(value || '')).replace(/[^a-z0-9]/g, '');
export function matchesVehicleSearch(item: Pick<ManagementRow,'name'|'license'|'brand'|'store_name'>, query: string) {
  const term = normalize(query);
  if (!term) return true;
  const plateTerm = term.replace(/[^a-z0-9]/g, '');
  return normalize(`${item.name} ${item.license} ${item.brand || ''} ${item.store_name || ''}`).includes(term)
    || Boolean(plateTerm) && plateKey(item.license).includes(plateTerm);
}

function rentalsOf(vehicle: ManagementRow): OpenVehicleRental[] {
  try { return vehicle.rentals_json ? JSON.parse(String(vehicle.rentals_json)) as OpenVehicleRental[] : []; } catch { return []; }
}
const formatReturn = (value: string | null | undefined) => value ? formatDateTime(value) : 'chưa có ngày trả';

export function vehicleAvailability(
  vehicle: ManagementRow,
  ownOrderId?: number,
  proposedStart = '',
  proposedEnd = '',
): VehicleAvailability {
  const all = rentalsOf(vehicle);
  const classified = classifyReservationWindow(all, proposedStart, proposedEnd, ownOrderId);
  if (classified.kind === 'hard') {
    const rental = classified.rental;
    return {
      tone: 'danger',
      label: rental ? (RENTAL_LABELS[rental.status] || 'Đang có hợp đồng mở') : 'Đang có hợp đồng mở',
      detail: classified.detail || (rental
        ? [`HĐ ${rental.code}`, rental.store_name, RENTAL_LABELS[rental.status], `hẹn trả ${formatReturn(rental.return_at)}`].filter(Boolean).join(' · ') + '. Hoàn tất hợp đồng cũ trước khi chọn xe.'
        : ''),
      selectable: false,
    };
  }
  if (classified.kind === 'overlap_warn') {
    return {
      tone: 'warn',
      label: 'Cọc giữ xe · cần xác nhận',
      detail: classified.detail,
      selectable: true,
    };
  }
  if (classified.kind === 'squeeze_ok') {
    return { tone: 'ok', label: 'Chen trước ngày nhận cọc', detail: classified.detail, selectable: true };
  }
  if (all.length) return { tone: 'ok', label: 'Xe của hợp đồng này', detail: '', selectable: true };
  if (vehicle.status === 'ready' || ['using', 'rent'].includes(String(vehicle.status))) {
    return { tone: 'ok', label: vehicle.status === 'ready' ? 'Lưu kho' : 'Sẵn sàng phát hành',
      detail: vehicle.status === 'ready' ? '' : 'Không còn hợp đồng mở. Phát hành sẽ đưa xe vào Đang thuê.', selectable: true };
  }
  const status = VEHICLE_STATUSES.find(option => option.value === vehicle.status)?.label || String(vehicle.status || 'Chưa rõ trạng thái');
  return { tone: 'warn', label: status,
    detail: `Xe đang ở trạng thái ${status}. Cần xác nhận xe về Lưu kho trước khi phát hành hợp đồng mới.`,
    selectable: true };
}

export function VehiclePicker({ id, index, vehicles, value, storeName, monthly, ownOrderId, takenIds, disabled, invalid, proposedStart, proposedEnd, onChange, directory }: {
  id: string; index: number; vehicles: ManagementRow[]; value: string; storeName: string; monthly: boolean; ownOrderId?: number;
  takenIds: string[]; disabled: boolean; invalid: boolean; proposedStart?: string; proposedEnd?: string; onChange: (id: string) => void;
  directory?: ManagementRow[];
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = `${id}-options`;
  const start = proposedStart || '';
  const end = proposedEnd || '';
  const selected = vehicles.find(item => String(item.id) === value) || directory?.find(item => String(item.id) === value);
  const ranked = useMemo(() => vehicles
    .map(item => ({ item, availability: vehicleAvailability(item, ownOrderId, start, end) }))
    .sort((a, b) => TONE_ORDER[a.availability.tone] - TONE_ORDER[b.availability.tone] || String(a.item.name).localeCompare(String(b.item.name), 'vi')),
  [vehicles, ownOrderId, start, end]);
  const term = normalize(query);
  const plateTerm = term.replace(/[^a-z0-9]/g, '');
  const extraMatches = term ? (directory || []).filter(item => !vehicles.some(vehicle => String(vehicle.id) === String(item.id)) && matchesVehicleSearch(item, query))
    .map(item => ({ item, availability: vehicleAvailability(item, ownOrderId, start, end) })) : [];
  const matches = [...(term ? ranked.filter(({ item }) => matchesVehicleSearch(item, query)) : ranked), ...extraMatches]
    .sort((a, b) => {
      if (plateTerm) {
        const exact = Number(plateKey(a.item.license) === plateTerm) - Number(plateKey(b.item.license) === plateTerm);
        if (exact) return -exact;
      }
      return TONE_ORDER[a.availability.tone] - TONE_ORDER[b.availability.tone] || String(a.item.name).localeCompare(String(b.item.name), 'vi');
    });
  const exactPlate = plateTerm ? matches.filter(({ item }) => plateKey(item.license) === plateTerm) : [];
  const exactIds = new Set(exactPlate.map(row => String(row.item.id)));
  const shown = [...exactPlate, ...matches.filter(row => !exactIds.has(String(row.item.id)))].slice(0, Math.max(MAX_OPTIONS, exactPlate.length));
  const selectedAvailability = selected ? vehicleAvailability(selected, ownOrderId, start, end) : null;

  function choose(next: string) {
    const vehicle = vehicles.find(item => String(item.id) === next) || directory?.find(item => String(item.id) === next);
    if (next && (!vehicle || !vehicleAvailability(vehicle, ownOrderId, start, end).selectable || takenIds.includes(next) && next !== value)) return;
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
        placeholder={disabled ? 'Chọn cửa hàng xe trước' : `Gõ tên xe hoặc biển số tại ${storeName}. Gõ biển số để tìm cả cửa hàng khác`}
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
        const unavailable = !availability.selectable || taken;
        return <div key={item.id} id={`${listId}-${item.id}`} role="option" aria-selected={String(item.id) === value}
          aria-disabled={unavailable}
          className={`mg-vehicle-option${unavailable ? ' is-disabled' : ''}${String(item.id) === value ? ' is-selected' : ''}${position === active ? ' is-active' : ''}`}
          onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(position)} onClick={() => choose(String(item.id))}>
          <div className="mg-vehicle-option-main"><strong>{item.name} · {item.license}</strong>
            <span className={`mg-vehicle-badge is-${availability.tone}`}>{availability.label}</span></div>
          <span>{[item.store_name, item.brand, price == null ? 'Chưa có đơn giá' : `${Number(price).toLocaleString('vi-VN')} đ/${monthly ? 'tháng' : 'ngày'}`, taken ? 'Đã chọn ở xe khác trên mẫu' : ''].filter(Boolean).join(' · ')}</span>
          {availability.detail && <em>{availability.detail}</em>}
        </div>;
      })}
      {!vehicles.length && !extraMatches.length && <small>Cửa hàng đã chọn chưa có xe.{directory?.length ? ' Gõ biển số để tìm ở cửa hàng khác.' : ''}</small>}
      {extraMatches.length > 0 && <small>Khớp biển số / tên xe ở cửa hàng khác.</small>}
      {ranked.length > 0 && !matches.length && <small>Không có xe phù hợp khớp từ khóa.</small>}
      {matches.length > shown.length && <small>Còn {matches.length - shown.length} xe nữa, gõ thêm để thu hẹp.</small>}
    </div>}
    {selectedAvailability && selectedAvailability.tone !== 'ok' && <div className={`mg-vehicle-warning is-${selectedAvailability.tone}`} role="alert">
      <AlertTriangle size={16} /><div><strong>{selectedAvailability.tone === 'warn' ? 'Cảnh báo' : 'Cảnh báo'}: {selectedAvailability.label}</strong><span>{selectedAvailability.detail}</span></div>
    </div>}
    {selectedAvailability && selectedAvailability.tone === 'ok' && selectedAvailability.detail && <p className="mg-composer-hint" role="status">{selectedAvailability.detail}</p>}
  </div>;
}
