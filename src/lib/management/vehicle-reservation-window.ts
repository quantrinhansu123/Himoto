/** Shared client rules for cọc giữ xe vs hợp đồng chen lịch (phương án B). */

export type ReservationConflictKind = 'none' | 'squeeze_ok' | 'overlap_warn' | 'hard';

export interface OpenVehicleRental {
  order_id: number;
  code: string;
  status: string;
  customer?: string;
  store_name?: string;
  rent_at?: string | null;
  return_at?: string | null;
}

const HARD_STATUSES = new Set(['renting', 'overdue', 'wait_payment', 'pending', 'bad_debt']);

function statusOf(item: OpenVehicleRental) {
  return String(item.status || '').trim().toLowerCase();
}

function isDeposit(item: OpenVehicleRental) {
  return statusOf(item) === 'deposit_contract';
}

function asTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  // Draft local times are Vietnam wall clock without offset.
  const stamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw) ? `${raw}+07:00` : raw;
  const ms = new Date(stamp).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function formatPickup(value: string | null | undefined) {
  const ms = asTime(value);
  if (ms == null) return '';
  return new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

/** Classify open rentals on a vehicle against a proposed rental window. */
export function classifyReservationWindow(
  rentals: OpenVehicleRental[],
  proposedStart: string,
  proposedEnd: string,
  ownOrderId?: number,
): { kind: ReservationConflictKind; rental?: OpenVehicleRental; detail: string } {
  const others = rentals.filter(item => item.order_id !== ownOrderId);
  if (!others.length) return { kind: 'none', detail: '' };

  const endMs = asTime(proposedEnd);
  // Cọc giữ xe không bao giờ chặn cứng — chỉ cảnh báo hoặc cho chen trước ngày nhận.
  const hard = others.find(item => HARD_STATUSES.has(statusOf(item)));
  if (hard) {
    return {
      kind: 'hard',
      rental: hard,
      detail: `HĐ ${hard.code}${hard.store_name?` · ${hard.store_name}`:''} đang mở. Cơ sở quản lý cần xác nhận trả xe trên đúng hợp đồng này trước khi chọn xe.`,
    };
  }

  const deposits = others.filter(isDeposit);
  const unknown = others.filter(item => !isDeposit(item) && !HARD_STATUSES.has(statusOf(item)));
  if (!deposits.length) {
    const [first] = unknown.length ? unknown : others;
    return {
      kind: 'hard',
      rental: first,
      detail: `HĐ ${first.code}${first.store_name?` · ${first.store_name}`:''} đang mở. Cơ sở quản lý cần xác nhận trả xe trên đúng hợp đồng này trước khi chọn xe.`,
    };
  }

  if (endMs == null) {
    return {
      kind: 'overlap_warn',
      rental: deposits[0],
      detail: `Xe đã cọc giữ (HĐ ${deposits[0].code}). Nhập hẹn trả để kiểm tra lịch chen trước ngày nhận.`,
    };
  }

  const overlapping = deposits.filter(item => {
    const pickup = asTime(item.rent_at);
    // Thiếu ngày nhận → không chắc chen được, cảnh báo (vẫn cho chọn).
    return pickup == null || endMs > pickup;
  });
  const squeezable = deposits.filter(item => {
    const pickup = asTime(item.rent_at);
    return pickup != null && endMs <= pickup;
  });

  if (!overlapping.length && squeezable.length) {
    const item = squeezable[0];
    const when = formatPickup(item.rent_at) || 'ngày nhận đã cọc';
    return {
      kind: 'squeeze_ok',
      rental: item,
      detail: `Có cọc giữ xe (HĐ ${item.code}, nhận ${when}). Hẹn trả của HĐ này trước ngày nhận → được chen lịch.`,
    };
  }

  const item = overlapping[0] || deposits[0];
  const when = formatPickup(item.rent_at);
  return {
    kind: 'overlap_warn',
    rental: item,
    detail: `Xe đã cọc giữ (HĐ ${item.code}${when ? `, nhận ${when}` : ''}). Hẹn trả chồng/vượt ngày nhận — vẫn chọn được, cần xác nhận khi phát hành.`,
  };
}
