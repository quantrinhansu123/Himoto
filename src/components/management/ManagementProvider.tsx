'use client';

import { createContext, useCallback, useContext, useEffect, useState, useMemo, useSyncExternalStore, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { createManagementRepository } from '@/lib/management/repository';
import { ContractEdits, CustomerAssignment, EditableKind, ManagementDataset, ManagementKind, ManagementRepository, ManagementRow } from '@/lib/management/types';
import { createManagementDataLoader, managementKindsForPath, ResourceState } from '@/lib/management/data-loader';
import { ContractAutofillRepository, createApiAutofillRepository } from '@/lib/management/contract-autofill';
import { CustomerDetails } from '@/lib/management/contract-document';
import { StoreCreation, StoreEdits } from '@/lib/management/store-management';
import { createStoreRecord, deleteStoreRecord, updateStoreRecord } from '@/lib/management/store-repository';
import { updateCustomerBlacklist } from '@/lib/management/customer-blacklist';
import { CUSTOMER_STATUSES } from '@/lib/management/config';
import type { PaymentContext } from '@/lib/management/contract-payments';

interface ManagementContextValue {
  dataset: ManagementDataset | null;
  loading: boolean;
  refreshing: boolean;
  error: string;
  resources: Record<ManagementKind, ResourceState>;
  source: 'api';
  canSaveContractDrafts: boolean;
  selectedStore: string;
  selectStore: (id: string) => void;
  reload: (kinds?: readonly ManagementKind[]) => Promise<void>;
  ensureData: (kinds: readonly ManagementKind[], force?: boolean) => Promise<void>;
  invalidateData: (kinds: readonly ManagementKind[]) => void;
  save: (kind: EditableKind, row: ManagementRow) => Promise<void>;
  notify: (message: string) => void;
  contractAutofill: ContractAutofillRepository;
  createCustomer: (customer: CustomerDetails, assignment?: CustomerAssignment) => Promise<ManagementRow>;
  updateCustomer: (customer: ManagementRow) => Promise<ManagementRow>;
  deleteCustomer: (id: number) => Promise<void>;
  setCustomerBlacklist: (customer: ManagementRow, blacklisted: boolean) => Promise<void>;
  acceptImportedCustomers: (count: number) => Promise<void>;
  updateStore: (id: number, edits: StoreEdits) => Promise<void>;
  createStore: (store: StoreCreation) => Promise<void>;
  deleteStore: (id: number) => Promise<void>;
  cloneContract: (id: number) => Promise<ManagementRow>;
  saveContract: (id: number, edits: ContractEdits) => Promise<ManagementRow>;
  saveContractDraft: (id: number | null, edits: ContractEdits) => Promise<ManagementRow>;
  acceptContractPayment: (context: PaymentContext) => void;
}
const ManagementContext = createContext<ManagementContextValue | null>(null);

export function ManagementProvider({ children }: { children: ReactNode }) {
  const [repository] = useState<ManagementRepository>(createManagementRepository);
  const [loader] = useState(() => createManagementDataLoader(repository));
  const { dataset, resources } = useSyncExternalStore(loader.subscribe, loader.getSnapshot, loader.getSnapshot);
  const pathname = usePathname();
  const requiredKinds = managementKindsForPath(pathname);
  const loading = requiredKinds.some(kind => !resources[kind].loaded && !resources[kind].error);
  const refreshing = requiredKinds.some(kind => resources[kind].loaded && resources[kind].loading);
  const error = requiredKinds.map(kind => resources[kind].error).filter(Boolean).join(' ');
  const contractAutofill = useMemo(() => createApiAutofillRepository('/api'), []);
  const [selectedStore, selectStore] = useState('all');
  const [notification, notify] = useState('');

  const ensureData = useCallback((kinds: readonly ManagementKind[], force = false) => loader.ensure(kinds, force), [loader]);
  const invalidateData = useCallback((kinds: readonly ManagementKind[]) => loader.invalidate(kinds), [loader]);
  const reload = useCallback(async (kinds?: readonly ManagementKind[]) => {
    const targets = kinds || requiredKinds.filter(kind => kind !== 'stores' || requiredKinds.length === 1 || !loader.getSnapshot().resources.stores.loaded || loader.getSnapshot().resources.stores.error);
    try { await loader.ensure(targets, true); } catch { /* Each failed resource exposes its own error and retry. */ }
  }, [loader, requiredKinds]);
  useEffect(() => { void ensureData(requiredKinds).catch(() => {}); }, [ensureData, requiredKinds, pathname]);
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => notify(''), 5000);
    return () => clearTimeout(timer);
  }, [notification]);

  const save = async (kind: EditableKind, row: ManagementRow) => {
    const result = await repository.save(kind, row);
    loader.update(kind, () => result[kind]);
    notify('Đã cập nhật dữ liệu trên hệ thống.');
  };
  const cloneContract = async (id: number) => {
    const result = await repository.cloneContract(id);
    loader.update('contracts', rows => [result.row, ...rows.filter(row => row.id !== result.row.id)]);
    notify(`Đã sao chép thành ${result.row.code} · ID ${result.row.id}. Đang mở form chỉnh sửa.`);
    return result.row;
  };
  const saveContract = async (id: number, edits: ContractEdits) => {
    const result = await repository.saveContract(id, edits);
    loader.update('contracts', rows => rows.map(row => row.id === result.row.id ? result.row : row));
    notify(`Đã lưu ${result.row.code}.`);
    return result.row;
  };
  const saveContractDraft = async (id: number | null, edits: ContractEdits) => {
    const result = await repository.saveContractDraft(id, edits);
    loader.update('contracts', rows => [result.row, ...rows.filter(row => row.id !== result.row.id)]);
    invalidateData(['customers']);
    notify(`Đã lưu nháp ${result.row.code} vào Supabase. Mở mục Log để tiếp tục chỉnh sửa.`);
    return result.row;
  };
  const createCustomer = async (customer: CustomerDetails, assignment?: CustomerAssignment) => {
    const row = await contractAutofill.createCustomer(customer, assignment);
    loader.update('customers', rows => [row, ...rows.filter(item => item.id !== row.id)]);
    notify('Đã tạo khách hàng trong Supabase.');
    return row;
  };
  const updateCustomer = async (customer: ManagementRow) => {
    const updated = await contractAutofill.updateCustomer(customer);
    const current = dataset?.customers.find(item => item.id === updated.id);
    const row = { ...updated, code: customer.code, store_name: dataset?.stores.find(store => store.id === updated.store_id)?.name || '', contract_count: current?.contract_count ?? customer.contract_count ?? 0 };
    loader.update('customers', rows => rows.map(item => item.id === row.id ? row : item));
    invalidateData(['contracts']);
    notify('Đã cập nhật hồ sơ khách hàng trong Supabase.');
    return row;
  };
  const deleteCustomer = async (id: number) => {
    await contractAutofill.deleteCustomer(id);
    loader.update('customers', rows => rows.filter(item => item.id !== id));
    notify('Đã xóa hồ sơ khách hàng khỏi Supabase.');
  };
  const setCustomerBlacklist = async (customer: ManagementRow, blacklisted: boolean) => {
    const changes = await updateCustomerBlacklist(customer, blacklisted);
    loader.update('customers', rows => rows.map(row => row.id === customer.id ? { ...row, ...changes } : row));
    invalidateData(['contracts']);
    notify(blacklisted ? `Đã đưa ${customer.name} vào Blacklist.` : `Đã bỏ Blacklist cho ${customer.name}. Trạng thái: ${CUSTOMER_STATUSES.find(option => option.value === changes.status)?.label}.`);
  };
  const acceptImportedCustomers = async (count: number) => {
    invalidateData(['contracts']);
    await reload(['customers']);
    notify(`Đã nhập ${count} khách hàng từ Excel vào Supabase.`);
  };
  const updateStore = async (id: number, edits: StoreEdits) => {
    const row = await updateStoreRecord(id, edits);
    loader.update('stores', rows => rows.map(store => store.id === id ? row : store));
    for (const kind of ['customers', 'staff', 'vehicles', 'contracts'] as const) loader.update(kind, rows => rows.map(record => record.store_id === id ? { ...record, store_name: row.name } : record));
    notify('Đã cập nhật cơ sở trong Supabase.');
  };
  const createStore = async (store: StoreCreation) => {
    const row = await createStoreRecord(store);
    loader.update('stores', rows => [row, ...rows.filter(record => record.id !== row.id)]);
    selectStore('all');
    notify(`Đã tạo cơ sở ${row.name} · ${row.code} trong Supabase.`);
  };
  const deleteStore = async (id: number) => {
    await deleteStoreRecord(id);
    loader.update('stores', rows => rows.filter(store => store.id !== id));
    if (selectedStore === String(id)) selectStore('all');
    notify('Đã xóa cơ sở khỏi Supabase.');
  };
  const acceptContractPayment = (context: PaymentContext) => {
    loader.update('contracts', rows => rows.map(row => row.id === context.id ? { ...row,
      total_amount: context.total_amount ?? undefined, paid_amount: context.paid_amount ?? undefined, draft_revision: context.revision,
      end_date: context.end_date ?? undefined,
      company_paid_amount: context.company_paid_amount, company_payment_count: context.company_payment_count } : row));
  };
  return <ManagementContext.Provider value={{ dataset, resources, loading, refreshing, error, source: 'api', canSaveContractDrafts: Boolean(repository.supportsContractDrafts), selectedStore, selectStore, reload, ensureData, invalidateData, save, notify, contractAutofill, createCustomer, updateCustomer, deleteCustomer, setCustomerBlacklist, acceptImportedCustomers, updateStore, createStore, deleteStore, cloneContract, saveContract, saveContractDraft, acceptContractPayment }}>
    {children}
    {notification && <div className="mg-toast" role="status"><span>{notification}</span><button type="button" onClick={() => notify('')} aria-label="Đóng thông báo">×</button></div>}
  </ManagementContext.Provider>;
}

export function useManagement() {
  const context = useContext(ManagementContext);
  if (!context) throw new Error('ManagementProvider is required.');
  return context;
}
