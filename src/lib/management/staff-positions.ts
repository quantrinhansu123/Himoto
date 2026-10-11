const key = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/\s+/g, ' ').trim().toLowerCase();

export const STAFF_POSITIONS = ['HCNS', 'QLCN', 'KT', 'BPSC', 'TLS', 'NVKD', 'TPKD', 'QL PTKD', 'QTPGD', 'PT', 'Leader', 'Quản lý cơ sở', 'Thu ngân', 'Kỹ thuật viên'];
export const STAFF_POSITION_SEARCH_ALIASES: Record<string, string[]> = {
  NVKD: ['Nhân viên kinh doanh'], TPKD: ['Trưởng phòng kinh doanh'],
  HCNS: ['Hành chính nhân sự'], QLCN: ['Quản lý công nợ'], KT: ['Kế toán'],
  TLS: ['Telesale', 'Telesales'], 'QL PTKD': ['Quản lý'], 'Quản lý cơ sở': ['QL', 'QL cơ sở'],
};
const aliases: Record<string, string> = {
  'nhan vien kinh doanh': 'NVKD', 'truong phong kinh doanh': 'TPKD',
  'part time': 'PT', 'part-time': 'PT', 'telesale': 'TLS', 'telesales': 'TLS',
  'hanh chinh nhan su': 'HCNS', 'quan ly cong no': 'QLCN', 'leader cong no': 'QLCN',
  'ke toan': 'KT', 'leader thue so huu': 'Leader',
  'ql co so': 'Quản lý cơ sở',
  ...Object.fromEntries(STAFF_POSITIONS.map(position => [key(position), position])),
};

/** A branch belongs in store_id, never in the job title. Unknown titles remain editable. */
export function normalizeStaffPosition(value: unknown): string {
  const text = String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  return [...new Set(text.split('/').map(part => {
    const title = part.trim().replace(/\s+(?:(?:CS|Cơ sở)\s+)?(?:Giáp Bát|Láng|Nguyễn Hoàng|Thuốc Bắc|Hàng Bút|Hà Đông|Thuê sở hữu)$/iu, '').trim();
    return aliases[key(title)] || title;
  }).filter(Boolean))].join(' / ');
}

export function staffPositionSuggestions(values: unknown[]): string[] {
  return [...new Set([...STAFF_POSITIONS, ...values.map(normalizeStaffPosition).filter(Boolean)])];
}

export const STAFF_DEPARTMENTS = [
  { role: 'HCNS', label: 'Hành chính nhân sự (HCNS)' },
  { role: 'QLCN', label: 'Quản lý công nợ' },
  { role: 'KT', label: 'Kế toán (KT)' },
  { role: 'BPSC', label: 'BPSC' },
  { role: 'TLS', label: 'Telesales (TLS)' },
  { role: 'NVKD', label: 'PKD trụ sở công ty' },
];

export const staffRoles = (position: unknown) => normalizeStaffPosition(position).split(' / ').filter(Boolean);
export function branchStaffPosition(position: unknown): string {
  const roles = staffRoles(position).filter(role => !['HCNS', 'QLCN', 'KT', 'BPSC', 'TLS'].includes(role));
  return roles.join(' / ') || normalizeStaffPosition(position);
}
