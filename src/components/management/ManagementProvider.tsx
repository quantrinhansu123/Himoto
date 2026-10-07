'use client';

import { createContext, useCallback, useContext, useEffect, useState, useMemo, ReactNode } from 'react';
import { createManagementRepository } from '@/lib/management/repository';
import { ContractEdits, CustomerAssignment, EditableKind, ManagementDataset, ManagementRepository, ManagementRow } from '@/lib/management/types';
import { ContractAutofillRepository, createApiAutofillRepository } from '@/lib/management/contract-autofill';
import { CustomerDetails } from '@/lib/management/contract-document';
import { StoreCreation, StoreEdits } from '@/lib/management/store-management';
import { createStoreRecord, deleteStoreRecord, updateStoreRecord } from '@/lib/management/store-repository';

interface ManagementContextValue {
  dataset: ManagementDataset | null;
  loading: boolean;
  error: string;
  source: 'api';
  canSaveContractDrafts: boolean;
  selectedStore: string;
  selectStore: (id: string) => void;
  reload: () => Promise<void>;
  save: (kind: EditableKind, row: ManagementRow) => Promise<void>;
  notify: (message: string) => void;
  contractAutofill: ContractAutofillRepository;
  createCustomer: (customer: CustomerDetails, assignment?: CustomerAssignment) => Promise<ManagementRow>;
  updateCustomer: (customer: ManagementRow) => Promise<ManagementRow>;
  deleteCustomer: (id: number) => Promise<void>;
  acceptImportedCustomers: (count: number) => Promise<void>;
  updateStore: (id: number, edits: StoreEdits) => Promise<void>;
  createStore: (store: StoreCreation) => Promise<void>;
  deleteStore: (id: number) => Promise<void>;
  cloneContract: (id: number) => Promise<ManagementRow>;
  saveContract: (id: number, edits: ContractEdits) => Promise<ManagementRow>;
  saveContractDraft: (id: number | null, edits: ContractEdits) => Promise<ManagementRow>;
}
const ManagementContext = createContext<ManagementContextValue | null>(null);

export function ManagementProvider({ children }: { children: ReactNode }) {
  const [repository] = useState<ManagementRepository>(createManagementRepository);
  const contractAutofill = useMemo(() => createApiAutofillRepository('/api'), []);
  const [dataset, setDataset] = useState<ManagementDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedStore, selectStore] = useState('all');
  const [notification, notify] = useState('');

  const reload = useCallback(async () => {
    setLoading(true); setError(''); setDataset(null);
    try { setDataset(await repository.load()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được dữ liệu. Vui lòng thử lại.'); }
    finally { setLoading(false); }
  }, [repository]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => notify(''), 5000);
    return () => clearTimeout(timer);
  }, [notification]);

  const save = async (kind: EditableKind, row: ManagementRow) => {
    setDataset(await repository.save(kind, row));
    notify('Đã cập nhật dữ liệu trên hệ thống.');
  };
  const cloneContract = async (id: number) => {
    const result = await repository.cloneContract(id);
    setDataset(result.dataset);
    notify(`Đã sao chép thành ${result.row.code} · ID ${result.row.id}. Đang mở form chỉnh sửa.`);
    return result.row;
  };
  const saveContract = async (id: number, edits: ContractEdits) => {
    const result = await repository.saveContract(id, edits);
    setDataset(result.dataset);
    notify(`Đã lưu ${result.row.code}.`);
    return result.row;
  };
  const saveContractDraft = async (id: number | null, edits: ContractEdits) => {
    const result = await repository.saveContractDraft(id, edits);
    setDataset(current => current ? { ...current, contracts: result.dataset.contracts } : result.dataset);
    notify(`Đã lưu nháp ${result.row.code} vào Supabase. Mở mục Log để tiếp tục chỉnh sửa.`);
    return result.row;
  };
  const createCustomer = async (customer: CustomerDetails, assignment?: CustomerAssignment) => {
    const row = await contractAutofill.createCustomer(customer, assignment);
    setDataset(current => {
      if (!current) return current;
      const next = { ...current, customers: [row, ...current.customers.filter(item => item.id !== row.id)] };
      return next;
    });
    notify('Đã tạo khách hàng trong Supabase.');
    return row;
  };
  const updateCustomer = async (customer: ManagementRow) => {
    const updated = await contractAutofill.updateCustomer(customer);
    const current = dataset?.customers.find(item => item.id === updated.id);
    const row = { ...updated, code: customer.code, store_name: dataset?.stores.find(store => store.id === updated.store_id)?.name || '', contract_count: current?.contract_count ?? customer.contract_count ?? 0 };
    setDataset(current => current ? { ...current, customers: current.customers.map(item => item.id === row.id ? row : item) } : current);
    notify('Đã cập nhật hồ sơ khách hàng trong Supabase.');
    return row;
  };
  const deleteCustomer = async (id: number) => {
    await contractAutofill.deleteCustomer(id);
    setDataset(current => current ? { ...current, customers: current.customers.filter(item => item.id !== id) } : current);
    notify('Đã xóa hồ sơ khách hàng khỏi Supabase.');
  };
  const acceptImportedCustomers = async (count: number) => {
    await reload();
    notify(`Đã nhập ${count} khách hàng từ Excel vào Supabase.`);
  };
  const updateStore = async (id: number, edits: StoreEdits) => {
    const row = await updateStoreRecord(id, edits);
    setDataset(current => {
      if (!current) return current;
      const next = { ...current, stores: current.stores.map(store => store.id === id ? row : store) };
      for (const kind of ['customers', 'staff', 'vehicles', 'contracts'] as const) next[kind] = next[kind].map(record => record.store_id === id ? { ...record, store_name: row.name } : record);
      return next;
    });
    notify('Đã cập nhật cơ sở trong Supabase.');
  };
  const createStore = async (store: StoreCreation) => {
    const row = await createStoreRecord(store);
    setDataset(current => current ? { ...current, stores: [row, ...current.stores.filter(record => record.id !== row.id)] } : current);
    selectStore('all');
    notify(`Đã tạo cơ sở ${row.name} · ${row.code} trong Supabase.`);
  };
  const deleteStore = async (id: number) => {
    await deleteStoreRecord(id);
    setDataset(current => current ? { ...current, stores: current.stores.filter(store => store.id !== id) } : current);
    if (selectedStore === String(id)) selectStore('all');
    notify('Đã xóa cơ sở khỏi Supabase.');
  };
  return <ManagementContext.Provider value={{ dataset, loading, error, source: 'api', canSaveContractDrafts: Boolean(repository.supportsContractDrafts), selectedStore, selectStore, reload, save, notify, contractAutofill, createCustomer, updateCustomer, deleteCustomer, acceptImportedCustomers, updateStore, createStore, deleteStore, cloneContract, saveContract, saveContractDraft }}>
    {children}
    {notification && <div className="mg-toast" role="status"><span>{notification}</span><button type="button" onClick={() => notify('')} aria-label="Đóng thông báo">×</button></div>}
  </ManagementContext.Provider>;
}

export function useManagement() {
  const context = useContext(ManagementContext);
  if (!context) throw new Error('ManagementProvider is required.');
  return context;
}
