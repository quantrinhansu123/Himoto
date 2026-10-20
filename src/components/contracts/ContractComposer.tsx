'use client';

import { FormEvent, Fragment, ReactNode, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { CheckCircle2, ChevronLeft, ChevronRight, LoaderCircle, Plus, Printer, Save, Search, Trash2, UserPlus } from 'lucide-react';
import { Dialog } from '@/components/management/Dialog';
import { SuggestionInput } from '@/components/management/SuggestionInput';
import { useManagement } from '@/components/management/ManagementProvider';
import { ContractDraft, ContractRelative, CustomerDetails, LegacyContractDocument, buildContractDocument, contractStaffStoreId, createContractDraft, customerDetails, emptyVehicle, formatRelatives, normalizeIdCard, pairRelatives, relativesFromRow, staffIsAvailable, staffMatchesStore, validateContractDraft, validateOperationalDraft, validateReservationDraft, vehicleDetails } from '@/lib/management/contract-document';
import { documentRequirements } from '@/lib/management/contract-requirements';
import { hasSalesCommissionRole, staffRoles } from '@/lib/management/staff-positions';
import { contractProfile,saveContractProfile } from '@/lib/management/contract-profile';
import { ManagementRow } from '@/lib/management/types';
import { CONTRACT_STATUSES, CONTRACT_TYPES } from '@/lib/management/config';
import { mapApiRow } from '@/lib/management/repository';
import { validateDraftSave } from '@/lib/management/contract-drafts';
import { CustomerCreateDialog } from './CustomerCreateDialog';
import { ContractPrintPreview } from './ContractPrintPreview';
import { VehiclePicker } from './VehiclePicker';
import { ContractFinalizeDialog } from './ContractFinalizeDialog';
import { FinalizeResult, draftPaymentMethods } from '@/lib/management/contract-finalize';
import { chargeTotal, type ContractCharge } from '@/lib/management/contract-charges';
import { PAYMENT_METHODS, paymentMethodLabel, type PaymentMethod } from '@/lib/management/contract-payments';
import { CONTRACT_FORM_SECTIONS, ContractSection, ContractSectionTabs } from './ContractSectionTabs';
import { DateTime24Field } from './DateTime24Field';
import { VietnamDateField } from './VietnamDateField';
import { PaymentMethodPicker } from './PaymentMethodPicker';
import { addRentalDays, rentalDayCount } from '@/lib/management/rental-time';
import { addRentalMonths, billingInterval, OWNERSHIP_TERMS, rentalPeriodCount } from '@/lib/management/contract-billing';
import { CustomerInternationalFields } from './CustomerInternationalFields';
import { contractPhotoSlots } from '@/lib/management/contract-photos';
import { normalizeCustomerLookup,validCustomerLookup } from '@/lib/management/contract-document';
import { RecordPhotoFields } from '@/components/management/RecordPhotoFields';
import { CUSTOMER_PHOTO_SLOTS, PendingPhotos, saveRecordPhotos,copyCustomerPhotosToContract } from '@/lib/management/record-photos';
import { usePhotoOcr } from '@/components/management/usePhotoOcr';
import { mergeOcrCustomer, OCR_CUSTOMER_KEYS, plateKey, type OcrFields } from '@/lib/management/photo-ocr';
import { useContractTypes } from './ContractTypesProvider';
import { ContractTypeManager } from './ContractTypeManager';
import type { ContractType } from '@/lib/management/contract-types';
import { SelectedVehicleGps,useSelectedVehicleGps } from '@/components/management/SelectedVehicleGps';

type LookupState = 'idle' | 'loading' | 'found' | 'matches' | 'missing' | 'error';
function rentalTermMonths(rentalType: string) {
  return Number(/^monthly_(\d+)$/.exec(rentalType)?.[1] || 0);
}
function customerStatusLabel(status?: string) {
  const value = String(status || '').toLowerCase();
  if (['blacklist', 'bad_debt', 'blocked'].includes(value)) return 'Cảnh báo: khách hàng bị chặn / có nợ xấu';
  if (['warning', 'warning_note'].includes(value)) return 'Có cảnh báo';
  if (['active', '1'].includes(value)) return 'Đang hoạt động';
  if (['draft', '0'].includes(value)) return 'Hồ sơ nháp';
  return status ? `Trạng thái: ${status}` : 'Chưa có trạng thái';
}
const formatMoneyInput = (value: string) => value.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export function ContractComposer({ row, mode = 'print', onClose, onDraftSaved, onFinalized }: { row?: ManagementRow | null; mode?: 'print' | 'edit' | 'draft' | 'reservation'; onClose: () => void; onDraftSaved?: () => void; onFinalized?: (result: FinalizeResult) => void }) {
  const pathname = usePathname();
  const ownershipPage = pathname.startsWith('/contracts/ownership');
  const { dataset, selectedStore, source, canSaveContractDrafts, canFinalizeContracts, contractAutofill, saveContract, saveContractDraft, ensureData } = useManagement();
  const [attributionError,setAttributionError] = useState('');
  const [salesDirectory,setSalesDirectory] = useState<ManagementRow[]>([]);
  const [profileRevision,setProfileRevision] = useState(String(row?.draft_revision || ''));
  const [profileMessage,setProfileMessage] = useState('');
  useEffect(()=>{
    const controller=new AbortController();
    void contractAutofill.loadSalesStaff(controller.signal)
      .then(rows=>{if(!controller.signal.aborted){setSalesDirectory(rows);setAttributionError('');}})
      .catch(cause=>{if(!controller.signal.aborted)setAttributionError(cause instanceof Error?cause.message:'Không tải được nhân viên ghi nhận doanh số.');});
    return()=>controller.abort();
  },[contractAutofill]);
  const [savedDraft, setSavedDraft] = useState<{ id: number; revision: string } | null>(null);
  const [finalizeTarget, setFinalizeTarget] = useState<{ id: number; revision: string; code: string } | null>(null);
  const editingDraft = mode === 'draft' || mode === 'reservation' || row?.status === 'draft';
  const canSaveDraft = !row || row.status === 'draft';
  const catalog = useContractTypes();
  const [typeManagerOpen, setTypeManagerOpen] = useState(false);
  const [draft, setDraft] = useState<ContractDraft>(() => {
    const initial = createContractDraft(dataset!, selectedStore, row);
    if (mode === 'reservation' && !row) {
      initial.reservation = true; initial.start_date = addRentalDays(initial.start_date, '1'); initial.end_date = addRentalDays(initial.start_date, '1');
    }
    return initial;
  });
  const [salesText, setSalesText] = useState<string | null>(null);
  const selectedGps=useSelectedVehicleGps(draft.vehicles.map(vehicle=>vehicle.id));
  // Commission picker mirrors "Nguồn khách" until the user picks someone directly.
  const salesFollowsSource = useRef(!draft.sales_staff_id && !draft.tls_staff_id);
  const reserving = canSaveDraft && Boolean(draft.reservation);
  const [rentalDays, setRentalDays] = useState(() => rentalDayCount(draft.start_date,draft.end_date));
  const [autoReturn, setAutoReturn] = useState(!row);
  const staffStoreId = contractStaffStoreId(draft);
  // A finalized contract (or one of its versions) keeps its ledger total until the user edits dates, price or the first vehicle.
  const livePricing = useRef(row && row.status !== 'draft' ? { start: draft.start_date, end: draft.end_date, unit: draft.unit_price, vehicle: draft.vehicles[0]?.id } : null);
  const [idInput, setIdInput] = useState(String(draft.customer_lookup ?? (draft.customer.id_card || draft.customer.phone || '')));
  const preserveCustomer = useRef(Boolean(row && draft.customer_id && draft.customer.name.trim()));
  const [lookupState, setLookupState] = useState<LookupState>(row && draft.customer_id && draft.customer.name.trim() ? 'found' : 'idle');
  const [status, setStatus] = useState(row?.status || 'pending');
  const [rentalType, setRentalType] = useState(String(row?.rental_type || (ownershipPage ? 'ownership' : 'daily')));
  // Ownership / single-branch accounts often open the form before picking a store; seed from their assigned branch so Thêm mới is usable.
  useEffect(() => {
    if (row || !dataset?.stores.length) return;
    const preferred = selectedStore !== 'all' && dataset.stores.some(store => String(store.id) === selectedStore)
      ? selectedStore
      : dataset.stores.length === 1 ? String(dataset.stores[0].id) : '';
    if (!preferred) return;
    setDraft(previous => {
      if (previous.store_id && previous.vehicle_store_id) return previous;
      const store = dataset.stores.find(item => String(item.id) === preferred);
      return {
        ...previous,
        store_id: previous.store_id || preferred,
        vehicle_store_id: previous.vehicle_store_id || preferred,
        customer_source_url: previous.customer_source_url || store?.name || '',
      };
    });
  }, [dataset?.stores, selectedStore, row]);
  useEffect(() => {
    if (row || !catalog.loaded || draft.contract_type_id) return;
    const preferred = ownershipPage ? 'ownership' : 'daily';
    const type = catalog.types.find(type => type.active && type.rental_type === preferred)
      || catalog.types.find(type => type.active && type.rental_type === 'daily')
      || catalog.types.find(type => type.active);
    if (!type) return;
    setDraft(previous => previous.contract_type_id ? previous : { ...previous, contract_type_id: type.id, contract_type_name: type.label,
      contract_type_months: type.term_months === null ? '' : String(type.term_months), ownership: type.rental_type === 'ownership',
      package_name: type.rental_type === 'daily' ? 'Theo ngày' : 'Theo tháng',
      ...(type.term_months ? {end_date:addRentalMonths(previous.start_date,type.term_months)} : {}) });
    setRentalType(previous => previous === 'daily' || previous === 'ownership' ? type.rental_type : previous);
  }, [catalog.loaded, catalog.types, row, draft.contract_type_id, ownershipPage]);
  const [notes, setNotes] = useState(String(row?.notes || ''));
  const [saving, setSaving] = useState(false);
  const [customerPhotos, setCustomerPhotos] = useState<PendingPhotos>({});
  const [transactionMedia,setTransactionMedia]=useState<PendingPhotos>({});
  const [licensePhotos,setLicensePhotos]=useState<PendingPhotos>({});
  const [processingLicense,setProcessingLicense]=useState(false);
  const [processingMedia,setProcessingMedia]=useState(false);
  const [platePhotos, setPlatePhotos] = useState<PendingPhotos>({});
  const [processingCustomerPhoto, setProcessingCustomerPhoto] = useState(false);
  const [processingPlatePhoto, setProcessingPlatePhoto] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);
  const draftRef = useRef(draft); draftRef.current = draft;
  const previousCustomerAi = useRef<OcrFields>({});
  const photoIdentityLookup = useRef('');
  const customerOcr = usePhotoOcr({
    kind: slot => ['driver_license','driver-license'].includes(slot)?'driver_license':draftRef.current.customer.customer_type==='foreign'?'passport':slot === 'id_front' ? 'customer_documents' : 'cccd_back',
    snapshot: () => ({ ...draftRef.current.customer }),
    apply: (_slot, result, before) => {
      const current = draftRef.current;
      const merged = mergeOcrCustomer(current.customer, result.fields, before, previousCustomerAi.current);
      previousCustomerAi.current = { ...previousCustomerAi.current, ...merged.applied };
      const identityChanged = Boolean(merged.applied.id_card && normalizeIdCard(merged.applied.id_card) !== normalizeIdCard(current.customer.id_card));
      const next = { ...current, ...(identityChanged ? {customer_id:null} : {}), customer: merged.customer, vehicles: current.vehicles.map(vehicle => ({ ...vehicle,
        ...(merged.applied.driver_license_number&&(!vehicle.driver_license_number||vehicle.driver_license_number===current.customer.driver_license_number)?{driver_license_number:merged.customer.driver_license_number}:{}),
        ...(merged.applied.driver_license_issued_on&&(!vehicle.driver_license_issued_on||vehicle.driver_license_issued_on===current.customer.driver_license_issued_on)?{driver_license_issued_on:merged.customer.driver_license_issued_on}:{}),
        ...(merged.applied.name && (!vehicle.driver_name || vehicle.driver_name === current.customer.name) ? { driver_name: merged.customer.name } : {}) })) };
      draftRef.current = next; setDraft(next);
      if (identityChanged) {
        setLicensePhotos({});customerOcr.cancel('driver-license');
        // Reuse ordinary customer lookup/status rules for the newly read identity.
        photoIdentityLookup.current = merged.customer.id_card;
        preserveCustomer.current = false; setSelectedCustomer(null); setCustomerMatches([]); setLookupState('idle'); setLookupError('');
        setIdInput(merged.customer.id_card); setLookupRetry(value=>value+1);
      }
      setErrors(current => Object.fromEntries(Object.entries(current).filter(([key]) => !Object.hasOwn(merged.applied, key))));
      return Object.keys(merged.applied).length ? 'Đã điền thông tin từ CCCD. Kiểm tra lại trước khi lưu.' : 'Đã đọc ảnh; giữ nguyên thông tin đang có.';
    },
  });
  const plateOcr = usePhotoOcr({
    kind: () => 'plate', snapshot: () => draftRef.current.vehicles.map(vehicle => vehicle.id),
    apply: (slot, result, before, file) => {
      const license = result.fields.license || '';
      const matches = (dataset?.vehicles || []).filter(vehicle => plateKey(String(vehicle.license || '')) === plateKey(license));
      if (matches.length !== 1) throw new Error(`Đọc được biển số ${license}, ${matches.length ? 'có nhiều xe trùng biển số' : 'chưa tìm thấy xe trong kho'}. Kiểm tra và chọn xe thủ công.`);
      const selected = matches[0], current = draftRef.current;
      if (slot !== 'scan_plate' && slot !== `plate-${selected.id}`) throw new Error(`Ảnh có biển số ${license}, không khớp xe đang chọn. Kiểm tra lại ảnh.`);
      const existing = current.vehicles.findIndex(vehicle => vehicle.id === String(selected.id));
      if (existing < 0) {
        if (slot !== 'scan_plate') throw new Error('Xe đã thay đổi trong lúc AI đọc ảnh. Chụp lại ảnh cho xe đang chọn.');
        const index = before.findIndex(id => !id);
        if (index < 0) throw new Error(`Đọc được biển số ${license}. Bấm Thêm xe để thêm vào hợp đồng, rồi đọc lại ảnh.`);
        if (current.vehicles.length !== before.length || current.vehicles[index]?.id !== before[index]) throw new Error('Lựa chọn xe đã thay đổi trong lúc AI đọc ảnh. Giữ nguyên xe đang chọn; đọc lại ảnh nếu cần.');
        chooseVehicle(index, String(selected.id));
      }
      setPlatePhotos(previous => { const next = { ...previous, [`plate-${selected.id}`]: file }; if (slot === 'scan_plate') delete next.scan_plate; return next; });
      return `Đã đọc biển số ${selected.license} và ${existing < 0 ? 'chọn' : 'đối chiếu'} xe ${selected.name}.`;
    },
  });
  const [saveError, setSaveError] = useState('');
  const busy = useRef(false);
  const [lookupError, setLookupError] = useState('');
  const [lookupRetry, setLookupRetry] = useState(0);
  const [customerMatches, setCustomerMatches] = useState<ManagementRow[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<ManagementRow | null>(() => dataset?.customers.find(customer => customer.id === draft.customer_id) || null);
  const permittedStores=useRef(dataset?.stores);permittedStores.current=dataset?.stores;
  const selectedCustomerStatus = customerStatusLabel(selectedCustomer?.status);
  const [staff, setStaff] = useState<ManagementRow[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState('');
  const [staffRetry, setStaffRetry] = useState(0);
  const [directoryStores, setDirectoryStores] = useState<ManagementRow[]>([]);
  const [inventoryVehicles, setInventoryVehicles] = useState<ManagementRow[]>([]);
  const [inventoryError, setInventoryError] = useState('');
  const [inventoryRetry, setInventoryRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/auth/store-directory', { signal: controller.signal, cache: 'no-store', credentials: 'same-origin' })
      .then(async response => {
        const body = await response.json();
        if (!response.ok || body.status !== 'success' || !Array.isArray(body.data)) throw Error(body.message || 'Không tải được danh sách cơ sở.');
        if (!controller.signal.aborted) setDirectoryStores(body.data.map((row: {
          id: number|string; store_name: string; manager_user_id?: number|string|null; manager_name?: string|null;
          store_phone?: string|null; store_address?: string|null;
        }) => ({
          id: Number(row.id), code: String(row.id), name: String(row.store_name || ''), status: 'active',
          user_id: row.manager_user_id == null || row.manager_user_id === '' ? undefined : Number(row.manager_user_id),
          manager_name: row.manager_name ? String(row.manager_name) : undefined,
          phone: row.store_phone ? String(row.store_phone) : undefined,
          address: row.store_address ? String(row.store_address) : undefined,
        })).filter((row: ManagementRow) => Number.isSafeInteger(row.id) && row.id > 0));
      })
      .catch(() => { if (!controller.signal.aborted) setDirectoryStores([]); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setInventoryError('');
    void fetch('/api/auth/vehicles/inventory', { signal: controller.signal, cache: 'no-store', credentials: 'same-origin' })
      .then(async response => {
        const body = await response.json();
        if (!response.ok || body.status !== 'success' || !Array.isArray(body.data)) throw Error(body.message || 'Không tải được kho xe chung.');
        if (!controller.signal.aborted) {
          setInventoryVehicles(body.data.map((row: Record<string, unknown>) => mapApiRow('vehicles', row)));
        }
      })
      .catch(cause => {
        if (!controller.signal.aborted) {
          setInventoryVehicles([]);
          setInventoryError(cause instanceof Error ? cause.message : 'Không tải được kho xe chung.');
        }
      });
    return () => controller.abort();
  }, [inventoryRetry]);
  const [customerModal, setCustomerModal] = useState(false);
  const [document, setDocument] = useState<LegacyContractDocument | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [section, setSection] = useState<ContractSection>('contract');
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const controller = new AbortController(); let current = true;
    setStaff([]); setStaffError(''); setStaffLoading(Boolean(staffStoreId));
    if (staffStoreId) void contractAutofill.loadStaff(staffStoreId, controller.signal).then(rows => {
      if (!current) return;
      const branch = staffMatchesStore(rows, staffStoreId);
      setStaff(branch); setStaffLoading(false);
      // Người phụ trách đi theo cửa hàng xe: tự chọn nhân sự gắn tài khoản phụ trách cơ sở khi đang trống.
      const managerUserId = directoryStores.find(store => String(store.id) === staffStoreId)?.user_id;
      const manager = managerUserId != null
        ? branch.find(person => staffIsAvailable(person) && Number(person.user_id) === Number(managerUserId))
        : undefined;
      if (!manager) return;
      setDraft(previous => {
        if (previous.staff_id || previous.staff_name.trim()) return previous;
        if (contractStaffStoreId(previous) !== staffStoreId) return previous;
        return { ...previous, staff_id: String(manager.id), staff_name: '' };
      });
    }).catch(cause => { if (current) { setStaffError(cause instanceof Error ? cause.message : 'Không tải được nhân sự.'); setStaffLoading(false); } });
    return () => { current = false; controller.abort(); };
  }, [staffStoreId, contractAutofill, staffRetry, directoryStores]);
  useEffect(() => {
    if (customerModal) return;
    // Opening a copied/saved contract must not replace its snapshot with today's customer profile.
    if (preserveCustomer.current) return;
    const controller = new AbortController(); let current = true;
    setLookupError('');
    const lookupDigits = normalizeCustomerLookup(String(idInput ?? ''));
    if (!validCustomerLookup(lookupDigits)) { setLookupState('idle'); setCustomerMatches([]); return; }
    setLookupState('loading');
    const timer = setTimeout(() => {
      const lookup = contractAutofill.searchCustomers(lookupDigits, controller.signal);
      void lookup.then(customers => {
        if (!current) return;
        setCustomerMatches(customers);
        if (!customers.length || customers.length > 1) {
          setSelectedCustomer(null); setLookupState(customers.length ? 'matches' : 'missing');
          setDraft(previous => ({ ...previous, customer_id: null })); return;
        }
        const customer = customers[0];
        setLookupState('found');
        setSelectedCustomer(customer);
        setDraft(previous => withCustomer(previous, customer));
      }).catch(cause => {
        if (!current) return;
        setSelectedCustomer(null); setLookupState('error'); setLookupError(cause instanceof Error ? cause.message : 'Không tra cứu được khách hàng.');
        setDraft(previous => ({ ...previous, customer_id: null }));
      });
    }, 350);
    return () => { current = false; clearTimeout(timer); controller.abort(); };
  }, [idInput, source, contractAutofill, lookupRetry, customerModal]);

  function withCustomer(previous: ContractDraft, customer: ManagementRow): ContractDraft {
    const relatives = relativesFromRow(customer);
    const stored = customerDetails(customer);
    const keepPhotoIdentity = photoIdentityLookup.current === stored.id_card && previous.customer.id_card === stored.id_card;
    const details = keepPhotoIdentity ? { ...stored, ...Object.fromEntries(OCR_CUSTOMER_KEYS.map(key=>[key,previous.customer[key] || stored[key]])),
      address:previous.customer.address || stored.address } : stored;
    const sourceStoreId = customer.store_id ? String(customer.store_id) : '';
    return { ...previous, vehicle_store_id: contractStaffStoreId(previous), ...(!previous.store_id && sourceStoreId && permittedStores.current?.some(store=>String(store.id)===sourceStoreId) ? { store_id:sourceStoreId, customer_source_url:String(customer.store_name || '') } : {}),
      customer_id: customer.id, relatives, customer: { ...details, relatives_text: formatRelatives(relatives) },
      vehicles: previous.vehicles.map(vehicle => ({ ...vehicle, driver_name: customer.name,
        driver_license_number: details.driver_license_number,
        driver_license_issued_on: details.driver_license_issued_on })) };
  }
  function changeRelative(index: 0 | 1, key: keyof ContractRelative, next: string) {
    setDraft(previous => {
      const relatives = previous.relatives.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: next } : item) as [ContractRelative, ContractRelative];
      return { ...previous, relatives, customer: { ...previous.customer, relatives_text: formatRelatives(relatives) } };
    });
    setErrors(previous => ({ ...previous, [`relative_${index}_${key}`]: '' })); setSaveError('');
  }
  function change<K extends keyof ContractDraft>(key: K, value: ContractDraft[K]) {
    setDraft(previous => ({ ...previous, [key]: value })); setErrors(previous => ({ ...previous, [key]: '' })); setSaveError('');
  }
  function changeSourceStore(storeId: string) {
    setDraft(previous => ({...previous,vehicle_store_id:contractStaffStoreId(previous),store_id:storeId,customer_source_url:dataset?.stores.find(store=>String(store.id)===storeId)?.name || ''}));
    setErrors(previous=>({...previous,store_id:''})); setSaveError('');
  }
  function changeVehicleStore(storeId: string) {
    const directoryName = directoryStores.find(store => String(store.id) === storeId)?.name
      || dataset?.stores.find(store => String(store.id) === storeId)?.name || '';
    const permitted = permittedStores.current?.some(store => String(store.id) === storeId);
    setDraft(previous => ({ ...previous, vehicle_store_id: storeId,
      // Revenue store stays on an own-branch option; do not adopt another branch's id under RLS.
      ...(!previous.store_id && storeId && permitted ? { store_id: storeId, customer_source_url: directoryName } : {}),
      ...(contractStaffStoreId(previous) !== storeId ? { staff_id: '', staff_name: '' } : {}) }));
    setErrors(previous => ({ ...previous, vehicle_store_id: '', staff_id: '', store_id: '' })); setSaveError('');
  }
  function changeRentalType(type: ContractType) {
    const next = type.rental_type;
    const months = type.term_months || rentalTermMonths(next), end = months ? addRentalMonths(draft.start_date, months) : '';
    setRentalType(next);
    if (end) { setAutoReturn(false); setRentalDays(rentalDayCount(draft.start_date, end)); }
    setDraft(previous => ({ ...previous, contract_type_id:type.id, contract_type_name:type.label, contract_type_months:months ? String(months) : '',
      ownership: next === 'ownership', ...(end ? {end_date:end} : {}), package_name: next.startsWith('monthly') || next === 'ownership' ? 'Theo tháng' : 'Theo ngày',
      ...(next === 'ownership' ? {tls_staff_id:'', ...(months && [6,12,24].includes(months) ? {ownership_term_months:String(months) as ContractDraft['ownership_term_months']} : {})} : {}) }));
    if (end) setErrors(previous=>({...previous,end_date:'',rental_days:''}));
  }
  function changeRentalStart(value: string) {
    const months = Number(draft.contract_type_months) || rentalTermMonths(rentalType);
    const termEnd = months ? addRentalMonths(value, months) : '';
    if (termEnd) { setRentalDays(rentalDayCount(value,termEnd)); setDraft(previous=>({...previous,start_date:value,end_date:termEnd})); setErrors(previous=>({...previous,start_date:'',end_date:'',rental_days:''})); setSaveError(''); return; }
    if (!autoReturn) setRentalDays(rentalDayCount(value,draft.end_date));
    setDraft(previous=>{
      const end = autoReturn ? addRentalDays(value,rentalDays) : '';
      return {...previous,start_date:value,...(end ? {end_date:end} : {})};
    });
    setErrors(previous=>({...previous,start_date:'',end_date:'',rental_days:''})); setSaveError('');
  }
  function changeRentalEnd(value: string) {
    setAutoReturn(false); setRentalDays(rentalDayCount(draft.start_date,value));
    setDraft(previous=>({...previous,end_date:value}));
    setSaveError('');setErrors(previous=>({...previous,end_date:''}));
    setErrors(previous=>({...previous,rental_days:''}));
  }
  function changeRentalDays(value: string) {
    setRentalDays(value); setAutoReturn(true);
    const end = addRentalDays(draft.start_date,value);
    if (end) setDraft(previous=>({...previous,end_date:end}));
    setErrors(previous=>({...previous,rental_days:value && !end ? 'Nhập số ngày nguyên lớn hơn 0 và ngày thuê hợp lệ.' : ''}));
  }
  function moneyField(key: 'deposit_amount' | 'unit_price' | 'total_amount', label: string, readOnly = false) {
    const inputId = `contract-${key}`;
    return <div className="mg-field" key={key}><label htmlFor={inputId}>{label}</label>
      <input id={inputId} name={key} type="text" inputMode="numeric" value={formatMoneyInput(draft[key])} readOnly={readOnly}
        aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${inputId}-error` : undefined}
        onChange={event => change(key, event.target.value.replace(/\D/g, ''))} />
      {errors[key] && <p id={`${inputId}-error`} className="mg-field-error">{errors[key]}</p>}</div>;
  }
  function paymentMethodField(key: 'payment_method' | 'deposit_payment_method', label: string) {
    return <div className="mg-field" key={key}><span className="mg-field-label">{label}</span>
      <PaymentMethodPicker label={label} value={draft[key]} onChange={value=>change(key,value)} /></div>;
  }
  function changeIdentity(value: string) {
    photoIdentityLookup.current = '';
    previousCustomerAi.current = {}; customerOcr.cancel('id_front'); customerOcr.cancel('id_back');
    setCustomerPhotos({});
    setLicensePhotos({});customerOcr.cancel('driver-license');
    preserveCustomer.current = false;
    setSelectedCustomer(null);
    setIdInput(value); setLookupState('idle'); setLookupError(''); setDocument(null); setSaveError('');
    setCustomerMatches([]);
    const normalized = normalizeIdCard(value);
    const idCard = /^\d{9}$|^\d{12}$/.test(normalized) ? normalized : '';
    setDraft(previous => ({ ...previous, customer_id: null, customer: { ...customerDetails(), customer_type:previous.customer.customer_type, id_card: previous.customer.customer_type==='foreign'?normalized:idCard }, relatives: pairRelatives(null),
      vehicles: previous.vehicles.map(vehicle => ({ ...vehicle, driver_name: '', driver_license_number: '', driver_license_issued_on: '' })) }));
    setErrors(previous => ({ ...previous, id_card: '' }));
  }
  function selectCustomer(customer: ManagementRow) {
    if(draft.customer_id!==customer.id){setCustomerPhotos({});setLicensePhotos({});customerOcr.cancel('driver-license');}
    photoIdentityLookup.current = '';
    preserveCustomer.current = true;
    setCustomerMatches([]); setLookupState('found'); setLookupError('');
    setSelectedCustomer(customer);
    setDraft(previous => withCustomer(previous, customer));
  }
  function customerCreated(customer: ManagementRow) {
    photoIdentityLookup.current = '';
    previousCustomerAi.current = {}; customerOcr.cancel('id_front'); customerOcr.cancel('id_back');
    setCustomerPhotos({});
    setLicensePhotos({});customerOcr.cancel('driver-license');
    preserveCustomer.current = true;
    setSelectedCustomer(customer);
    setDraft(previous => withCustomer(previous, customer));
    setIdInput(String(customer.id_card || customer.phone || '')); setLookupState('found'); setCustomerModal(false);
  }
  function openCustomerCreate() {
    const storeId = draft.store_id || staffStoreId || (selectedStore !== 'all' ? selectedStore : '');
    if (storeId && (!draft.store_id || !draft.vehicle_store_id)) {
      const store = dataset?.stores.find(item => String(item.id) === storeId);
      setDraft(previous => ({
        ...previous,
        store_id: previous.store_id || storeId,
        vehicle_store_id: previous.vehicle_store_id || storeId,
        customer_source_url: previous.customer_source_url || store?.name || '',
      }));
    }
    preserveCustomer.current = false;
    if (lookupState === 'found') changeIdentity('');
    setCustomerModal(true);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!dataset || busy.current || processingCustomerPhoto || processingPlatePhoto || processingMedia || processingLicense || customerOcr.pending || plateOcr.pending) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const action = submitter instanceof HTMLButtonElement ? submitter.value : '';
    const finalizing = action === 'finalize' && canSaveDraft;
    const savingDraft = !finalizing && (action === 'draft' || (editingDraft && action !== 'preview'));
    const savingRecord = mode === 'edit' && action !== 'preview';
    // A draft may already have a representative while the branch directory is still loading.
    // Do not mistake the temporary empty list for an employee from another branch.
    if ((savingDraft || finalizing) && draft.staff_id && (staffLoading || staffError)) {
      setSection('customer');
      setSaveError(staffError || 'Đang tải nhân sự cửa hàng xe. Đợi tải xong rồi lưu lại; thông tin đang nhập vẫn được giữ.');
      return;
    }
    const validationDataset = {
      ...dataset,
      staff,
      stores: (() => {
        const byId = new Map<number, ManagementRow>();
        for (const store of [...(dataset.stores || []), ...directoryStores]) byId.set(store.id, store);
        return [...byId.values()];
      })(),
      vehicles: (() => {
        const byId = new Map<number, ManagementRow>();
        for (const vehicle of [...(dataset.vehicles || []), ...inventoryVehicles]) byId.set(vehicle.id, vehicle);
        return [...byId.values()];
      })(),
    };
    // Apply the same representative check before both draft save and issue, so an
    // invalid Bên A selection opens its own field instead of an unexplained API error.
    const next = savingDraft ? validateDraftSave(draft, validationDataset) : finalizing
      ? { ...validateDraftSave(draft, validationDataset), ...(reserving ? validateReservationDraft(draft,validationDataset,staff,source) : validateOperationalDraft(draft,validationDataset,staff,source)) }
      : validateContractDraft(draft,validationDataset,staff,source);
    if (canSaveDraft && (!row && !draft.contract_type_id || draft.contract_type_id && !catalog.types.some(type => type.id === draft.contract_type_id && (type.active || row && (row.contract_type_id || row.rental_type) === type.id)))) next.contract_type_id = catalog.error || 'Chọn loại hợp đồng đang dùng, hoặc thêm loại mới.';
    if (rentalDays && (!/^\d+$/.test(rentalDays) || !Number.isSafeInteger(Number(rentalDays)) || Number(rentalDays) < 1 || (draft.start_date && !addRentalDays(draft.start_date,rentalDays)))) next.rental_days = 'Nhập số ngày nguyên lớn hơn 0 và ngày thuê hợp lệ.';
    if (!savingDraft && lookupState !== 'found') next.id_card = 'Tra cứu hoặc tạo khách hàng trước khi lưu / in.';
    setErrors(next); setSaveError('');
    if (Object.keys(next).length) {
      const details = [...new Set(Object.values(next).filter(Boolean))].slice(0, 3).join(' ');
      setSaveError(`Chưa thể ${finalizing ? 'lưu chính thức' : savingDraft ? 'lưu nháp' : savingRecord ? 'lưu hợp đồng' : 'tạo bản in'}. ${details}`);
      requestAnimationFrame(() => {
        const invalid = form.current?.querySelector<HTMLElement>('[aria-invalid="true"]:not([disabled])');
        const panel = invalid?.closest<HTMLElement>('[data-contract-section]');
        if (panel) setSection(panel.dataset.contractSection as ContractSection);
        requestAnimationFrame(() => invalid?.focus());
      }); return;
    }
    if (savingDraft || finalizing) {
      busy.current = true; setSaving(true);
      const revision = savedDraft?.revision ?? (row?.draft_revision ? String(row.draft_revision) : '');
      try {
        const saved = await saveContractDraft(savedDraft?.id ?? row?.id ?? null, { draft: { ...draft, customer_lookup: idInput }, status: 'draft', rental_type: rentalType, notes,
          ...(source === 'api' && revision ? { revision } : {}) });
        setSavedDraft({ id: saved.id, revision: String(saved.draft_revision) });
        await savePhotos(saved.id);
        if (finalizing) {
          setFinalizeTarget({ id: saved.id, revision: String(saved.draft_revision), code: saved.code });
        } else { onClose(); onDraftSaved?.(); }
      } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Không lưu được bản nháp. Vui lòng thử lại.'); }
      finally { busy.current = false; setSaving(false); }
      return;
    }
    if (savingRecord && row) {
      busy.current = true; setSaving(true);
      try { await saveContract(row.id, { draft, status, rental_type: rentalType, notes }); await savePhotos(row.id); onClose(); }
      catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Không lưu được hợp đồng. Vui lòng thử lại.'); }
      finally { busy.current = false; setSaving(false); }
      return;
    }
    try {
      const branch = directoryStores.find(store => String(store.id) === staffStoreId)
        || dataset.stores.find(store => String(store.id) === staffStoreId);
      const representative = staff.find(person => String(person.id) === draft.staff_id) || (draft.staff_name.trim() ? { id: -1, code: '', status: 'active', name: draft.staff_name.trim(), position: '' } : undefined);
      if (!branch) throw new Error('Không tìm thấy cơ sở phụ trách. Hãy chọn lại thông tin rồi thử lại.');
      setDocument(buildContractDocument(draft, branch, representative || {id:-1,code:'',name:'',status:'active',position:''}));
    } catch (cause) {
      setSaveError(cause instanceof Error ? `Không tạo được mẫu hợp đồng: ${cause.message}` : 'Không tạo được mẫu hợp đồng. Vui lòng kiểm tra thông tin và thử lại.');
    }
  }
  const branchStaff = staffMatchesStore(staff, staffStoreId);
  // One picker: NVKD by revenue/source store; TPKD + TLS company-wide. Người phụ trách (Đại diện) theo cửa hàng xe.
  const salesStoreId = draft.store_id || staffStoreId;
  const commissionPool = (() => {
    const byId = new Map<number, ManagementRow>();
    for (const person of [...salesDirectory, ...(dataset?.staff || [])]) byId.set(person.id, person);
    return [...byId.values()];
  })();
  const salesStaff = commissionPool.filter(person => {
    if (!staffIsAvailable(person)) return false;
    // Placeholder profile named "TLS" (not a real person) must not appear in suggestions.
    if (/^tls$/i.test(String(person.name || '').trim())) return false;
    if (String(person.id) === draft.sales_staff_id || String(person.id) === draft.tls_staff_id) return true;
    const roles = staffRoles(person.position);
    if (roles.includes('TPKD') || roles.includes('TLS')) return true;
    if (!roles.includes('NVKD')) return false;
    if (!person.store_id) return true;
    return Boolean(salesStoreId) && String(person.store_id) === salesStoreId;
  }).sort((a, b) => {
    const rank = (person: ManagementRow) => {
      const roles = staffRoles(person.position);
      if (roles.includes('TLS')) return 0;
      if (roles.includes('TPKD')) return 1;
      return 2;
    };
    return rank(a) - rank(b) || String(a.name || '').localeCompare(String(b.name || ''), 'vi');
  });
  const sourceBranchStaff = staffMatchesStore(staff.length ? staff : commissionPool, salesStoreId);
  const sourceStaff = (() => {
    const byId = new Map<number, ManagementRow>();
    for (const person of [...branchStaff.filter(staffIsAvailable), ...sourceBranchStaff.filter(staffIsAvailable), ...salesStaff]) byId.set(person.id, person);
    return [...byId.values()];
  })();
  const nameKey = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi');
  const salesOption = (person: ManagementRow) => {
    // Show person name only — no "· TLS/TPKD" department tag in the list.
    return salesStaff.filter(item => nameKey(item.name) === nameKey(person.name)).length > 1
      ? `${person.name} · ${person.code}` : String(person.name || '');
  };
  const findSalesStaff = (text: string) => {
    const needle = nameKey(text);
    if (!needle) return undefined;
    const exact = salesStaff.filter(person => nameKey(salesOption(person)) === needle || nameKey(person.name) === needle);
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) return undefined;
    const partial = salesStaff.filter(person => {
      const name = nameKey(person.name);
      const option = nameKey(salesOption(person));
      return name.includes(needle) || option.includes(needle) || name.split(/\s+/).includes(needle) || nameKey(person.code).includes(needle);
    });
    return partial.length === 1 ? partial[0] : undefined;
  };
  function applyCommissionPick(person: ManagementRow | undefined) {
    setSalesText(null);
    if (!person) { change('sales_staff_id', ''); change('tls_staff_id', ''); return; }
    const roles = staffRoles(person.position);
    const salesOk = hasSalesCommissionRole(person.position);
    // Dual TLS/NVKD → NVKD credit; pure TLS → tls_staff_id (server rejects TLS on sales_staff_id).
    if (salesOk) { change('sales_staff_id', String(person.id)); change('tls_staff_id', ''); }
    else if (roles.includes('TLS')) { change('sales_staff_id', ''); change('tls_staff_id', String(person.id)); }
    else { change('sales_staff_id', ''); change('tls_staff_id', ''); }
  }
  const assignedSales = commissionPool.find(person => String(person.id) === draft.sales_staff_id && hasSalesCommissionRole(person.position));
  const assignedTls = commissionPool.find(person => String(person.id) === draft.tls_staff_id && staffRoles(person.position).includes('TLS'));
  const assignedCommission = assignedSales || assignedTls;
  const salesValue = salesText ?? (assignedCommission ? salesOption(assignedCommission) : '');
  const salesUnmatched = Boolean(salesText?.trim()) && !draft.sales_staff_id && !draft.tls_staff_id;
  function changeSource(value: string) {
    change('customer_source', value);
    if (!salesFollowsSource.current) return;
    applyCommissionPick(findSalesStaff(value));
  }
  function changeSales(value: string) {
    salesFollowsSource.current = !value.trim();
    const needle = nameKey(value);
    if (!needle) { applyCommissionPick(undefined); return; }
    const exact = salesStaff.filter(person => nameKey(salesOption(person)) === needle || nameKey(person.name) === needle);
    if (exact.length === 1) { applyCommissionPick(exact[0]); return; }
    setSalesText(value);
    change('sales_staff_id', '');
    change('tls_staff_id', '');
  }
  const vehicleStoreOptions = (() => {
    const byId = new Map<number, ManagementRow>();
    for (const store of [...(dataset?.stores || []), ...directoryStores]) byId.set(store.id, store);
    return [...byId.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));
  })();
  const allVehicles = (() => {
    const byId = new Map<number, ManagementRow>();
    for (const vehicle of [...(dataset?.vehicles || []), ...inventoryVehicles]) byId.set(vehicle.id, vehicle);
    return [...byId.values()];
  })();
  const branchVehicles = allVehicles.filter(vehicle => !staffStoreId || String(vehicle.store_id) === staffStoreId || draft.vehicles.some(item=>item.id===String(vehicle.id)));
  const branchName = dataset?.stores.find(store => String(store.id) === draft.store_id)?.name
    || directoryStores.find(store => String(store.id) === draft.store_id)?.name || '';
  const vehicleStoreName = vehicleStoreOptions.find(store => String(store.id) === staffStoreId)?.name || '';
  const pricingVehicle = allVehicles.find(vehicle => String(vehicle.id) === draft.vehicles[0]?.id);
  const monthlyPackage = draft.package_name === 'Theo tháng';
  const ownership = rentalType === 'ownership';
  const selectedTypeId = draft.contract_type_id || rentalType;
  const typeOptions = catalog.types.filter(type => type.active || type.id === selectedTypeId).map(type => ({...type,
    label: type.id === selectedTypeId && draft.contract_type_name ? draft.contract_type_name : type.label}));
  if (!typeOptions.some(type => type.id === selectedTypeId) && row) typeOptions.push({id:selectedTypeId,label:draft.contract_type_name || CONTRACT_TYPES.find(type=>type.value===rentalType)?.label || rentalType,rental_type:rentalType,term_months:null,active:false,revision:''});
  const requirements = documentRequirements(draft.document_requirements);
  const otherFees = chargeTotal(draft.extra_charges) ?? 0;
  useEffect(() => {
    if (draft.package_name === 'Tùy chọn') return;
    const rate = monthlyPackage ? pricingVehicle?.monthly_price : draft.package_name === 'Theo tuần' && pricingVehicle?.daily_price != null ? Number(pricingVehicle.daily_price) * 7 : pricingVehicle?.daily_price;
    if (livePricing.current && String(pricingVehicle?.id) === livePricing.current.vehicle) return;
    if (pricingVehicle) {
      const nextRate = rate == null || !Number.isFinite(Number(rate)) ? '' : String(rate);
      setDraft(previous => previous.unit_price === nextRate ? previous : { ...previous, unit_price: nextRate });
    }
  }, [pricingVehicle, monthlyPackage, draft.package_name]);
  useEffect(() => {
    const live = livePricing.current;
    if (live && live.start === draft.start_date && live.end === draft.end_date && live.unit === draft.unit_price) return;
    const interval = billingInterval(draft.package_name);
    const units = interval ? rentalPeriodCount(draft.start_date, draft.end_date, interval) : 0;
    if (units && draft.unit_price && Number.isSafeInteger(Number(draft.unit_price))) {
      const total = String(units * Number(draft.unit_price)+otherFees);
      setDraft(previous => previous.total_amount === total && Boolean(previous.ownership) === ownership ? previous : { ...previous, ownership, total_amount: total });
    }
  }, [draft.start_date, draft.end_date, draft.unit_price, draft.package_name, ownership, otherFees]);
  function changeCharges(next: ContractCharge[]) {
    setDraft(previous=>({...previous,extra_charges:next,total_amount:String(Math.max((Number(previous.total_amount)||0)-(chargeTotal(previous.extra_charges)||0),0)+(chargeTotal(next)||0))}));
    setSaveError('');setErrors(previous=>Object.fromEntries(Object.entries(previous).filter(([key])=>!key.startsWith('charge_') && key!=='extra_charges')));
  }
  function chooseVehicle(index: number, id: string) {
    const selected = allVehicles.find(item => String(item.id) === id);
    const previous = draftRef.current;
    const next = {
      ...previous,
      ...(selected && index === 0 && selected.store_id ? { vehicle_store_id: String(selected.store_id),
        ...(contractStaffStoreId(previous) !== String(selected.store_id) ? {staff_id:'',staff_name:''} : {}) } : {}),
      vehicles: previous.vehicles.map((item, i) => i === index ? selected ? vehicleDetails(selected, previous.customer) : emptyVehicle() : item),
      unit_price: selected && index === 0 && !previous.unit_price ? String(selected.daily_price ?? '') : previous.unit_price,
    };
    draftRef.current = next; setDraft(next);
    setErrors(previous => ({ ...previous, [`vehicle_${index}`]: '' }));
    setSaveError('');
  }
  const representative = branchStaff.find(person => String(person.id) === draft.staff_id) || (draft.staff_name.trim() ? { id: -1, code: '', status: 'active', name: draft.staff_name.trim(), position: '' } : undefined);
  const canSearchCustomer = validCustomerLookup(String(idInput ?? ''));
  const customerStoreId = draft.store_id || staffStoreId || (selectedStore !== 'all' ? selectedStore : '');
  const canCreateCustomer = Boolean(customerStoreId);
  const lookupText = lookupState === 'loading' ? 'Đang tra cứu khách hàng trên toàn hệ thống…'
    : lookupState === 'found' ? `Đã tìm thấy khách hàng #${draft.customer_id} · Thông tin đã tự động điền`
    : lookupState === 'matches' ? `Tìm thấy ${customerMatches.length} hồ sơ. Chọn đúng khách hàng bên dưới.`
    : lookupState === 'missing' ? (canCreateCustomer
      ? 'Chưa có khách trên hệ thống. Bấm Thêm mới để nhập hồ sơ — các ô bên dưới chỉ mở sau khi tạo hoặc chọn khách.'
      : 'Chưa có khách trên hệ thống. Chọn Cửa hàng xe hoặc Liên kết nguồn khách, rồi bấm Thêm mới.')
    : 'Nhập CCCD / SĐT rồi Tra cứu. Khách mới: chọn cơ sở (nếu chưa) và bấm Thêm mới — không gõ trực tiếp vào ô bên dưới khi chưa có hồ sơ.';
  const ownerStoreName = (customer: ManagementRow) => customer.store_name || dataset?.stores.find(store => store.id === customer.store_id)?.name || 'Chưa xác định';
  const firstRentalStoreName = (customer: ManagementRow) => customer.first_rental_store_name || (customer.first_rented_at ? 'Chưa xác định cơ sở' : 'Chưa có lịch sử thuê');
  function field(key: keyof Omit<ContractDraft, 'customer' | 'vehicles' | 'customer_id'>, label: string, type = 'text', required = false) {
    return <div className="mg-field" key={key}><label htmlFor={`contract-${key}`}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      <input id={`contract-${key}`} name={key} type={type} value={String(draft[key])} required={required} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 1 : undefined}
        readOnly={Boolean(row) && mode === 'edit' && !editingDraft && key === 'contract_number'}
        maxLength={key === 'contract_number' ? 32 : undefined}
        aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `contract-${key}-error` : undefined} onChange={event => change(key, event.target.value)} />
      {key === 'contract_number' && canSaveDraft && <small>Nhập đúng số HĐ giấy. Khi hoàn tất, hệ thống và Telegram dùng số này, giữ nguyên số 0 đầu. Để trống để cấp số tự động.</small>}
      {errors[key] && <p id={`contract-${key}-error`} className="mg-field-error">{errors[key]}</p>}</div>;
  }
  const customerFields: { key: keyof CustomerDetails; label: string; type?: string; wide?: boolean; hint?: string }[] = [
    { key: 'name', label: 'Tên khách hàng' }, { key: 'phone', label: draft.customer.customer_type==='foreign'?'SĐT quốc tế (nếu có)':'SĐT', type: 'tel' },
    { key: 'id_card', label: draft.customer.customer_type==='foreign'?'Hộ chiếu / Giấy tờ quốc tế':'Số CMTND/CCCD' },
    { key: 'id_card_issued_on', label: 'Ngày cấp CCCD', type: 'date' }, { key: 'id_card_issued_by', label: 'Nơi cấp CCCD' },
    { key: 'driver_license_number', label: 'Số giấy phép lái xe' }, { key: 'driver_license_issued_on', label: 'Ngày cấp GPLX', type: 'date' },
    { key: 'address', label: 'Nơi ở hiện tại', wide: true, hint: 'Ghi số nhà, phường/xã, quận/huyện.' },
  ];
  const sectionIndex = CONTRACT_FORM_SECTIONS.findIndex(item => item.id === section);
  async function savePhotos(contractId: number) {
    if (draft.customer_id) await saveRecordPhotos('customers', draft.customer_id, customerPhotos);
    const selectedPlates = Object.fromEntries(Object.entries(platePhotos).filter(([slot]) => draft.vehicles.some(vehicle => slot === `plate-${vehicle.id}`)));
    await saveRecordPhotos('contracts', contractId, selectedPlates);
    await saveRecordPhotos('contracts',contractId,licensePhotos);setLicensePhotos({});
    await saveRecordPhotos('contracts',contractId,transactionMedia);setTransactionMedia({});
    await copyCustomerPhotosToContract(contractId);
    setCustomerPhotos({}); setPlatePhotos({}); setPhotoVersion(current => current + 1);
  }
  async function persistProfile() {
    if(!row || !profileRevision || busy.current || processingCustomerPhoto || processingPlatePhoto || processingMedia || processingLicense || customerOcr.pending || plateOcr.pending)return;busy.current=true;setSaving(true);setSaveError('');setProfileMessage('');
    try{const result=await saveContractProfile(row.id,profileRevision,contractProfile(draft));setProfileRevision(result.revision);await savePhotos(row.id);setProfileMessage('Đã lưu hồ sơ, ảnh và yêu cầu khi in. Tiền, công nợ và kho xe giữ theo giao dịch đã ghi.');void ensureData(['contracts'],true).catch(()=>{});}
    catch(cause){setSaveError(cause instanceof Error ? cause.message : 'Không lưu được hồ sơ.');}
    finally{busy.current=false;setSaving(false);}
  }
  function customerField(item: (typeof customerFields)[number]) {
    const fieldId = `contract-customer-${item.key}`;
    const setCustomerValue = (next: string) => {
      setDraft(previous => ({ ...previous, customer: { ...previous.customer, [item.key]: next } }));
      setErrors(previous => ({ ...previous, [item.key]: '' })); setSaveError('');
    };
    return <div className={`mg-field ${item.wide ? 'mg-field-wide' : ''}`} key={item.key}>
      <label htmlFor={fieldId}>{item.label}</label>
      {item.type === 'date' ? <VietnamDateField id={fieldId} label={item.label} value={draft.customer[item.key] || ''} disabled={lookupState !== 'found'}
        invalid={Boolean(errors[item.key])} onChange={setCustomerValue} />
        : <input id={fieldId} type={item.type || 'text'} value={draft.customer[item.key]}
          disabled={lookupState !== 'found'} readOnly={item.key === 'id_card'} aria-invalid={Boolean(errors[item.key])}
          onChange={event => setCustomerValue(event.target.value)} />}
      {item.hint && <small>{item.hint}</small>}
      {errors[item.key] && <p className="mg-field-error">{errors[item.key]}</p>}
    </div>;
  }
  function panel(id: ContractSection, title: string, children: ReactNode) {
    return <section id={`contract-composer-panel-${id}`} role="tabpanel" aria-labelledby={`contract-composer-tab-${id}`}
      data-contract-section={id} hidden={section !== id} className="mg-contract-panel">
      <fieldset className="mg-composer-section"><legend>{title}</legend>{children}</fieldset>
    </section>;
  }
  return <>
    <Dialog title={reserving ? 'Nhận cọc giữ xe' : editingDraft ? row ? 'Chỉnh sửa bản nháp' : 'Nhập hợp đồng' : mode === 'edit' ? 'Chỉnh sửa hợp đồng' : 'Điền và in hợp đồng'} subtitle={row ? `${row.code} · ID ${row.id}` : 'Bản nháp · Chưa phát hành hợp đồng'} className="mg-contract-composer" onClose={() => { if (!busy.current) onClose(); }}>
      <form ref={form} noValidate onSubmit={submit}>
        <div className="mg-dialog-body mg-composer-body">
          <div className="mg-composer-notice">{reserving ? 'Chọn khách, cơ sở giữ xe, xe và ngày dự kiến nhận. Tiền giữ xe được trừ vào tiền thuê; chỉ vào Sổ quỹ sau khi xác nhận khoản đã nhận. Lưu nháp chưa ghi tiền.' : canSaveDraft ? canSaveContractDrafts ? 'Lưu nháp giữ thông tin đang nhập trên hệ thống, kể cả khi chưa điền đủ. Vào mục Hợp đồng nháp để tiếp tục chỉnh sửa. Bản nháp chưa phát hành hợp đồng.' : 'Đang tra cứu dữ liệu hệ thống. Chức năng ghi bản nháp chưa được kết nối; thông tin đang nhập chưa được lưu.' : mode === 'edit' ? 'Hợp đồng đã có trong danh sách; bản in là bản nháp.' : 'Điền thông tin để xem và in mẫu hợp đồng.'}</div>
          <fieldset className="mg-composer-fields" disabled={saving}>
          <ContractSectionTabs prefix="contract-composer" active={section} onChange={setSection} />
          {panel('contract', 'Thông tin hợp đồng & Pháp lý', <>
            <div className="mg-form-grid mg-contract-grid-two">
              <div className={`mg-field${ownership ? '' : ' mg-field-wide'}`}><label htmlFor="contract-record-type">Loại hợp đồng</label><select id="contract-record-type" value={selectedTypeId} disabled={!canSaveDraft || catalog.loading} aria-invalid={Boolean(errors.contract_type_id)} onChange={event => { const type = catalog.types.find(type=>type.id===event.target.value); if (type) {changeRentalType(type);setErrors(previous=>({...previous,contract_type_id:''}));} }}>
                {!typeOptions.length && <option value="">{catalog.loading ? 'Đang tải loại hợp đồng…' : 'Thêm loại hợp đồng để chọn'}</option>}{typeOptions.map(type => <option key={type.id} value={type.id}>{type.label}{!type.active ? ' (đã ẩn)' : ''}</option>)}</select>
                {errors.contract_type_id && <p className="mg-field-error">{errors.contract_type_id}</p>}
                {catalog.error && <p role="alert" className="mg-field-error">{catalog.error} <button type="button" className="mg-button" onClick={()=>void catalog.load(true)}>Thử lại</button></p>}
                {canSaveDraft && catalog.canManage && <div className="mg-contract-type-actions"><button type="button" className="mg-button" onClick={()=>setTypeManagerOpen(true)}><Plus size={16}/>Thêm / quản lý loại hợp đồng</button></div>}
              </div>
              {ownership && canSaveDraft && <p className="mg-composer-hint mg-field-wide">Kiểm tra thông tin rồi bấm Hoàn tất & thanh toán để duyệt và phát hành hợp đồng thuê sở hữu.</p>}
              {ownership && <div className="mg-field"><label htmlFor="contract-ownership-term">Phân loại thuê sở hữu</label><select id="contract-ownership-term" value={draft.ownership_term_months || 'custom'} onChange={event=>change('ownership_term_months',event.target.value as ContractDraft['ownership_term_months'])}>{OWNERSHIP_TERMS.map(term=><option key={term.value} value={term.value}>{term.label}</option>)}</select></div>}
              {field('contract_number', 'Mã hợp đồng / Số HĐ giấy')}
              {field('signed_on', 'Ngày ký hợp đồng', 'date', !reserving)}
              <div className="mg-field"><label htmlFor="contract-created-on">Ngày tạo hợp đồng</label><input id="contract-created-on" type="date" value={draft.created_on} onChange={event => change('created_on', event.target.value)} /><small>Gợi ý hôm nay, có thể chọn ngày khác.</small></div>
              <div className="mg-field"><label htmlFor="contract-customer-source-store">Liên kết nguồn khách</label><select id="contract-customer-source-store" value={draft.customer_source_url || branchName} aria-invalid={Boolean(errors.store_id)} onChange={event => { const store = dataset?.stores.find(item=>item.name===event.target.value); if(store) changeSourceStore(String(store.id)); else change('customer_source_url',event.target.value); }}>
                <option value="">Chọn cơ sở</option>{(dataset?.stores || []).map(store => <option key={store.id} value={store.name}>{store.name}</option>)}
                {draft.customer_source_url && !(dataset?.stores || []).some(store => store.name === draft.customer_source_url) && <option value={draft.customer_source_url}>{draft.customer_source_url}</option>}
              </select><small>Cơ sở ghi nhận doanh thu hợp đồng, gợi ý theo hồ sơ khách.</small>{errors.store_id && <p className="mg-field-error">{errors.store_id}</p>}</div>
              <div className="mg-field"><label htmlFor="contract-customer-source">Nguồn khách</label><input id="contract-customer-source" list="contract-source-staff-options" value={draft.customer_source} placeholder="Chọn hoặc nhập tên nhân sự" onChange={event => changeSource(event.target.value)} />
                <datalist id="contract-source-staff-options">{sourceStaff.map(person => <option key={person.id} value={person.name}>{person.code}</option>)}</datalist>
                <small>Nhân sự cửa hàng xe + toàn bộ TLS/TPKD.</small></div>
              <div className="mg-field"><label htmlFor="contract-sales_staff_id">NVKD ghi nhận doanh số</label>
                <SuggestionInput id="contract-sales_staff_id" value={salesValue} suggestions={salesStaff.map(salesOption)} disabled={Boolean(attributionError)} placeholder="Gõ tên hoặc chọn nhân viên" onChange={changeSales} />
                {attributionError ? <p className="mg-field-error" role="alert">{attributionError}</p> : salesUnmatched ? <p className="mg-field-error">Không khớp nhân viên. Gõ để lọc gợi ý hoặc chọn trong danh sách; để trống là chưa phân công.</p> : <small>Gõ để lọc. NVKD theo cửa hàng / nguồn khách; TPKD và TLS (vd. Huệ, Trang) hiện mọi cơ sở — chỉ hiện tên, không ghi bộ phận.</small>}</div>
            </div>
            <details className="mg-document-requirements"><summary>Yêu cầu hồ sơ khi in hợp đồng</summary><p>Lưu vận hành không bắt buộc người thân, địa chỉ hoặc CCCD chưa có. Chị có thể chọn các mục cần hoàn tất khi in; lựa chọn lưu cùng hợp đồng này.</p><div className="mg-form-grid mg-contract-grid-two">{(['phone','id_card','address','representative'] as const).map(key=><label className="mg-checkbox" key={key}><input type="checkbox" checked={requirements[key]} onChange={event=>change('document_requirements',{...requirements,[key]:event.target.checked})} />{{phone:'Số điện thoại khách',id_card:'CCCD/CMND',address:'Địa chỉ khách',representative:'Đại diện Bên A'}[key]}</label>)}<div className="mg-field mg-field-wide"><label htmlFor="contract-required-relatives">Số người thân cần khi in</label><select id="contract-required-relatives" value={requirements.relatives} onChange={event=>change('document_requirements',{...requirements,relatives:Number(event.target.value) as 0|1|2})}><option value={0}>Không bắt buộc</option><option value={1}>1 người thân</option><option value={2}>2 người thân</option></select></div></div></details>
            <div className="mg-contract-record-status">{canSaveDraft ? <><span>Trạng thái hợp đồng</span><strong className="mg-status mg-status-amber">Lưu nháp</strong></> : mode === 'edit' ? <div className="mg-field"><label htmlFor="contract-record-status">Trạng thái hợp đồng</label><select id="contract-record-status" value={status} onChange={event => setStatus(event.target.value)}>{CONTRACT_STATUSES.filter(option => option.value !== 'draft').map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div> : null}</div>
          </>)}
          {panel('customer', 'Thông tin khách hàng (Bên B)', <>
            <div className="mg-form-grid mg-contract-grid-two">
              <div className="mg-field"><label htmlFor="contract-store">Cửa hàng xe *</label><select id="contract-store" value={staffStoreId} aria-invalid={Boolean(errors.vehicle_store_id)} onChange={event => changeVehicleStore(event.target.value)}>
                <option value="">Chọn cửa hàng xe</option>{vehicleStoreOptions.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select><small>Chọn cửa hàng có xe (mọi cơ sở). Người phụ trách / nhân viên làm HĐ đi theo cửa hàng này.</small>{errors.vehicle_store_id && <p className="mg-field-error">{errors.vehicle_store_id}</p>}</div>
              <div className="mg-field"><label htmlFor="contract-staff">Đại diện ủy quyền Bên A (Người phụ trách theo cửa hàng xe){requirements.representative ? ' · cần khi in' : ''}</label><input id="contract-staff" list="contract-staff-options" value={draft.staff_name || (branchStaff.find(person => String(person.id) === draft.staff_id)?.name || '')} disabled={!staffStoreId} aria-invalid={Boolean(errors.staff_id)} aria-describedby="contract-staff-help" placeholder={staffLoading ? 'Đang tải nhân sự…' : !staffStoreId ? 'Chọn cửa hàng xe trước' : 'Chọn hoặc nhập tên nhân sự'} onChange={event => {
                  const name = event.target.value;
                  const selected = branchStaff.find(person => person.name.toLocaleLowerCase('vi') === name.trim().toLocaleLowerCase('vi') && staffIsAvailable(person));
                  setDraft(previous => ({ ...previous, staff_id: selected ? String(selected.id) : '', staff_name: selected ? '' : name }));
                  setErrors(previous => ({ ...previous, staff_id: '' })); setSaveError('');
                }} />
                <datalist id="contract-staff-options">{branchStaff.filter(staffIsAvailable).map(person => <option key={person.id} value={person.name}>{person.code}</option>)}</datalist>
                {errors.staff_id && <p className="mg-field-error">{errors.staff_id}</p>}{staffError ? <div className="mg-field-error" role="alert">{staffError}<button className="mg-inline-button" type="button" onClick={() => setStaffRetry(value => value + 1)}>Thử lại</button></div> : <small id="contract-staff-help">{staffStoreId && !staffLoading ? `${branchStaff.filter(staffIsAvailable).length} nhân sự tại cửa hàng xe${directoryStores.find(store => String(store.id) === staffStoreId)?.manager_name ? ` · gợi ý người phụ trách: ${directoryStores.find(store => String(store.id) === staffStoreId)?.manager_name}` : ''}. Đổi cửa hàng xe sẽ đổi danh sách này.` : 'Chọn cửa hàng xe để tải người phụ trách / nhân viên cơ sở đó.'}</small>}</div>
            </div>
            <div className="mg-contract-customer-toolbar">
              <div className="mg-field mg-contract-lookup"><label htmlFor="contract-id-card">Tra cứu theo CCCD / hộ chiếu / SĐT / liên hệ *</label><div className="mg-lookup-controls"><input id="contract-id-card" autoComplete="off" value={idInput} aria-invalid={Boolean(errors.id_card)} aria-describedby="contract-lookup-status" placeholder="CCCD, hộ chiếu, SĐT hoặc liên hệ" onChange={event => changeIdentity(event.target.value)} />
                <button className="mg-button" type="button" disabled={!canSearchCustomer || lookupState === 'loading'} onClick={() => { preserveCustomer.current = false; setLookupRetry(value => value + 1); }}>{lookupState === 'loading' ? <LoaderCircle size={16} className="mg-spin" /> : <Search size={16} />}Tra cứu</button></div>
                <div id="contract-lookup-status" className={`mg-lookup-status is-${lookupState}`} role={lookupState === 'error' ? 'alert' : 'status'}>{lookupState === 'error' ? lookupError : lookupText}</div>{lookupState === 'found' && <span className={`mg-customer-status ${selectedCustomerStatus.includes('Cảnh báo') ? 'is-blocked' : selectedCustomerStatus === 'Có cảnh báo' ? 'is-warning' : selectedCustomerStatus === 'Đang hoạt động' ? 'is-active' : ''}`}>{selectedCustomerStatus}</span>}
                {lookupState === 'found' && selectedCustomer && <div className="mg-customer-origin">
                  <dl aria-label="Cơ sở của khách hàng"><div><dt>Cơ sở nguồn khách (hồ sơ)</dt><dd>{ownerStoreName(selectedCustomer)}</dd></div><div><dt>Cơ sở ghi nhận doanh thu hợp đồng</dt><dd>{branchName || 'Chưa chọn'}</dd></div><div><dt>Thuê lần đầu tại</dt><dd>{firstRentalStoreName(selectedCustomer)}</dd></div></dl>
                  {selectedCustomer.store_id && draft.store_id && String(selectedCustomer.store_id) !== draft.store_id && <p>Nguồn hồ sơ vẫn thuộc {ownerStoreName(selectedCustomer)}; hợp đồng này ghi nhận doanh thu tại {branchName}.</p>}
                </div>}
                {lookupState === 'matches' && <div className="mg-customer-match-list" role="listbox" aria-label="Chọn khách hàng tìm thấy">{customerMatches.map(customer => <button key={customer.id} type="button" role="option" aria-selected="false" className="mg-customer-match" onClick={() => selectCustomer(customer)}><strong>{customer.name}</strong><span>{customer.phone || 'Chưa có SĐT'} · CCCD {customer.id_card || 'Chưa có'}</span><span>Cơ sở quản lý: {ownerStoreName(customer)} · Thuê lần đầu: {firstRentalStoreName(customer)}</span><em>{customerStatusLabel(customer.status)}</em></button>)}</div>}
                {errors.id_card && <p className="mg-field-error">{errors.id_card}</p>}
              </div>
              <button className={`mg-button${lookupState === 'missing' ? ' mg-button-primary' : ''}`} type="button" disabled={!canCreateCustomer} title={!canCreateCustomer ? 'Chọn Cửa hàng xe hoặc Liên kết nguồn khách trước' : undefined} onClick={openCustomerCreate}><UserPlus size={16} />Thêm mới</button>
            </div>
            {lookupState !== 'found' && <p className="mg-composer-hint" role="status">Ô tên / CCCD / địa chỉ bên dưới bị khóa cho đến khi Tra cứu thấy khách hoặc bấm Thêm mới để tạo hồ sơ. Nick thuê sở hữu cũng dùng cùng quy trình này.</p>}
            <CustomerInternationalFields prefix="contract-customer" value={draft.customer} onChange={customer=>{setDraft(previous=>({...previous,customer}));setErrors({});}} disabled={saving} errors={errors}/>
            <div className="mg-form-grid mg-contract-grid-three mg-customer-autofill">{customerFields.slice(0, 2).map(customerField)}</div>
            <div className="mg-form-grid mg-contract-grid-three mg-customer-autofill">{customerFields.slice(2).map(item=><Fragment key={item.key}>{customerField(item)}{item.key==='driver_license_number'&&source==='api'&&draft.customer_id&&<div className="mg-field-wide"><RecordPhotoFields entity="contracts" recordId={savedDraft?.id||row?.id} slots={[{key:'driver-license',label:'Giấy phép lái xe'}]} title="Chụp GPLX · Tự điền bằng AI" value={licensePhotos} onChange={setLicensePhotos} disabled={saving} onBusyChange={setProcessingLicense} ocr={customerOcr}/></div>}</Fragment>)}</div>
            {source === 'api' && draft.customer_id && <RecordPhotoFields key={`customer-${draft.customer_id}-${photoVersion}`} entity="customers" recordId={draft.customer_id} slots={draft.customer.customer_type==='foreign'?[{key:'id_front',label:'Trang hộ chiếu / giấy tờ'},{key:'id_back',label:'Trang bổ sung (nếu có)'}]:CUSTOMER_PHOTO_SLOTS} title={draft.customer.customer_type==='foreign'?'Chụp hộ chiếu · Tự điền bằng AI':'Chụp CCCD · Tự điền bằng AI'} value={customerPhotos} onChange={setCustomerPhotos} onBusyChange={setProcessingCustomerPhoto} disabled={saving} ocr={customerOcr} />}
            <div className="mg-contract-relatives">{draft.relatives.map((relative, index) => <div className="mg-contract-relative" key={index}>
              <strong>Người thân {index + 1}</strong>
              <div className="mg-form-grid mg-contract-grid-three">{(['name', 'relationship', 'phone'] as const).map(key => {
                const labels = { name: 'Họ tên', relationship: 'Quan hệ', phone: 'SĐT' };
                const errorKey = `relative_${index}_${key}`;
                return <div className="mg-field" key={key}><label htmlFor={`contract-relative-${index}-${key}`}>{labels[key]} người thân {index + 1}{!reserving && index < requirements.relatives && ' · cần khi in'}</label>
                  <input id={`contract-relative-${index}-${key}`} type={key === 'phone' ? 'tel' : 'text'} value={relative[key]} disabled={lookupState !== 'found'} aria-invalid={Boolean(errors[errorKey])} onChange={event => changeRelative(index as 0 | 1, key, event.target.value)} />
                  {errors[errorKey] && <p className="mg-field-error">{errors[errorKey]}</p>}</div>;
              })}</div>
            </div>)}</div>
            {reserving && <p className="mg-composer-hint">Có thể bổ sung địa chỉ, người thân và ngày ký trước khi in hợp đồng.</p>}
            <p className="mg-composer-hint">Thông tin chỉnh tại đây {mode === 'edit' ? 'được lưu riêng cho hợp đồng và mẫu in' : 'dùng trên bản in'}, không cập nhật hồ sơ khách hàng đã có.</p>
          </>)}
          {panel('vehicle', 'Thông tin phương tiện', <>
            <div className="mg-form-grid mg-contract-grid-two"><DateTime24Field id="contract-start_date" label={reserving ? 'Dự kiến nhận xe' : 'Thuê lúc'} value={draft.start_date} onChange={changeRentalStart} error={errors.start_date} /><DateTime24Field id="contract-end_date" label="Hẹn trả" value={draft.end_date} onChange={changeRentalEnd} error={errors.end_date} /></div>
            <div className="mg-form-grid mg-contract-grid-two"><div className="mg-field"><label htmlFor="contract-rental-days">Số ngày thuê</label><input id="contract-rental-days" type="number" min="1" step="1" value={rentalDays} aria-invalid={Boolean(errors.rental_days)} onChange={event=>changeRentalDays(event.target.value)} /><small>Nhập số ngày để tự tính ngày trả, giữ cùng giờ thuê. Có thể sửa hẹn trả trực tiếp.</small>{errors.rental_days && <p className="mg-field-error">{errors.rental_days}</p>}</div>
              <div className="mg-field"><label htmlFor="contract-vehicle-store-filter">Cửa hàng xe</label><select id="contract-vehicle-store-filter" value={staffStoreId} onChange={event=>changeVehicleStore(event.target.value)}><option value="">Chọn cửa hàng xe</option>{vehicleStoreOptions.map(store=><option key={store.id} value={store.id}>{store.name}</option>)}</select><small>Cửa hàng có xe (mọi cơ sở) và gợi ý nhân viên làm hợp đồng. Lựa chọn được lưu cùng hợp đồng.</small></div></div>
            {inventoryError && <p className="mg-field-error" role="alert">{inventoryError} <button type="button" className="mg-inline-button" onClick={() => setInventoryRetry(value => value + 1)}>Thử lại</button></p>}
            <p className="mg-composer-hint">Thời gian thuê và hẹn trả áp dụng cho các xe trong hợp đồng.</p>
            {draft.vehicles.map((vehicle, index) => {
              return <div key={index} className="mg-composer-vehicle"><div className="mg-composer-vehicle-header"><strong>Thông tin xe thuê số {index + 1}</strong>{draft.vehicles.length > 1 && <button className="mg-icon-button" type="button" aria-label={`Bỏ xe ${index + 1}`} onClick={() => change('vehicles', draft.vehicles.filter((_, i) => i !== index))}><Trash2 size={16} /></button>}</div>
              <div className="mg-field"><label htmlFor={`contract-vehicle-${index}`}>Chọn xe thuê *</label>
                <VehiclePicker id={`contract-vehicle-${index}`} index={index} vehicles={branchVehicles} value={vehicle.id} storeName={!staffStoreId ? 'tất cả cơ sở' : vehicleStoreName || 'cửa hàng xe'} monthly={monthlyPackage}
                  ownOrderId={row?.id} takenIds={draft.vehicles.map(item => item.id).filter(Boolean)} disabled={false} invalid={Boolean(errors[`vehicle_${index}`])}
                  proposedStart={draft.start_date} proposedEnd={draft.end_date} onChange={id => chooseVehicle(index, id)} />
                {errors[`vehicle_${index}`] && <p className="mg-field-error">{errors[`vehicle_${index}`]}</p>}</div>
              {vehicle.id && <div className="mg-composer-vehicle-summary">{vehicle.license} · {vehicle.brand} · {vehicle.type_text} · {vehicle.year || 'Chưa có năm sản xuất'}<br />Cơ sở quản lý xe: {vehicle.stock_store_name || allVehicles.find(item=>String(item.id)===vehicle.id)?.store_name || 'Chưa xác định'} · Doanh thu: {branchName || 'Chưa chọn nguồn khách'}</div>}
              {vehicle.id&&<SelectedVehicleGps vehicleId={vehicle.id} data={selectedGps}/>}
              <div className="mg-form-grid mg-contract-grid-three">{(['driver_name', 'driver_license_number', 'driver_license_issued_on', 'borrow_hats', 'borrow_raincoats', 'color'] as const).map(key => {
                const labels = { color: 'Màu xe', driver_name: 'Tên người lái', driver_license_number: 'Số giấy phép lái xe', driver_license_issued_on: 'Ngày cấp GPLX', borrow_hats: 'Số mũ mượn', borrow_raincoats: 'Số áo mưa' };
                const fieldId = `contract-vehicle-${index}-${key}`;
                const setVehicleValue = (next: string) => change('vehicles', draft.vehicles.map((item, i) => i === index ? { ...item, [key]: next } : item));
                return <div className="mg-field" key={key}><label htmlFor={fieldId}>{labels[key]}</label>
                  {key === 'driver_license_issued_on'
                    ? <VietnamDateField id={fieldId} label={labels[key]} value={vehicle[key]} invalid={Boolean(errors[`vehicle_${index}_${key}`])} onChange={setVehicleValue} />
                    : <input id={fieldId} type="text" inputMode={key.startsWith('borrow_') ? 'numeric' : undefined} maxLength={key.startsWith('borrow_') ? 2 : undefined} value={vehicle[key]} aria-invalid={Boolean(errors[`vehicle_${index}_${key}`])} onChange={event => setVehicleValue(key.startsWith('borrow_') ? event.target.value.replace(/\D/g, '').slice(0, 2) : event.target.value)} />}
                  {errors[`vehicle_${index}_${key}`] && <p className="mg-field-error">{errors[`vehicle_${index}_${key}`]}</p>}</div>;
              })}</div>
            </div>;
            })}
            <button className="mg-button" type="button" onClick={() => change('vehicles', [...draft.vehicles, emptyVehicle()])}><Plus size={16} />Thêm xe</button>
            {source === 'api' && <RecordPhotoFields key={`plates-${photoVersion}`} entity="contracts" recordId={savedDraft?.id || row?.id} slots={[{ key: 'scan_plate', label: 'Biển số để tự chọn xe' }, ...draft.vehicles.filter(vehicle => vehicle.id).map(vehicle => ({ key: `plate-${vehicle.id}`, label: `Biển số ${vehicle.license || vehicle.name}` }))]} title="Chụp biển số · Tự chọn xe bằng AI" value={platePhotos} onChange={setPlatePhotos} onBusyChange={setProcessingPlatePhoto} disabled={saving} ocr={plateOcr} />}
            <div className="mg-field mg-field-wide"><RecordPhotoFields key={`transaction-${photoVersion}`} entity="contracts" recordId={savedDraft?.id||row?.id} slots={contractPhotoSlots('rental')} title="Ảnh xe 4 góc, toàn cảnh & video" value={transactionMedia} onChange={setTransactionMedia} disabled={saving} onBusyChange={setProcessingMedia}/><p>Ảnh/video được lưu cùng bản nháp và tập hợp ở bước cuối với CCCD, GPLX và ảnh biển số. Chỉ gửi Telegram khi chủ động bấm Gửi toàn bộ.</p></div>
          </>)}
          {panel('payment', 'Chi phí', <>
            {!reserving && <div className="mg-contract-cost-section"><h3>Tiền cọc</h3><div className="mg-form-grid mg-contract-grid-two">
              {moneyField('deposit_amount', 'Số tiền đặt cọc (VNĐ)')}{paymentMethodField('deposit_payment_method', 'Hình thức dự kiến nhận cọc')}
            </div></div>}
            <div className="mg-contract-cost-section"><h3>Phí thuê xe</h3><div className="mg-form-grid mg-contract-grid-two">
              <div className="mg-field"><label htmlFor="contract-package_name">Gói thuê</label><select id="contract-package_name" value={draft.package_name} onChange={event => change('package_name',event.target.value)}>{['Theo ngày','Theo tuần','Theo tháng'].filter(value=>!canSaveDraft || ownership || (rentalType.startsWith('monthly') ? value === 'Theo tháng' : value !== 'Theo tháng')).map(value=><option key={value} value={value}>{value}</option>)}</select></div>
              {moneyField('unit_price', 'Đơn giá áp dụng (VNĐ)')}
              <div className="mg-field"><label htmlFor="contract-rental-base">Tiền thuê xe (VNĐ)</label><input id="contract-rental-base" readOnly value={formatMoneyInput(String(Math.max((Number(draft.total_amount)||0)-otherFees,0)))}/></div>
              {paymentMethodField('payment_method', 'Hình thức dự kiến thu thuê/phí')}
            </div></div>
            <div className="mg-contract-cost-section"><h3>Phí khác trong hợp đồng</h3>
              {(draft.extra_charges || []).map((item,index)=><div className="mg-extra-charge-row" key={index}>
                <div className="mg-field"><label htmlFor={`contract-charge-${index}-name`}>Tên khoản phí {index+1}</label><input id={`contract-charge-${index}-name`} value={item.name} maxLength={100} placeholder="Ví dụ: Phí ship" aria-invalid={Boolean(errors[`charge_${index}_name`])} onChange={event=>changeCharges((draft.extra_charges || []).map((row,i)=>i===index ? {...row,name:event.target.value} : row))}/>{errors[`charge_${index}_name`] && <p className="mg-field-error">{errors[`charge_${index}_name`]}</p>}</div>
                <div className="mg-field"><label htmlFor={`contract-charge-${index}-amount`}>Số tiền (VNĐ)</label><input id={`contract-charge-${index}-amount`} inputMode="numeric" value={formatMoneyInput(item.amount)} aria-invalid={Boolean(errors[`charge_${index}_amount`])} onChange={event=>changeCharges((draft.extra_charges || []).map((row,i)=>i===index ? {...row,amount:event.target.value.replace(/\D/g,'')} : row))}/>{errors[`charge_${index}_amount`] && <p className="mg-field-error">{errors[`charge_${index}_amount`]}</p>}</div>
                <div className="mg-field"><label htmlFor={`contract-charge-${index}-method`}>Hình thức thanh toán</label><select id={`contract-charge-${index}-method`} value={item.method || draftPaymentMethods(draft.payment_method)[0] || 'transfer'} onChange={event=>changeCharges((draft.extra_charges || []).map((row,i)=>i===index ? {...row,method:event.target.value as PaymentMethod} : row))}>{PAYMENT_METHODS.map(method=><option key={method.value} value={method.value}>{paymentMethodLabel(method.value)}</option>)}</select></div>
                <button type="button" className="mg-icon-button" aria-label={`Bỏ khoản phí ${index+1}`} onClick={()=>changeCharges((draft.extra_charges || []).filter((_,i)=>i!==index))}><Trash2 size={16}/></button>
              </div>)}
              <button type="button" className="mg-button" disabled={(draft.extra_charges || []).length>=20} onClick={()=>changeCharges([...(draft.extra_charges || []),{name:'',amount:'',method:draftPaymentMethods(draft.payment_method)[0] || 'transfer'}])}><Plus size={16}/>Thêm khoản phí</button>
              {errors.extra_charges && <p className="mg-field-error">{errors.extra_charges}</p>}
            </div>
            <div className="mg-form-grid mg-contract-grid-two">
              {moneyField('total_amount', 'Tổng tiền thuê và phí khác (VNĐ)', true)}
              <div className="mg-field"><label htmlFor="contract-amount-due">Tổng cần thu gồm cọc (VNĐ)</label><input id="contract-amount-due" readOnly value={formatMoneyInput(String((Number(draft.deposit_amount)||0)+(Number(draft.total_amount)||0)))}/><small>Gồm cọc + tiền thuê + phí khác. Đây là số cần thu, chưa phải tiền đã nhận.</small></div>
            </div>
            <p className="mg-composer-hint">Bấm Hoàn tất & thanh toán để xác nhận tiền đã nhận, chọn tài khoản/tiền mặt và lưu hợp đồng. Có thể ghi nhận đã thanh toán đủ, thu một phần hoặc chưa thu.</p>
          </>)}
          {panel('signing', 'Ký kết & Ghi chú', <div className="mg-form-grid mg-contract-grid-two">
            <div className="mg-field mg-field-wide"><label htmlFor="contract-collateral_description">Tài sản thế chấp / Đặt cọc tài sản</label><textarea id="contract-collateral_description" rows={3} value={draft.collateral_description} onChange={event => change('collateral_description', event.target.value)} placeholder="Chi tiết giấy tờ hoặc tài sản đặt cọc" />
              <div className="mg-collateral-options" role="group" aria-label="Chọn nhanh tài sản thế chấp">{['CCCD', 'BLX'].map(option => <button key={option} type="button" className={`mg-button${draft.collateral_description === option ? ' mg-button-primary' : ''}`} aria-pressed={draft.collateral_description === option} aria-controls="contract-collateral_description" onClick={() => change('collateral_description', option)}>{option}</button>)}</div>
            </div>
            <div className="mg-field"><label htmlFor="contract-signer-a">Người ký Bên A (Himoto)</label><input id="contract-signer-a" value={representative?.name || ''} readOnly placeholder="Theo đại diện đã chọn" /></div>
            <div className="mg-field"><label htmlFor="contract-signer-b">Người ký Bên B (Khách thuê)</label><input id="contract-signer-b" value={draft.customer.name} readOnly placeholder="Theo khách hàng đã chọn" /></div>
            <div className="mg-field mg-field-wide"><label htmlFor="contract-record-notes">Ghi chú hợp đồng</label><textarea id="contract-record-notes" rows={3} value={notes} onChange={event => setNotes(event.target.value)} /></div>
            <div className="mg-field mg-field-wide"><label htmlFor="contract-customer-warning_note">Cảnh báo</label><textarea id="contract-customer-warning_note" rows={2} value={draft.customer.warning_note} disabled={lookupState !== 'found'} onChange={event => setDraft(previous => ({ ...previous, customer: { ...previous.customer, warning_note: event.target.value } }))} /></div>
          </div>)}
          <div className="mg-contract-step-actions"><span>Phần {sectionIndex + 1} / {CONTRACT_FORM_SECTIONS.length}</span>
            <button type="button" className="mg-button" disabled={sectionIndex === 0} onClick={() => setSection(CONTRACT_FORM_SECTIONS[sectionIndex - 1].id)}><ChevronLeft size={16} />Quay lại</button>
            <button type="button" className="mg-button" disabled={sectionIndex === CONTRACT_FORM_SECTIONS.length - 1} onClick={() => setSection(CONTRACT_FORM_SECTIONS[sectionIndex + 1].id)}>Tiếp tục<ChevronRight size={16} /></button>
          </div>
          </fieldset>{saveError && <p className="mg-error-message" role="alert">{saveError}</p>}{profileMessage && <p className="mg-payment-success" role="status">{profileMessage}</p>}
        </div>
        <div className="mg-dialog-footer"><span className="mg-form-note">{canSaveDraft ? 'Hoàn tất & thanh toán để phát hành hợp đồng và xác nhận tiền đã nhận.' : '* Theo yêu cầu hồ sơ khi in'}</span><button type="button" className="mg-button" disabled={saving} onClick={onClose}>Đóng</button>
          {canSaveDraft && <button type="submit" value="draft" className="mg-button" disabled={saving || processingCustomerPhoto || processingPlatePhoto || processingMedia || processingLicense || customerOcr.pending || plateOcr.pending || !canSaveContractDrafts} title={!canSaveContractDrafts ? 'Chưa kết nối API lưu bản nháp' : undefined}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <Save size={16} />}{saving ? 'Đang lưu…' : 'Lưu nháp'}</button>}
          {canSaveDraft && source === 'api' && canSaveContractDrafts && canFinalizeContracts && <button type="submit" value="finalize" className="mg-button mg-button-finalize" disabled={saving || processingCustomerPhoto || processingPlatePhoto || processingMedia || processingLicense || customerOcr.pending || plateOcr.pending || staffLoading || lookupState === 'loading'} title={reserving ? 'Xác nhận tiền giữ xe, tạo phiếu thu và chờ giao xe' : 'Xác nhận tiền đã nhận, cấp số hợp đồng và chuyển sang Đang thuê'}><CheckCircle2 size={16} />{reserving ? 'Ghi nhận cọc giữ xe' : 'Hoàn tất & thanh toán'}</button>}
          {mode === 'edit' && !canSaveDraft && <button type="submit" className="mg-button mg-button-primary" disabled={saving || staffLoading || lookupState === 'loading'}>{saving ? <LoaderCircle size={16} className="mg-spin" /> : <Save size={16} />}{saving ? 'Đang lưu…' : 'Lưu hợp đồng'}</button>}
          {row && !canSaveDraft && source === 'api' && <button type="button" className="mg-button" disabled={saving || processingCustomerPhoto || processingPlatePhoto || processingMedia || processingLicense || customerOcr.pending || plateOcr.pending || !profileRevision} onClick={()=>void persistProfile()}><Save size={16}/>Lưu hồ sơ hợp đồng</button>}
          <button type="submit" value="preview" className={`mg-button${mode === 'print' ? ' mg-button-primary' : ''}`} disabled={saving || staffLoading || lookupState === 'loading'}><Printer size={16} />Xem mẫu in</button></div>
      </form>
    </Dialog>
    {customerModal && <CustomerCreateDialog allowIncomplete foreign={draft.customer.customer_type==='foreign'} idCard={draft.customer.customer_type==='foreign'?normalizeIdCard(idInput):/^\d{9}$|^\d{12}$/.test(normalizeIdCard(idInput)) ? normalizeIdCard(idInput) : ''} storeId={customerStoreId} onCreated={customerCreated} onClose={() => setCustomerModal(false)} />}
    {document && <ContractPrintPreview doc={document} contractId={savedDraft?.id || row?.id} onClose={() => setDocument(null)} />}
    {typeManagerOpen && <ContractTypeManager onClose={()=>setTypeManagerOpen(false)} onCreated={type=>{changeRentalType(type);setTypeManagerOpen(false);}} />}
    {finalizeTarget && <ContractFinalizeDialog orderId={finalizeTarget.id} revision={finalizeTarget.revision} code={finalizeTarget.code}
      total={Number(draft.total_amount) || 0} deposit={Number(draft.deposit_amount) || 0} reservation={reserving}
      depositMethods={draftPaymentMethods(draft.deposit_payment_method)} rentalMethods={draftPaymentMethods(draft.payment_method)} charges={draft.extra_charges}
      onClose={() => setFinalizeTarget(null)} onDone={result => { setFinalizeTarget(null); onClose(); onFinalized?.(result); }} />}
  </>;
}
