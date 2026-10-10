import type { ContractRelative } from './contract-document';

export function parseCustomerRelatives(input: unknown): ContractRelative[] {
  if (!Array.isArray(input) || input.length > 2) throw new Error('Thông tin người thân phải gồm tối đa hai người.');
  return input.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Thông tin người thân không hợp lệ.');
    const row = item as Record<string, unknown>;
    const relative = { name: '', relationship: '', phone: '' };
    for (const key of ['name', 'relationship', 'phone'] as const) {
      if (typeof row[key] !== 'string' || row[key].length > (key === 'phone' ? 50 : 200)) throw new Error(`Thông tin người thân ${index + 1} không hợp lệ.`);
      relative[key] = row[key].trim();
    }
    if ((relative.relationship || relative.phone) && !relative.name) throw new Error(`Nhập họ tên người thân ${index + 1}.`);
    if (relative.phone && !/^\+?\d{9,13}$/.test(relative.phone.replace(/[\s.()-]/g, ''))) throw new Error(`SĐT người thân ${index + 1} phải có 9–13 chữ số.`);
    return relative;
  }).filter(relative => relative.name || relative.relationship || relative.phone);
}
