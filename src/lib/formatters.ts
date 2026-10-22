/**
 * Định dạng tiền tệ Việt Nam (VNĐ)
 */
export function formatMoney(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(Number(amount))) {
    return '0 đ';
  }
  const num = Math.round(Number(amount));
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' đ';
}

export const formatCurrency = formatMoney;

const VN_TZ = 'Asia/Ho_Chi_Minh';
const vietnamDateFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:VN_TZ,year:'numeric',month:'2-digit',day:'2-digit'});
const vietnamDateTimeFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:VN_TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});

/** Always 24h (never SA/CH / AM/PM). */
function vietnamParts(input: string | Date, withTime: boolean) {
  const raw = input instanceof Date ? input : String(input);
  const date = raw instanceof Date ? raw : new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw) ? `${raw}:00+07:00` : raw);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = (withTime?vietnamDateTimeFormatter:vietnamDateFormatter).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || '';
  return { day: get('day'), month: get('month'), year: get('year'), hour: get('hour'), minute: get('minute') };
}

/**
 * Định dạng ngày giờ: DD/MM/YYYY HH:mm (hệ 24h, múi giờ Việt Nam)
 */
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '--';
  const parts = vietnamParts(dateStr, true);
  if (!parts) return dateStr;
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

/**
 * Chỉ giờ phút hệ 24h: HH:mm
 */
export function formatTime24(dateStr: string | null | undefined): string {
  if (!dateStr) return '--';
  const parts = vietnamParts(dateStr, true);
  if (!parts) return dateStr;
  return `${parts.hour}:${parts.minute}`;
}

/**
 * Định dạng ngày: YYYY-MM-DD -> DD/MM/YYYY
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '--';
  const parts = vietnamParts(dateStr, false);
  if (!parts) return dateStr;
  return `${parts.day}/${parts.month}/${parts.year}`;
}

/**
 * Danh sách trạng thái hợp đồng thuê xe
 */
export const ORDER_STATUS = [
  { value: '1', label: 'Tạo mới (Chưa cọc)', badgeClass: 'badge-secondary' },
  { value: '2', label: 'Đã đặt cọc', badgeClass: 'badge-info' },
  { value: '3', label: 'Đang thuê', badgeClass: 'badge-primary' },
  { value: '4', label: 'Hoàn thành', badgeClass: 'badge-success' },
  { value: '5', label: 'Đã hủy', badgeClass: 'badge-danger' },
  { value: '6', label: 'Quá hạn thuê', badgeClass: 'badge-warning' },
];

export function getOrderStatusBadge(status: number | string): { label: string; badgeClass: string } {
  const found = ORDER_STATUS.find(s => s.value === String(status));
  return found || { label: 'Không xác định', badgeClass: 'badge-light' };
}
