'use client';

import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Bike, CalendarPlus, Eye, LoaderCircle, Plus, Printer, RotateCcw, Wallet } from 'lucide-react';
import { Dialog } from './Dialog';
import { CashflowColumns, cashflowTotals } from './CashflowColumns';
import { useManagement } from './ManagementProvider';
import { ContractSectionTabs } from '@/components/contracts/ContractSectionTabs';
import { contractStaffStoreId, createContractDraft } from '@/lib/management/contract-document';
import { CHANGE_LABELS, ContractHistory, loadContractHistory } from '@/lib/management/contract-history';
import { ManagementRow } from '@/lib/management/types';
import { MANAGEMENT_CONFIG, optionLabel } from '@/lib/management/config';
import { formatDateTime, formatMoney } from '@/lib/formatters';
import { MobileDetailsCard } from './MobileDetailsCard';

const SECTIONS = [
  { id: 'vehicle', label: 'Thông tin phương tiện' },
  { id: 'contract', label: 'Hợp đồng' },
  { id: 'customer', label: 'Khách hàng (Bên B)' },
  { id: 'payment', label: 'Chi phí' },
  { id: 'signing', label: 'Ký kết & ghi chú' },
  { id: 'changes', label: 'Lịch sử chỉnh sửa' },
  { id: 'cashflow', label: 'Lịch sử thu chi' },
] as const;
type DetailSection = (typeof SECTIONS)[number]['id'];
const text = (value: unknown) => value == null || value === '' ? '—' : String(value);
const money = (value: unknown) => value == null || value === '' || !Number.isFinite(Number(value)) ? '—' : formatMoney(Number(value));
const dateTime = (value: string) => value ? formatDateTime(value) : '—';
const date = (value: string) => value ? new Date(value).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
const millis = (value: unknown) => {
  const raw = value == null ? '' : String(value);
  return raw ? new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw) ? `${raw}:00+07:00` : raw).getTime() : NaN;
};
function rentalDays(start: unknown, end: unknown) {
  const from = millis(start), to = millis(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return '—';
  const minutes = Math.round((to - from) / 60_000);
  const days = Math.floor(minutes / 1440), hours = Math.ceil((minutes % 1440) / 60);
  return hours === 24 ? `${days + 1} ngày` : `${days} ngày${hours ? ` ${hours} giờ` : ''}`;
}

export type ContractVersionPrint = { end_date: string | null; total_amount: number | null; paid_amount: number | null };

export function ContractDetail({ row, onClose, onPrint, onPrintVersion, onPayment, onReturn, onRenew, onVehicleChange }: { row: ManagementRow; onClose: () => void; onPrint: () => void; onPrintVersion?: (version: ContractVersionPrint) => void; onPayment?: () => void; onReturn?: () => void; onRenew?: () => void; onVehicleChange?: () => void }) {
  const { dataset, source } = useManagement();
  const [section, setSection] = useState<DetailSection>('vehicle');
  const [viewingVersion, setViewingVersion] = useState('');
  const [history, setHistory] = useState<ContractHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const wantsHistory = section === 'changes' || section === 'cashflow';
  const fetchHistory = useCallback((signal?: AbortSignal) => {
    setHistoryLoading(true); setHistoryError('');
    loadContractHistory(row.id, signal).then(value => { if (!signal?.aborted) setHistory(value); }).catch(cause => {
      if (!signal?.aborted) setHistoryError(cause instanceof Error ? cause.message : 'Không tải được lịch sử hợp đồng.');
    }).finally(() => { if (!signal?.aborted) setHistoryLoading(false); });
  }, [row.id]);
  useEffect(() => {
    if (!wantsHistory || history || source !== 'api') return;
    const controller = new AbortController();
    fetchHistory(controller.signal);
    return () => controller.abort();
  }, [wantsHistory, history, source, fetchHistory]);
  const draft = createContractDraft(dataset || { stores: [], staff: [], customers: [], contracts: [], vehicles: [] }, 'all', row);
  const savedDraft = Boolean(row.draft_json);
  const pricing = savedDraft ? draft : row;
  const legacyVehicles = JSON.parse(String(row.legacy_items_json || '[]')) as Record<string, unknown>[];
  const sourceVehicles = legacyVehicles.length ? legacyVehicles : JSON.parse(String(row.vehicles_json || '[]')) as Record<string, unknown>[];
  const representative = dataset?.staff.find(person => String(person.id) === draft.staff_id);
  const store = dataset?.stores.find(store => String(store.id) === draft.store_id);
  const canOperateRental = ['renting', 'overdue', 'wait_payment'].includes(row.status);
  function fields(values: [string, ReactNode][]) {
    return <dl className="mg-contract-detail-grid">{values.map(([label, value]) => <div key={label}
      className={['Địa chỉ thường trú / tạm trú', 'Thông tin người thân', 'Ghi chú hợp đồng', 'Cảnh báo', 'Tài sản thế chấp / Đặt cọc tài sản'].includes(label) ? 'mg-field-wide' : undefined}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
  }
  function historyState(empty: boolean, emptyText: string) {
    if (source !== 'api') return <p className="mg-contract-history-state">Lịch sử chỉ có khi kết nối dữ liệu Supabase.</p>;
    if (historyLoading && !history) return <p className="mg-contract-history-state" role="status"><LoaderCircle size={16} className="mg-spin" /> Đang tải lịch sử…</p>;
    if (historyError) return <p className="mg-contract-history-state mg-field-error" role="alert">{historyError}</p>;
    if (history && empty) return <p className="mg-contract-history-state">{emptyText}</p>;
    return null;
  }
  const refreshButton = source === 'api' && <button type="button" className="mg-button" disabled={historyLoading} onClick={() => fetchHistory()}>
    {historyLoading ? <LoaderCircle size={15} className="mg-spin" /> : <RotateCcw size={15} />}Làm mới</button>;
  const { income: incomeTotal, expense: expenseTotal } = cashflowTotals(history?.cashflow || []);
  const versionTimes = (history?.changes || []).filter(change => change.kind === 'created' || change.version)
    .map(change => new Date(change.at).getTime()).sort((a, b) => a - b);
  function panel(id: DetailSection, title: string, children: ReactNode) {
    return <section id={`contract-detail-panel-${id}`} role="tabpanel" aria-labelledby={`contract-detail-tab-${id}`}
      hidden={section !== id} className="mg-contract-panel"><h3 className="mg-contract-section-title">{title}</h3>{children}</section>;
  }
  return <Dialog title={`Chi tiết hợp đồng: ${row.code}`} subtitle={optionLabel(MANAGEMENT_CONFIG.contracts, 'status', row.status)}
    className="mg-contract-detail" onClose={onClose}>
    <div className="mg-dialog-body">
      <ContractSectionTabs prefix="contract-detail" sections={SECTIONS} active={section} onChange={setSection} />
      {panel('vehicle', 'Thông tin phương tiện', <>
        {fields([['Thuê lúc', dateTime(draft.start_date)], ['Hẹn trả', dateTime(draft.end_date)]])}
        {draft.vehicles.map((vehicle, index) => <div className="mg-composer-vehicle" key={index}>
          <div className="mg-composer-vehicle-header"><strong>Thông tin xe thuê số {index + 1}</strong></div>
          {fields([['Tên xe', text(vehicle.name)], ['Biển số', text(vehicle.license)], ['Cơ sở quản lý xe lúc lập hợp đồng', text(vehicle.stock_store_name)], ['Màu xe', text(vehicle.color)],
            ['Loại xe', text(vehicle.type_text)], ['Hãng xe', text(vehicle.brand)], ['Đời xe', text(vehicle.year)],
            ['Tên người lái', text(vehicle.driver_name)], ['Số GP lái xe', text(vehicle.driver_license_number)],
            ['Ngày cấp GPLX', date(vehicle.driver_license_issued_on)],
            ['Số mũ mượn', text(savedDraft ? vehicle.borrow_hats : sourceVehicles[index]?.borrow_hats)],
            ['Số áo mưa', text(savedDraft ? vehicle.borrow_raincoats : sourceVehicles[index]?.borrow_raincoats)]])}
        </div>)}
      </>)}
      {panel('contract', 'Thông tin hợp đồng & Pháp lý', fields([
        ['Mã hợp đồng / Số HĐ giấy', row.code], ['Trạng thái hợp đồng', optionLabel(MANAGEMENT_CONFIG.contracts, 'status', row.status)],
        ['Loại hợp đồng', row.rental_type ? optionLabel(MANAGEMENT_CONFIG.contracts, 'rental_type', String(row.rental_type)) : '—'],
        ...(row.rental_type === 'ownership' ? [['Thời hạn sở hữu',optionLabel(MANAGEMENT_CONFIG.contracts,'ownership_term_months',String(row.ownership_term_months || 'custom'))] as [string,string]] : []),
        ['Ngày ký hợp đồng', date(draft.signed_on)], ['Ngày tạo hợp đồng', date(draft.created_on || String(row.created_at || ''))],
        ['Nguồn khách', text(draft.customer_source)], ['Liên kết nguồn khách', text(draft.customer_source_url)],
      ]))}
      {panel('customer', 'Thông tin khách hàng (Bên B)', fields([
        ['Cửa hàng xe', text(dataset?.stores.find(store => String(store.id) === contractStaffStoreId(draft))?.name)],
        ['Cơ sở nguồn khách / doanh thu', text(store?.name || row.store_name)], ['Đại diện ủy quyền Bên A (Nhân viên làm hợp đồng)', text(draft.staff_name || representative?.name || row.staff_name)],
        ['Tên khách hàng', text(draft.customer.name)], ['SĐT', text(draft.customer.phone)],
        ['Số CMTND/CCCD', text(draft.customer.id_card)], ['Ngày cấp CCCD', date(draft.customer.id_card_issued_on)],
        ['Nơi cấp CCCD', text(draft.customer.id_card_issued_by)], ['Số giấy phép lái xe', text(draft.customer.driver_license_number)],
        ['Ngày cấp GPLX', date(draft.customer.driver_license_issued_on)], ['Nơi ở hiện tại', text(draft.customer.address)],
        ['Người thân 1', text(draft.relatives[0] ? `${draft.relatives[0].name}${draft.relatives[0].relationship ? ` (${draft.relatives[0].relationship})` : ''}${draft.relatives[0].phone ? `: ${draft.relatives[0].phone}` : ''}` : '')],
        ['Người thân 2', text(draft.relatives[1] ? `${draft.relatives[1].name}${draft.relatives[1].relationship ? ` (${draft.relatives[1].relationship})` : ''}${draft.relatives[1].phone ? `: ${draft.relatives[1].phone}` : ''}` : '')],
      ]))}
      {panel('payment', 'Chi phí', <>
        <div className="mg-contract-cost-section"><h3>Thời gian thuê</h3>{fields([
          ['Thuê lúc', dateTime(draft.start_date)], ['Hẹn trả', dateTime(draft.end_date)], ['Số ngày thuê', rentalDays(draft.start_date, draft.end_date)],
        ])}
          {sourceVehicles.some(vehicle => vehicle.rent_at) && <div className="mg-mobile-records"><ul className="mg-mobile-card-list">{sourceVehicles.map((vehicle, index) => <MobileDetailsCard key={index} title={text(vehicle.license || vehicle.name)}
            summary={<><span>{rentalDays(vehicle.rent_at, vehicle.completed_at || vehicle.return_at)}</span><span>{vehicle.completed_at ? 'Đã trả' : 'Đang thuê'}</span></>}
            fields={[["Thuê lúc", dateTime(String(vehicle.rent_at || ''))], ["Hẹn trả / Đã trả", dateTime(String(vehicle.completed_at || vehicle.return_at || ''))], ["Số ngày thuê", rentalDays(vehicle.rent_at, vehicle.completed_at || vehicle.return_at)]]} />)}</ul></div>}
          {sourceVehicles.some(vehicle => vehicle.rent_at) && <table className="mg-contract-days mg-desktop-records">
            <thead><tr><th>Xe</th><th>Thuê lúc</th><th>Hẹn trả / Đã trả</th><th>Số ngày thuê</th></tr></thead>
            <tbody>{sourceVehicles.map((vehicle, index) => {
              const end = vehicle.completed_at || vehicle.return_at;
              return <tr key={index}><td>{text(vehicle.license || vehicle.name)}</td><td>{dateTime(String(vehicle.rent_at || ''))}</td>
                <td>{dateTime(String(end || ''))}{vehicle.completed_at ? ' (đã trả)' : ''}</td><td>{rentalDays(vehicle.rent_at, end)}</td></tr>;
            })}</tbody></table>}
        </div>
        <div className="mg-contract-cost-section"><h3>Tiền cọc (tách riêng, không trừ vào tiền thuê)</h3>{fields([
          ['Số tiền đặt cọc', money(pricing.deposit_amount)], ['Hình thức đặt cọc', text(pricing.deposit_payment_method)],
          ['Cọc đã thu', money(row.deposit_paid)], ['Đã trả cọc', money(row.deposit_refunded)],
          ['Cọc đang giữ', money(Math.max((Number(row.deposit_paid) || 0) - (Number(row.deposit_refunded) || 0), 0))],
        ])}</div>
        <div className="mg-contract-cost-section"><h3>Phí thuê xe</h3>{fields([
          ['Gói thuê', text(pricing.package_name)], ['Đơn giá áp dụng', money(pricing.unit_price)],
          ['Tổng phí thuê xe', money(row.total_amount ?? pricing.total_amount)], ['Phát sinh trả xe (+ trễ / − trả sớm)', money(row.return_adjustment_amount)],
          ['Đã thu tiền thuê', money(row.paid_amount)], ['Còn thiếu tiền thuê', row.total_amount == null || row.paid_amount == null ? '—' : money(Math.max(Number(row.total_amount) - Number(row.paid_amount), 0))],
          ['Hình thức thanh toán', text(pricing.payment_method)],
        ])}</div>
        {row.billing_plan_json && <div className="mg-contract-cost-section"><h3>Lịch đóng tiền thuê sở hữu</h3>{fields([
          ['Tiền thuê theo lịch (cọc riêng)', money(row.billing_expected_total)],
          ['Đã đóng đủ kỳ', `${row.billing_paid_periods ?? '—'} / ${row.billing_period_count ?? '—'}`],
          ['Ngày hẹn cần đóng tiếp theo', row.billing_next_due_at ? dateTime(String(row.billing_next_due_at)) : 'Không còn khoản đến hẹn'],
          ['Tiền đến hạn còn thiếu', money(row.billing_due_amount)],
        ])}</div>}
        {draft.extra_charges && draft.extra_charges.length>0 && <div className="mg-contract-cost-section"><h3>Phí khác trong hợp đồng (đã tính trong tổng phí)</h3>{fields(draft.extra_charges.filter(item=>Number(item.amount)>0).map(item=>[item.name,money(item.amount)]))}</div>}
      </>)}
      {panel('signing', 'Ký kết & Ghi chú', fields([
        ['Tài sản thế chấp / Đặt cọc tài sản', text(draft.collateral_description)],
        ['Người ký Bên A (Himoto)', text(draft.staff_name || representative?.name || row.staff_name)], ['Người ký Bên B (Khách thuê)', text(draft.customer.name)],
        ['Ghi chú hợp đồng', text(row.notes)], ['Cảnh báo', text(draft.customer.warning_note)],
      ]))}
      {panel('changes', 'Danh sách chỉnh sửa hợp đồng', <>
        <div className="mg-contract-history-toolbar"><p>Ghi nhận tạo hợp đồng, gia hạn, thu thêm, đổi xe và trả xe.</p>{refreshButton}</div>
        {historyState(!history?.changes.length, 'Chưa có lần chỉnh sửa nào.')}
        {history && history.changes.length > 0 && <ol className="mg-contract-changes">{history.changes.map(change => {
          const printable = change.kind === 'created' || Boolean(change.version);
          const version: ContractVersionPrint = change.version
            ? { end_date: change.version.return_at, total_amount: change.version.total, paid_amount: change.version.paid }
            : { end_date: null, total_amount: null, paid_amount: null };
          const open = viewingVersion === change.id;
          const at = new Date(change.at).getTime();
          const until = versionTimes.find(time => time > at) ?? Infinity;
          const receipts = history.cashflow.filter(item => new Date(item.at).getTime() < until);
          return <li key={change.id} className={`is-${change.kind}`}>
            <span className="mg-contract-change-kind">{CHANGE_LABELS[change.kind]}</span>
            <div><strong>{change.title}{change.amount ? ` · ${change.amount < 0 ? '−' : ''}${formatMoney(Math.abs(change.amount))}` : ''}</strong>
              {change.detail && <p>{change.detail}</p>}
              <small>{dateTime(change.at)} · {change.actor}</small>
              {open && <div className="mg-contract-version-view">
                {fields([['Phiên bản', change.version?.label || 'Hợp đồng hiện tại'], ['Thuê lúc', dateTime(draft.start_date)],
                  ['Hẹn trả', change.version?.return_at ? dateTime(change.version.return_at) : dateTime(draft.end_date)],
                  ['Tiền thuê', change.version ? money(change.version.total) : money(row.total_amount)],
                  ['Số ngày thuê', rentalDays(draft.start_date, change.version?.return_at || draft.end_date)],
                  ['Xe', text(draft.vehicles.map(vehicle => vehicle.license || vehicle.name).filter(Boolean).join(', '))]])}
                <h4>Lịch sử thanh toán đến thời điểm này</h4>
                {receipts.length ? <CashflowColumns items={receipts} /> : <p className="mg-contract-history-state">Chưa có phiếu thu / chi.</p>}
              </div>}
            </div>
            {printable && <div className="mg-contract-change-actions">
              <button type="button" className="mg-button" aria-expanded={open} onClick={() => setViewingVersion(open ? '' : change.id)}><Eye size={14} />{open ? 'Ẩn' : 'Xem'}</button>
              <button type="button" className="mg-button" onClick={() => change.version && onPrintVersion ? onPrintVersion(version) : onPrint()}><Printer size={14} />In</button>
            </div>}
          </li>;
        })}</ol>}
      </>)}
      {panel('cashflow', 'Lịch sử thu chi', <>
        <div className="mg-contract-history-toolbar"><p>Tất cả phiếu thu / chi gắn với hợp đồng trong Sổ quỹ / Sổ két.</p><div>
          {row.status !== 'draft' && row.status !== 'cancelled' && onPayment && <button type="button" className="mg-button mg-button-primary" onClick={onPayment}><Plus size={15} />Thêm phiếu thu</button>}
          {refreshButton}</div></div>
        {history && history.cashflow.length > 0 && <dl className="mg-payment-totals"><div><dt>Tổng thu (đã duyệt)</dt><dd>{formatMoney(incomeTotal)}</dd></div>
          <div><dt>Tổng chi (đã duyệt)</dt><dd>{formatMoney(expenseTotal)}</dd></div><div><dt>Chênh lệch</dt><dd>{formatMoney(incomeTotal - expenseTotal)}</dd></div></dl>}
        {historyState(!history?.cashflow.length, 'Chưa có phiếu thu / chi nào cho hợp đồng này.')}
        {history && history.cashflow.length > 0 && <CashflowColumns items={history.cashflow} />}
      </>)}
    </div>
    <div className="mg-dialog-footer"><button type="button" className="mg-button" onClick={onClose}>Đóng</button>
      {canOperateRental && <>
        <button type="button" className="mg-button" onClick={onReturn}><RotateCcw size={15} />Trả xe</button>
        {!row.billing_plan_json && <button type="button" className="mg-button" onClick={onRenew}><CalendarPlus size={15} />Gia hạn</button>}
        <button type="button" className="mg-button" onClick={onVehicleChange}><Bike size={15} />Đổi xe</button>
      </>}
      {row.status !== 'draft' && onPayment && <button type="button" className="mg-button" onClick={onPayment}><Wallet size={15} />Thu chi / Lịch sử</button>}
      <button type="button" className="mg-button mg-button-primary" onClick={onPrint}><Printer size={16} />In hợp đồng</button></div>
  </Dialog>;
}
