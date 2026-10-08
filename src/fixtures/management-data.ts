import { INITIAL_STORES, INITIAL_STAFF, INITIAL_CUSTOMERS, INITIAL_VEHICLES, INITIAL_CONTRACTS } from './himoto-fixtures';
import { ManagementDataset, ManagementRow } from '@/lib/management/types';

// Deliberately synthetic identities; the original, pre-existing fixtures stay untouched.
const names = ['Nguyễn Minh An', 'Trần Hoài Linh', 'Lê Quang Huy', 'Phạm Ngọc Anh', 'Vũ Đức Minh', 'Đặng Thanh Hà', 'Bùi Gia Bảo', 'Hoàng Thu Trang', 'Đỗ Hải Nam', 'Mai Phương Thảo', 'Phan Tuấn Kiệt', 'Võ Khánh Chi'];
const pad = (value: number) => String(value).padStart(3, '0');
const phone = (id: number) => `090000${String(id).padStart(4, '0')}`;
const vehicleStatus: Record<string, string> = { rent: 'using', maintenance: 'repairing', holding: 'pending' };
const vehicleType: Record<string, string> = { scooter: 'xega', manual: 'xeso', clutch: 'xecon', electric: 'electric' };

export function createDemoDataset(): ManagementDataset {
  const stores: ManagementRow[] = INITIAL_STORES.map((s, i) => ({
    ...s, name: s.store_name.replace(/^Cơ sở \d+ - /, ''),
    phone: `0240000${String(i + 1).padStart(4, '0')}`, email: `coso${s.id}@example.test`,
    address: `Địa chỉ mẫu ${i + 1}, ${s.store_name.replace(/^Cơ sở \d+ - /, '')}, Hà Nội`,
    manager_name: names[i], notes: 'Thông tin minh họa, không phải dữ liệu vận hành.',
  }));
  const staff: ManagementRow[] = Array.from({ length: 28 }, (_, i) => {
    const source = INITIAL_STAFF[i % INITIAL_STAFF.length];
    const store = stores[i % stores.length];
    return { ...source, id: i + 1, code: `NV-${pad(i + 1)}`, name: names[i % names.length],
      phone: phone(i + 1), email: `nhansu${i + 1}@example.test`, position: source.role_name,
      store_id: store.id, store_name: store.name, status: i % 11 === 10 ? 'inactive' : 'active',
      hire_date: '2026-01-15', created_at: '2026-01-15' };
  });
  const customers: ManagementRow[] = Array.from({ length: 32 }, (_, i) => {
    const source = INITIAL_CUSTOMERS[i % INITIAL_CUSTOMERS.length];
    const store = stores[i % stores.length];
    return { ...source, id: i + 1, code: `KH-${pad(i + 1)}`, name: names[(i + 3) % names.length],
      phone: phone(i + 101), email: `khachhang${i + 1}@example.test`, id_card: `DEMO-${String(i + 1).padStart(6, '0')}`,
      address: `Địa chỉ mẫu ${i + 1}, Hà Nội`, store_id: store.id, store_name: store.name,
      status: i % 13 === 12 ? 'blacklist' : i % 9 === 8 ? 'warning' : 'active',
      birthday: '1995-05-20', id_card_issued_on: '2024-01-15', id_card_issued_by: 'Nơi cấp mẫu',
      relatives_json: JSON.stringify([{ name: 'Người thân mẫu', relationship: 'Mẹ', phone: '0900000099' }, { name: 'Người thân hai', relationship: 'Anh', phone: '0900000088' }]),
      relatives_text: 'Người thân mẫu (Mẹ): 0900000099 - Và: Người thân hai (Anh): 0900000088',
      warning_note: i % 13 === 12 ? 'Ghi chú mẫu: khách nợ xấu.' : i % 9 === 8 ? 'Ghi chú mẫu: cần kiểm tra thông tin liên hệ.' : '',
      created_at: '2026-09-01' };
  });
  const vehicles: ManagementRow[] = Array.from({ length: 40 }, (_, i) => {
    const source = INITIAL_VEHICLES[i % INITIAL_VEHICLES.length];
    const store = stores[i % stores.length];
    return { ...source, id: i + 1, code: `XE-${pad(i + 1)}`, license: `DEMO-${pad(i + 1)}`,
      status: vehicleStatus[source.status] || source.status, type: vehicleType[source.type] || source.type,
      store_id: store.id, store_name: store.name, created_at: '2026-09-01' };
  });
  const contracts: ManagementRow[] = Array.from({ length: 32 }, (_, i) => {
    const source = INITIAL_CONTRACTS[i % INITIAL_CONTRACTS.length];
    const customer = customers[(source.customer_id - 1 + Math.floor(i / INITIAL_CONTRACTS.length) * 16) % customers.length];
    const vehicle = vehicles[(source.vehicle_id - 1 + Math.floor(i / INITIAL_CONTRACTS.length) * 20) % vehicles.length];
    return { ...source, id: i + 1, code: `HD-2610-${pad(i + 1)}`, name: `HD-2610-${pad(i + 1)}`,
      customer_id: customer.id, customer_name: customer.name, customer_phone: customer.phone,
      customer_id_card: customer.id_card, vehicle_id: vehicle.id, vehicle_name: vehicle.name,
      license: vehicle.license, store_id: vehicle.store_id, store_name: vehicle.store_name,
      notes: 'Hợp đồng minh họa. Số tiền được lấy từ fixture, không tính lại nghiệp vụ.' };
  });
  // Explicit fixture snapshot: vehicles on active demo contracts are in use.
  const snapshotVehicles = vehicles.map(vehicle => {
    const active = contracts.some(row => row.vehicle_id === vehicle.id && ['renting', 'overdue'].includes(row.status));
    const reserved = contracts.some(row => row.vehicle_id === vehicle.id && row.status === 'pending');
    return { ...vehicle, status: active ? 'using' : reserved ? 'pending' : vehicle.status };
  });
  return reconcileDataset({ stores, staff, customers, vehicles: snapshotVehicles, contracts });
}

/** Derive counts and labels from relationships after editing the demo. */
export function reconcileDataset(dataset: ManagementDataset): ManagementDataset {
  const stores = dataset.stores.map(s => ({ ...s,
    vehicle_count: dataset.vehicles.filter(v => v.store_id === s.id).length,
    staff_count: dataset.staff.filter(v => v.store_id === s.id).length,
  }));
  const withStore = (row: ManagementRow): ManagementRow => ({ ...row, store_name: stores.find(s => s.id === row.store_id)?.name ?? row.store_name });
  const contracts: ManagementRow[] = dataset.contracts.map(row => {
    // Saved contracts retain their own customer/vehicle snapshot, independently of master data edits.
    if (row.draft_json) return row;
    const customer = dataset.customers.find(c => c.id === row.customer_id);
    const vehicle = dataset.vehicles.find(v => v.id === row.vehicle_id);
    // A contract's originating branch does not change when a vehicle moves.
    return { ...withStore(row), customer_name: customer?.name ?? row.customer_name,
      customer_phone: customer?.phone ?? row.customer_phone,
      customer_id_card: customer?.id_card ?? row.customer_id_card,
      vehicle_name: vehicle?.name ?? row.vehicle_name, license: vehicle?.license ?? row.license };
  });
  return { stores, staff: dataset.staff.map(withStore), vehicles: dataset.vehicles.map(withStore), contracts,
    customers: dataset.customers.map(c => ({ ...withStore(c), contract_count: contracts.filter(r => r.customer_id === c.id).length })) };
}
