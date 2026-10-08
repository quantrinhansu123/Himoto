'use client';

import { ReactNode, useState } from 'react';
import { Printer } from 'lucide-react';
import { Dialog } from './Dialog';
import { useManagement } from './ManagementProvider';
import { ContractSection, ContractSectionTabs } from '@/components/contracts/ContractSectionTabs';
import { createContractDraft } from '@/lib/management/contract-document';
import { ManagementRow } from '@/lib/management/types';
import { MANAGEMENT_CONFIG, optionLabel } from '@/lib/management/config';
import { formatDateTime, formatMoney } from '@/lib/formatters';

const SECTIONS = [
  { id: 'vehicle', label: 'Thông tin phương tiện' },
  { id: 'contract', label: 'Thông tin hợp đồng' },
  { id: 'customer', label: 'Khách hàng (Bên B)' },
  { id: 'payment', label: 'Chi phí' },
  { id: 'signing', label: 'Ký kết & ghi chú' },
] as const;
const text = (value: unknown) => value == null || value === '' ? '—' : String(value);
const money = (value: unknown) => value == null || value === '' || !Number.isFinite(Number(value)) ? '—' : formatMoney(Number(value));
const dateTime = (value: string) => value ? formatDateTime(value) : '—';
const date = (value: string) => value ? new Date(value).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';

export function ContractDetail({ row, onClose, onPrint, onPayment }: { row: ManagementRow; onClose: () => void; onPrint: () => void; onPayment?: () => void }) {
  const { dataset } = useManagement();
  const [section, setSection] = useState<ContractSection>('vehicle');
  const draft = createContractDraft(dataset || { stores: [], staff: [], customers: [], contracts: [], vehicles: [] }, 'all', row);
  const savedDraft = Boolean(row.draft_json);
  const pricing = savedDraft ? draft : row;
  const legacyVehicles = JSON.parse(String(row.legacy_items_json || '[]')) as Record<string, unknown>[];
  const sourceVehicles = legacyVehicles.length ? legacyVehicles : JSON.parse(String(row.vehicles_json || '[]')) as Record<string, unknown>[];
  const representative = dataset?.staff.find(person => String(person.id) === draft.staff_id);
  const store = dataset?.stores.find(store => String(store.id) === draft.store_id);
  function fields(values: [string, ReactNode][]) {
    return <dl className="mg-contract-detail-grid">{values.map(([label, value]) => <div key={label}
      className={['Địa chỉ thường trú / tạm trú', 'Thông tin người thân', 'Ghi chú hợp đồng', 'Cảnh báo', 'Tài sản thế chấp / Đặt cọc tài sản'].includes(label) ? 'mg-field-wide' : undefined}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
  }
  function panel(id: ContractSection, title: string, children: ReactNode) {
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
          {fields([['Tên xe', text(vehicle.name)], ['Biển số', text(vehicle.license)], ['Màu xe', text(vehicle.color)],
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
        ['Ngày ký hợp đồng', date(draft.signed_on)], ['Ngày tạo hợp đồng', date(draft.created_on || String(row.created_at || ''))],
        ['Nguồn khách', text(draft.customer_source)], ['Liên kết nguồn khách', text(draft.customer_source_url)],
      ]))}
      {panel('customer', 'Thông tin khách hàng (Bên B)', fields([
        ['Cửa hàng xe', text(store?.name || row.store_name)], ['Đại diện ủy quyền Bên A (Nhân viên làm hợp đồng)', text(representative?.name)],
        ['Tên khách hàng', text(draft.customer.name)], ['SĐT', text(draft.customer.phone)],
        ['Số CMTND/CCCD', text(draft.customer.id_card)], ['Ngày cấp CCCD', date(draft.customer.id_card_issued_on)],
        ['Nơi cấp CCCD', text(draft.customer.id_card_issued_by)], ['Địa chỉ thường trú / tạm trú', text(draft.customer.address)],
        ['Người thân 1', text(draft.relatives[0] ? `${draft.relatives[0].name}${draft.relatives[0].relationship ? ` (${draft.relatives[0].relationship})` : ''}${draft.relatives[0].phone ? `: ${draft.relatives[0].phone}` : ''}` : '')],
        ['Người thân 2', text(draft.relatives[1] ? `${draft.relatives[1].name}${draft.relatives[1].relationship ? ` (${draft.relatives[1].relationship})` : ''}${draft.relatives[1].phone ? `: ${draft.relatives[1].phone}` : ''}` : '')],
      ]))}
      {panel('payment', 'Chi phí', <>
        <div className="mg-contract-cost-section"><h3>Tiền cọc</h3>{fields([
          ['Số tiền đặt cọc', money(pricing.deposit_amount)], ['Hình thức đặt cọc', text(pricing.deposit_payment_method)],
        ])}</div>
        <div className="mg-contract-cost-section"><h3>Phí thuê xe</h3>{fields([
          ['Gói thuê', text(pricing.package_name)], ['Đơn giá áp dụng', money(pricing.unit_price)],
          ['Tổng phí thuê xe', money(pricing.total_amount)], ['Số tiền đã thanh toán', money(pricing.paid_amount)], ['Hình thức thanh toán', text(pricing.payment_method)],
        ])}</div>
      </>)}
      {panel('signing', 'Ký kết & Ghi chú', fields([
        ['Tài sản thế chấp / Đặt cọc tài sản', text(draft.collateral_description)],
        ['Người ký Bên A (Himoto)', text(representative?.name)], ['Người ký Bên B (Khách thuê)', text(draft.customer.name)],
        ['Ghi chú hợp đồng', text(row.notes)], ['Cảnh báo', text(draft.customer.warning_note)],
      ]))}
    </div>
    <div className="mg-dialog-footer"><button type="button" className="mg-button" onClick={onClose}>Đóng</button>
      {row.status !== 'draft' && onPayment && <button type="button" className="mg-button" onClick={onPayment}>Thanh toán / Lịch sử</button>}
      <button type="button" className="mg-button mg-button-primary" onClick={onPrint}><Printer size={16} />In hợp đồng</button></div>
  </Dialog>;
}
