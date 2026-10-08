import { CustomerImportStore, importText } from './customer-import';

export const CUSTOMER_STORE_BATCH_SIZE = 1000;
export const CUSTOMER_STORE_MAX_ROW = 1_048_576;
export const CUSTOMER_STORE_DUPLICATE = 'Căn cước trùng trong file. Chỉ giữ một dòng cho mỗi khách hàng.';

export interface CustomerStoreInput {
  rowNumber: number;
  values: { id_card: string; store: string };
  errors?: string[];
}
export interface CustomerStoreExisting {
  id: number;
  name: string;
  id_card: string | null;
  store_id: number | null;
}
export interface CustomerStoreRow {
  rowNumber: number;
  values: CustomerStoreInput['values'];
  customer_id: number | null;
  customer_name: string;
  previous_store_id: number | null;
  previous_store_name: string;
  store_id: number | null;
  store_name: string;
  state: 'ready' | 'unchanged' | 'invalid';
  errors: string[];
}
export interface CustomerStoreResult {
  rows: CustomerStoreRow[];
  total: number;
  ready: number;
  unchanged: number;
  invalid: number;
  updated: number;
  committed: boolean;
  revision: string;
}

export function matchCustomerStores(inputs: CustomerStoreInput[], stores: CustomerImportStore[], customers: CustomerStoreExisting[]): CustomerStoreRow[] {
  const fileCards = new Map<string, number[]>();
  const existingCards = new Map<string, CustomerStoreExisting[]>();
  for (const input of inputs) {
    const card = input.values.id_card.replace(/\s/g, '');
    if (card) fileCards.set(card, [...(fileCards.get(card) || []), input.rowNumber]);
  }
  for (const customer of customers) {
    const card = customer.id_card?.replace(/\s/g, '');
    if (card) existingCards.set(card, [...(existingCards.get(card) || []), customer]);
  }
  return inputs.map(input => {
    const values = { id_card: input.values.id_card.replace(/\s/g, ''), store: input.values.store.trim() };
    const errors = [...(input.errors || [])];
    if (!/^(\d{9}|\d{12})$/.test(values.id_card)) errors.push('Căn cước cần 12 chữ số; CMND cần 9 chữ số. Giữ nguyên số 0 đầu.');
    if (!values.store) errors.push('Thiếu cơ sở.');
    if (values.store.length > 255) errors.push('Cơ sở vượt 255 ký tự.');
    const branches = values.store ? stores.filter(store => String(store.id) === values.store || importText(store.name) === importText(values.store) || (store.code && importText(store.code) === importText(values.store))) : [];
    const branch = branches.length === 1 ? branches[0] : null;
    if (values.store && !branch) errors.push('Cơ sở không tồn tại hoặc tên bị trùng. Dùng tên, mã hoặc ID trong sheet Cơ sở.');
    if ((fileCards.get(values.id_card)?.length || 0) > 1 && !errors.includes(CUSTOMER_STORE_DUPLICATE)) errors.push(CUSTOMER_STORE_DUPLICATE);
    const matches = existingCards.get(values.id_card) || [];
    const customer = matches.length === 1 ? matches[0] : null;
    if (values.id_card && !customer) errors.push(matches.length ? 'Căn cước khớp nhiều hồ sơ khách hàng. Cần đối chiếu trước.' : 'Không tìm thấy khách hàng có căn cước này.');
    const previousStore = stores.find(store => store.id === customer?.store_id);
    return {
      rowNumber: input.rowNumber, values, customer_id: customer?.id ?? null, customer_name: customer?.name || '',
      previous_store_id: customer?.store_id ?? null, previous_store_name: previousStore?.name || (customer?.store_id != null ? `Cơ sở #${customer.store_id}` : ''),
      store_id: branch?.id ?? null, store_name: branch?.name || '',
      state: errors.length ? 'invalid' : customer?.store_id === branch?.id ? 'unchanged' : 'ready', errors,
    };
  });
}
