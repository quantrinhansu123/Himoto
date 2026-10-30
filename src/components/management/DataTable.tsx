'use client';

import { ArrowDown, ArrowLeftRight, ArrowUp, ArrowUpDown, BatteryCharging, Bike, CalendarPlus, Copy, Eye, FileSearch, LoaderCircle, MessageCircle, Pencil, Printer, RefreshCw, RotateCcw, ShieldBan, ShieldCheck, Trash2, TriangleAlert, Wallet } from 'lucide-react';
import { ManagementColumn, ManagementConfig, ManagementRow } from '@/lib/management/types';
import { optionLabel, statusTone } from '@/lib/management/config';
import { formatValue } from '@/lib/management/table-utils';
import { RowAction, RowActionsMenu } from './RowActionsMenu';
import { ManagementMobileList } from './ManagementMobileList';
import { useManagement } from './ManagementProvider';
import { isRemindableContract } from '@/lib/management/debt-reminders';
import { GpsEvidence } from './GpsEvidence';
import { ContractMonitoringAmount,ContractGpsIndicator } from './ContractMonitoringCells';
import { ContractRentalPeriod } from './ContractRentalPeriod';
import { canEditIssuedContract } from '@/lib/management/contract-profile';
import { ContractHoldStatus } from './ContractHoldStatus';
import { ContractCollectionNote } from './ContractCollectionNotes';
import { canFinalizeRentalContract,requiresOwnershipApproval } from '@/lib/management/contract-approval';
import { canEditOwnershipTerms } from '@/lib/management/ownership-terms';
import { vehicleHolderLabel, vehicleMissingOpenContract } from '@/lib/management/vehicle-holder';
import { contractHandoverBlockReason, contractRenewBlockReason, contractReturnBlockReason, vehicleTransferBlockReason } from '@/lib/management/blocked-actions';
import type { OpenVehicleRental } from '@/lib/management/vehicle-reservation-window';
import {ContractBranches,VehicleOwnerBranch} from './ContractBranches';
import { canCancelVehicleTransfer } from '@/lib/management/vehicle-history';

export function Cell({ row, column, config }: { row: ManagementRow; column: ManagementColumn; config: ManagementConfig }) {
  const value = row[column.key];
  if(config.kind==='vehicles'&&column.key==='beneficiary_store_name')return <span className="mg-cell-value" title={String(value||'')}>{value||(['using','rent'].includes(row.status)?'Chưa xác định':'—')}</span>;
  if(config.kind==='contracts'&&column.key==='collection_notes')return <ContractCollectionNote row={row}/>;
  if(config.kind==='contracts'&&column.key==='status'&&row.status==='reserved')return <ContractHoldStatus row={row} label={optionLabel(config,'status',row.status)}/>;
  if(column.key==='rental_period')return <ContractRentalPeriod row={row}/>;
  if(column.key==='monitoring_amount')return <ContractMonitoringAmount row={row}/>;
  if(column.key==='contract_gps_status')return <ContractGpsIndicator row={row}/>;
  if(column.key==='overdue_fee_estimate'&&value===undefined)return <span className="mg-cell-value" title="Thiếu hạn trả hoặc giá thuê ngày; nhập phí thực tế khi trả xe.">Cần đối chiếu</span>;
  if(config.kind==='vehicles'&&column.key==='location_status')return <><span className={`mg-status mg-status-${statusTone(String(value))}`}><span/>{optionLabel(config,column.key,String(value||''))}</span><GpsEvidence compact syncedAt={String(row.gps_last_sync||'')} heartbeatAt={String(row.gps_heartbeat_at||'')} positionAt={String(row.gps_position_at||'')}/></>;
  if(config.kind==='vehicles'&&column.key==='status'){
    const missing=vehicleMissingOpenContract(row);
    return <div className="mg-vehicle-status-cell"><span className={`mg-status mg-status-${missing?'yellow':statusTone(String(value))}`}><span />{optionLabel(config,column.key,String(value||''))}</span>
      {missing&&<span className="mg-vehicle-badge is-warn" role="status" title="Xe đang ở trạng thái Đang thuê nhưng không gắn hợp đồng mở. Chuyển Lưu kho hoặc lập hợp đồng."><TriangleAlert size={12} aria-hidden="true"/> Không có HĐ</span>}
    </div>;
  }
  if (column.format === 'status') return <span className={`mg-status mg-status-${statusTone(String(value))}`}><span />{optionLabel(config, column.key, String(value || ''))}</span>;
  if (column.format === 'code') return config.kind==='contracts'&&row.status==='reserved'?<span className="mg-contract-code-hold"><span className="mg-code">{value||'—'}</span><ContractHoldStatus row={row} label={optionLabel(config,'status',row.status)}/></span>:<span className="mg-code">{value || '—'}</span>;
  if (config.kind === 'vehicles' && column.key === 'holder_name') {
    const holder = vehicleHolderLabel(row.status,value);
    if (holder === 'Lưu kho') return <span className="mg-status mg-status-green"><span />Lưu kho</span>;
    if (holder === 'Chưa xác định khách' || holder === '—') return <span className="mg-cell-value">{holder}</span>;
    return <div className="mg-identity"><span className={`mg-avatar mg-avatar-${row.id % 4}`} aria-hidden="true">{holder.split(' ').filter(Boolean).slice(-2).map(word => word[0]).join('')}</span><div><strong title={holder}>{holder}</strong><ContractBranches row={{...row,store_name:row.beneficiary_store_name}}/></div></div>;
  }
  if((config.kind==='contracts'||config.kind==='vehicles')&&column.key==='license')return <div className="mg-plate-cell"><span className="mg-cell-value" title={String(value||'')}>{value||'—'}</span><VehicleOwnerBranch row={row}/></div>;
  if (column.format === 'person' || column.format === 'vehicle') {
    const holder=config.kind==='vehicles'&&column.key==='name'?vehicleHolderLabel(row.status,row.holder_name):'';
    return <div className={`mg-identity ${column.format === 'vehicle' ? 'mg-identity-vehicle' : ''}`}>
    {column.format === 'person' && <span className={`mg-avatar mg-avatar-${row.id % 4}`} aria-hidden="true">{String(value || '').split(' ').filter(Boolean).slice(-2).map(word => word[0]).join('')}</span>}
    <div>
      <strong title={String(value || '')}>{value || '—'}</strong>
      {config.kind==='contracts'&&column.key==='customer_name'?<ContractBranches row={row}/>:column.secondary && <small title={String(row[column.secondary] || '')}>{row[column.secondary] || '—'}</small>}
      {config.kind==='contracts'&&column.key==='vehicle_name'&&<VehicleOwnerBranch row={row}/>}
      {config.kind === 'vehicles' && column.key === 'name' && holder==='Lưu kho' && <span className="mg-status mg-status-green" style={{marginTop:4}}><span />Lưu kho</span>}
      {config.kind === 'vehicles' && column.key === 'name' && holder && holder!=='Lưu kho' && holder!=='—' && holder!=='Chưa xác định khách' && <>
        <small title={holder}>{holder}</small>
        <ContractBranches row={{...row,store_name:row.beneficiary_store_name}}/>
      </>}
      {config.kind === 'vehicles' && column.key === 'name' && vehicleMissingOpenContract(row) && <small className="mg-vehicle-missing-contract" role="status">Đang thuê · không có hợp đồng mở</small>}
    </div></div>;
  }
  const display = optionLabel(config, column.key, formatValue(value, column.format));
  return <span className={`mg-cell-value ${column.format === 'money' || column.format === 'number' ? 'mg-numeric' : ''}`} title={display}>{display}</span>;
}
interface Props {
  config: ManagementConfig;
  columns: ManagementColumn[];
  rows: ManagementRow[];
  offset: number;
  sortKey: string;
  sortDirection: 'asc' | 'desc';
  onSort: (key: string) => void;
  onView: (row: ManagementRow) => void;
  onEdit: (row: ManagementRow) => void;
  onDelete?: (row: ManagementRow) => void;
  onPrint?: (row: ManagementRow) => void;
  onPayment?: (row: ManagementRow) => void;
  onQr?: (row: ManagementRow) => void;
  onReminder?: (row: ManagementRow) => void;
  onTelegram?: (row: ManagementRow) => void;
  onHandover?: (row: ManagementRow) => void;
  onReturn?: (row: ManagementRow) => void;
  onMarkBadDebt?: (row: ManagementRow) => void;
  onRenew?: (row: ManagementRow) => void;
  onVehicleChange?: (row: ManagementRow) => void;
  onBatteryRent?: (row: ManagementRow) => void;
  onOwnershipTerms?: (row: ManagementRow) => void;
  onClone?: (row: ManagementRow) => void;
  onVehicleAction?: (row: ManagementRow, mode: 'transfer' | 'status' | 'receive' | 'reject' | 'cancel') => void;
  cloningId?: number | null;
  canEditContract?: boolean;
  canEditDraft?: boolean;
  canEdit: boolean;
  canDelete?: boolean;
  onBlacklist?: (row: ManagementRow) => void;
  blacklistBusyId?: number | null;
  loading: boolean;
  error: string;
  isFiltered: boolean;
  onReset: () => void;
  onRetry: () => void;
  selectedIds?: ReadonlySet<number>;
  onSelectionChange?: (ids: number[], selected: boolean) => void;
}

export function DataTable({ config, columns, rows, offset, sortKey, sortDirection, onSort, onView, onEdit, onDelete, onPrint, onPayment,onQr,onReminder,onTelegram, onHandover, onReturn, onMarkBadDebt, onRenew, onVehicleChange, onBatteryRent, onOwnershipTerms, onClone, onVehicleAction, cloningId, canEditContract, canEditDraft, canEdit, canDelete, onBlacklist, blacklistBusyId, loading, error, isFiltered, onReset, onRetry, selectedIds, onSelectionChange }: Props) {
  const {can,accessUser}=useManagement();
  const blockingError=rows.length?'':error;
  const selectable = Boolean(selectedIds && onSelectionChange);
  const columnCount = columns.length + (selectable ? 3 : 2);
  const pageIds = rows.map(row => row.id);
  const pageSelected = pageIds.filter(id => selectedIds?.has(id)).length;
  const rowActions = (row: ManagementRow): RowAction[] => {
    const isContract = config.kind === 'contracts';
    const isActiveContract = isContract && ['renting', 'overdue', 'wait_payment'].includes(row.status);
    const actions: RowAction[] = [{ key: 'view', label: 'Xem chi tiết', icon: <Eye size={16} />, onSelect: () => onView(row) }];
    if(isContract&&onTelegram&&row.status!=='draft')actions.push({key:'telegram',label:row.status==='cancelled'?'Lịch sử Telegram / Thu hồi tin':'Gửi Telegram',icon:<MessageCircle size={16}/>,onSelect:()=>onTelegram(row)});
    if (config.kind === 'vehicles' && onVehicleAction){
      if (can('vehicles.transfer')) {
        let rentals: OpenVehicleRental[] = [];
        try { rentals = JSON.parse(String(row.rentals_json || '[]')) as OpenVehicleRental[]; } catch { rentals = []; }
        const transferBlock = vehicleTransferBlockReason({
          selected: true,
          status: String(row.status) === 'rent' ? 'using' : String(row.status || ''),
          rentals,
          sameDestination: false,
          storeName: String(row.store_name || ''),
        });
        actions.push(transferBlock
          ? { key: 'transfer', label: 'Chuyển xe', icon: <ArrowLeftRight size={16} />, disabled: true, title: transferBlock, onSelect: () => {} }
          : { key: 'transfer', label: 'Chuyển xe', icon: <ArrowLeftRight size={16} />, onSelect: () => onVehicleAction(row, 'transfer') });
      }
      if(can('vehicles.write'))actions.push({ key: 'status', label: 'Đổi trạng thái', icon: <RefreshCw size={16} />, onSelect: () => onVehicleAction(row, 'status') });
    }
    if(config.kind==='vehicles'&&row.status==='in_transit'&&onVehicleAction){
      if(canCancelVehicleTransfer(row,accessUser?.id)&&can('vehicles.transfer'))actions.splice(1,0,{key:'cancel',label:'Huỷ điều chuyển',icon:<RotateCcw size={16}/>,danger:true,onSelect:()=>onVehicleAction(row,'cancel')});
      else if(!canCancelVehicleTransfer(row,accessUser?.id)&&can('vehicles.receive'))actions.splice(1,0,{key:'receive',label:'Nhận xe',icon:<Bike size={16}/>,onSelect:()=>onVehicleAction(row,'receive')},{key:'reject',label:'Từ chối điều chuyển',icon:<RotateCcw size={16}/>,onSelect:()=>onVehicleAction(row,'reject')});
    }
    if (isContract && onPrint) actions.push({ key: 'print', label: 'Điền và in hợp đồng', icon: <Printer size={16} />, onSelect: () => onPrint(row) });
    if(isContract&&onQr&&row.status!=='cancelled')actions.push({key:'qr',label:'Nhập phiếu chi',icon:<Wallet size={16}/>,onSelect:()=>onQr(row)});
    if(isContract&&onReminder&&isRemindableContract(row))actions.push({key:'reminder',label:'Nhắc nợ',icon:<MessageCircle size={16}/>,onSelect:()=>onReminder(row)});
    if (isContract && onPayment && !['draft', 'cancelled'].includes(row.status)) actions.push({ key: 'payment', label: 'Thanh toán', icon: <Wallet size={16} />, onSelect: () => onPayment(row) });
    if (isContract && onHandover) {
      const handoverBlock = row.status === 'deposit_contract' && !canFinalizeRentalContract(accessUser, row.rental_type)
        ? 'Tài khoản chưa có quyền giao xe cho loại hợp đồng này.'
        : contractHandoverBlockReason(String(row.status || ''));
      actions.push(handoverBlock
        ? { key: 'handover', label: 'Giao xe', icon: <Bike size={16} />, disabled: true, title: handoverBlock, onSelect: () => {} }
        : { key: 'handover', label: 'Giao xe', icon: <Bike size={16} />, onSelect: () => onHandover(row) });
    }
    if(isContract&&onPrint&&canFinalizeRentalContract(accessUser,row.rental_type)&&row.status==='deposit_contract')actions.push({key:'continue-reservation',label:'Bổ sung hồ sơ / Tiếp tục hợp đồng cọc',icon:<Pencil size={16}/>,onSelect:()=>onPrint(row)});
    if (isContract && onReturn) {
      const returnBlock = contractReturnBlockReason(String(row.status || ''));
      actions.push(returnBlock
        ? { key: 'return', label: 'Trả xe', icon: <RotateCcw size={16} />, disabled: true, title: returnBlock, onSelect: () => {} }
        : { key: 'return', label: 'Trả xe', title: 'Ghi nhận trả xe trực tiếp trên hợp đồng này', icon: <RotateCcw size={16} />, onSelect: () => onReturn(row) });
    }
    if(isActiveContract&&onMarkBadDebt&&can('contracts.return')&&(row.status==='overdue'||row.collection_overdue===1))actions.push({key:'mark-bad-debt',label:'Chuyển sang Nợ xấu',icon:<TriangleAlert size={16}/>,onSelect:()=>onMarkBadDebt(row)});
    if (isContract && onRenew) {
      const renewBlock = contractRenewBlockReason(String(row.status || ''), Boolean(row.billing_plan_json));
      actions.push(renewBlock
        ? { key: 'renew', label: 'Gia hạn', icon: <CalendarPlus size={16} />, disabled: true, title: renewBlock, onSelect: () => {} }
        : { key: 'renew', label: 'Gia hạn', title: 'Gia hạn trực tiếp trên hợp đồng', icon: <CalendarPlus size={16} />, onSelect: () => onRenew(row) });
    }
    if (isActiveContract && onVehicleChange) actions.push({ key: 'vehicle', label: 'Đổi xe', title: 'Đổi xe trực tiếp trên hợp đồng', icon: <Bike size={16} />, onSelect: () => onVehicleChange(row) });
    if (isContract && onBatteryRent && !['draft', 'cancelled'].includes(row.status)) actions.push({ key: 'battery', label: 'Thuê pin / sạc', title: 'Lập hợp đồng thuê pin hoặc sạc theo khách và xe của hợp đồng này', icon: <BatteryCharging size={16} />, onSelect: () => onBatteryRent(row) });
    if (isContract && onOwnershipTerms && !['draft', 'cancelled'].includes(row.status) && requiresOwnershipApproval(row.rental_type) && canEditOwnershipTerms(accessUser)) {
      actions.push({ key: 'ownership-terms', label: 'Sửa thời hạn / mức đóng', title: 'Sửa loại hợp đồng thuê sở hữu (6/12/24 tháng,…) và số tiền đóng mỗi ngày', icon: <Pencil size={16} />, onSelect: () => onOwnershipTerms(row) });
    }
    if (isContract && (canEditContract && row.status!=='draft' && canEditIssuedContract(accessUser,row.store_id) || canEditDraft && row.status === 'draft')) {
      const approve=row.status==='draft'&&requiresOwnershipApproval(row.rental_type)&&canFinalizeRentalContract(accessUser,row.rental_type);
      actions.push({key:approve?'approve':'edit',label:approve?'Duyệt hợp đồng':row.status==='draft'?'Tiếp tục sửa bản nháp':'Sửa hợp đồng',icon:approve?<ShieldCheck size={16}/>:<Pencil size={16}/>,onSelect:()=>onEdit(row)});
    }
    if (!isContract && canEdit) actions.push({ key: 'edit', label: 'Chỉnh sửa', icon: <Pencil size={16} />, onSelect: () => onEdit(row) });
    if (isContract && onClone) actions.push({ key: 'clone', label: cloningId === row.id ? 'Đang sao chép…' : 'Sao chép hợp đồng', disabled: cloningId != null,
      icon: cloningId === row.id ? <LoaderCircle size={16} className="mg-spin" /> : <Copy size={16} />, onSelect: () => onClone(row) });
    if (config.kind === 'customers' && onBlacklist) {
      const blacklisted = row.status === 'blacklist';
      actions.push({ key: 'blacklist', label: blacklistBusyId === row.id ? 'Đang đổi…' : blacklisted ? 'Bỏ Blacklist' : 'Đưa vào Blacklist',
        disabled: blacklistBusyId != null || !row.customer_revision, danger: !blacklisted,
        title: !row.customer_revision ? 'Nhấn Làm mới để tải phiên bản hồ sơ' : undefined,
        icon: blacklistBusyId === row.id ? <LoaderCircle size={16} className="mg-spin" /> : blacklisted ? <ShieldCheck size={16} /> : <ShieldBan size={16} />, onSelect: () => onBlacklist(row) });
    }
    if (canDelete && onDelete && (!isContract || row.status === 'draft' || row.status === 'deposit_contract' && canEditIssuedContract(accessUser, row.store_id))) {
      actions.push({ key: 'delete', label: isContract ? row.status === 'deposit_contract' ? 'Xóa hợp đồng cọc' : 'Xóa bản nháp' : `Xóa ${config.singular}`, danger: true, icon: <Trash2 size={16} />, onSelect: () => onDelete(row) });
    }
    return actions;
  };
  return <>{error&&rows.length>0&&<div className="mg-error-message" role="alert">Chưa làm mới được danh sách. Đang giữ dữ liệu đã tải. {error} <button type="button" className="mg-button" onClick={onRetry}>Thử lại</button></div>}
  <ManagementMobileList config={config} columns={columns} rows={rows} sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} onView={onView}
    actions={rowActions} busyId={cloningId ?? blacklistBusyId} loading={loading} error={blockingError} isFiltered={isFiltered} onReset={onReset} onRetry={onRetry}
    selectedIds={selectedIds} onSelectionChange={onSelectionChange} />
  <div className="mg-table-scroll mg-desktop-records" tabIndex={0} role="region" aria-label={`Bảng ${config.title.toLowerCase()}, cuộn ngang để xem thêm cột`}>
    <table className={`mg-table mg-table-${config.kind}`} aria-busy={loading}>
      <thead><tr>{selectable && <th scope="col" className="mg-select-column"><input type="checkbox" aria-label="Chọn tất cả dòng trên trang này" disabled={loading || Boolean(error) || !rows.length}
        checked={rows.length > 0 && pageSelected === rows.length} ref={input => { if (input) input.indeterminate = pageSelected > 0 && pageSelected < rows.length; }}
        onChange={event => onSelectionChange?.(pageIds, event.target.checked)} /></th>}<th scope="col" className="mg-index">STT</th>{columns.map(column => <th key={column.key} scope="col" className={`${column.align === 'right' ? 'mg-align-right' : ''}${column.key === 'code' ? ' mg-record-code' : ''}`}
        data-column={column.key} data-format={column.format} aria-sort={sortKey === column.key ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}>
        {column.sortable===false?<span>{column.label}</span>:<button type="button" className="mg-sort" onClick={() => onSort(column.key)} aria-label={`Sắp xếp theo ${column.label}`}><span>{column.label}</span>{sortKey === column.key ? sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ArrowUpDown size={12} />}</button>}
      </th>)}<th scope="col" className="mg-actions-column">Thao tác</th></tr></thead>
      <tbody>{loading ? <tr><td colSpan={columnCount}><div className="mg-table-state" role="status"><LoaderCircle className="mg-spin" size={26} /><strong>Đang tải danh sách…</strong><p>Thông tin sẽ xuất hiện trong giây lát.</p></div></td></tr>
        : blockingError ? <tr><td colSpan={columnCount}><div className="mg-table-state mg-table-error" role="alert"><FileSearch size={30} /><strong>Không tải được dữ liệu</strong><p>{blockingError}</p><button className="mg-button" onClick={onRetry}><RotateCcw size={15} />Thử lại</button></div></td></tr>
        : rows.length === 0 ? <tr><td colSpan={columnCount}><div className="mg-table-state"><FileSearch size={32} /><strong>{isFiltered ? 'Không tìm thấy kết quả' : 'Danh sách đang trống'}</strong><p>{isFiltered ? 'Thử từ khóa khác hoặc bỏ bớt bộ lọc.' : 'Chưa có bản ghi để hiển thị.'}</p>{isFiltered && <button className="mg-button" onClick={onReset}>Xóa bộ lọc</button>}</div></td></tr>
        : rows.map((row, index) => <tr key={row.id} className={selectedIds?.has(row.id) ? 'is-selected' : undefined}>{selectable && <td className="mg-select-column"><input type="checkbox" aria-label={`Chọn ${row.code || row.name || `#${row.id}`}`}
          checked={Boolean(selectedIds?.has(row.id))} onChange={event => onSelectionChange?.([row.id], event.target.checked)} /></td>}<td className="mg-index">{offset + index + 1}</td>{columns.map(column => <td key={column.key} data-column={column.key} data-format={column.format} className={`${column.align === 'right' ? 'mg-align-right' : ''}${column.key === 'code' ? ' mg-record-code' : ''}`}><Cell row={row} column={column} config={config} /></td>)}
          <td className="mg-actions-column"><div className="mg-row-actions">
            {config.kind==='contracts'&&row.status==='draft'&&canEditDraft&&requiresOwnershipApproval(row.rental_type)&&canFinalizeRentalContract(accessUser,row.rental_type)&&<button type="button" className="mg-button mg-button-primary" onClick={()=>onEdit(row)}><ShieldCheck size={16}/>Duyệt hợp đồng</button>}
            {config.kind==='vehicles'&&onVehicleAction&&can('vehicles.transfer')&&canCancelVehicleTransfer(row,accessUser?.id)&&<button type="button" className="mg-button mg-button-danger" onClick={()=>onVehicleAction(row,'cancel')}>Huỷ điều chuyển</button>}
            {config.kind==='vehicles'&&row.status==='in_transit'&&onVehicleAction&&can('vehicles.receive')&&!canCancelVehicleTransfer(row,accessUser?.id)&&<>
              <button type="button" className="mg-button mg-button-primary" onClick={()=>onVehicleAction(row,'receive')}>Nhận xe</button>
              <button type="button" className="mg-button" onClick={()=>onVehicleAction(row,'reject')}>Từ chối điều chuyển</button>
            </>}
            {config.kind==='staff'&&canEdit&&<button type="button" className="mg-icon-button" title="Chỉnh sửa" aria-label={`Chỉnh sửa ${row.name || row.code || ''}`} onClick={()=>onEdit(row)}><Pencil size={16} /></button>}
            {config.kind==='staff'&&canDelete&&onDelete&&<button type="button" className="mg-icon-button is-danger" title="Xóa nhân sự" aria-label={`Xóa ${row.name || row.code || ''}`} onClick={()=>onDelete(row)}><Trash2 size={16} /></button>}
            <RowActionsMenu label={`Thao tác ${row.license || row.code || row.name || ''}`.trim()} actions={rowActions(row)} busy={cloningId === row.id || blacklistBusyId === row.id} />
          </div></td></tr>)}</tbody>
    </table>
  </div></>;
}
