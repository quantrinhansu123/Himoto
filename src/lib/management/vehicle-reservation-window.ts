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

function asTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  // Draft local times are Vietnam wall clock without offset.
  const stamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw) ? `${raw}+07:00` : raw;
  const ms = new Date(stamp).getTime();
  return Number.isFinite(ms) ? ms : null;
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
  const hard = others.find(item => HARD_STATUSES.has(item.status));
  if (hard) {
    return {
      kind: 'hard',
      rental: hard,
      detail: `HĐ ${hard.code} (${hard.status}) đang mở. Hoàn tất hợp đồng cũ trước khi chọn xe.`,
    };
  }

  const deposits = others.filter(item => item.status === 'deposit_contract');
  if (!deposits.length) {
    const [first] = others;
    return {
      kind: 'hard',
      rental: first,
      detail: `HĐ ${first.code} đang mở. Hoàn tất hợp đồng cũ trước khi chọn xe.`,
    };
  }

  if (endMs == null) {
    return {
      kind: 'overlap_warn',
      rental: deposits[0],
      detail: `Xe đã cọc giữ (HĐ ${deposits[0].code}). Nhập hẹn trả để kiểm tra lịch chen.`,
    };
  }

  const overlapping = deposits.filter(item => {
    const pickup = asTime(item.rent_at);
    return pickup == null || endMs > pickup;
  });
  const squeezable = deposits.filter(item => {
    const pickup = asTime(item.rent_at);
    return pickup != null && endMs <= pickup;
  });

  if (!overlapping.length && squeezable.length) {
    const item = squeezable[0];
    const pickup = item.rent_at ? new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(item.rent_at)) ? `${item.rent_at}+07:00` : String(item.rent_at)) : null;
    const when = pickup && Number.isFinite(pickup.getTime())
      ? pickup.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
      : 'ngày nhận đã cọc';
    return {
      kind: 'squeeze_ok',
      rental: item,
      detail: `Có cọc giữ xe (HĐ ${item.code}, nhận ${when}). Hẹn trả của HĐ này trước ngày nhận → được chen lịch.`,
    };
  }

  const item = overlapping[0] || deposits[0];
  const pickup = item.rent_at ? String(item.rent_at) : '';
  return {
    kind: 'overlap_warn',
    rental: item,
    detail: `Xe đã cọc giữ (HĐ ${item.code}${pickup ? `, nhận ${pickup.replace('T', ' ')}` : ''}). Hẹn trả của HĐ này chồng hoặc vượt ngày nhận — cần xác nhận khi phát hành.`,
  };
}
