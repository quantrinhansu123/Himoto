'use client';

import { ReactNode, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, LoaderCircle, RotateCcw } from 'lucide-react';
import { Dialog } from './Dialog';
import { useManagement } from './ManagementProvider';
import { CashflowColumns, cashflowTotals } from './CashflowColumns';
import { ContractSectionTabs } from '@/components/contracts/ContractSectionTabs';
import { ContractCashflow, loadCustomerCashflow, loadCustomerContracts } from '@/lib/management/contract-history';
import { MANAGEMENT_CONFIG, optionLabel, statusTone } from '@/lib/management/config';
import { formatValue } from '@/lib/management/table-utils';
import { ManagementConfig, ManagementRow } from '@/lib/management/types';
import { formatDateTime, formatMoney } from '@/lib/formatters';

const SECTIONS = [
  { id: 'details', label: 'Chi tiết' },
  { id: 'contracts', label: 'Hợp đồng' },
  { id: 'payments', label: 'Thanh toán' },
] as const;
type CustomerSection = (typeof SECTIONS)[number]['id'];
const amount = (value: unknown) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const money = (value: number | null) => value === null ? '—' : formatMoney(value);

export function CustomerDetail({ row, config, canEdit, onEdit, onClose }: { row: ManagementRow; config: ManagementConfig; canEdit: boolean; onEdit: () => void; onClose: () => void }) {
  const { source } = useManagement();
  const [section, setSection] = useState<CustomerSection>('details');
  const [cashflow, setCashflow] = useState<ContractCashflow[] | null>(null);
  const [cashflowLoading, setCashflowLoading] = useState(false);
  const [cashflowError, setCashflowError] = useState('');
  const [contractRows, setContractRows] = useState<ManagementRow[] | null>(null);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [contractsError, setContractsError] = useState('');
  const contracts = (contractRows || []).filter(contract => contract.customer_id === row.id && contract.status !== 'draft')
    .sort((a, b) => String(b.start_date || b.created_at || '').localeCompare(String(a.start_date || a.created_at || '')));
  const contractTotal = contracts.reduce((sum, contract) => sum + (amount(contract.total_amount) || 0), 0);
  const contractPaid = contracts.reduce((sum, contract) => sum + (amount(contract.paid_amount) || 0), 0);
  const contractDebt = contracts.reduce((sum, contract) => sum + Math.max((amount(contract.total_amount) || 0) - (amount(contract.paid_amount) || 0), 0), 0);

  const fetchContracts = useCallback((signal?: AbortSignal) => {
    setContractsLoading(true); setContractsError('');
    loadCustomerContracts(row.id, signal).then(rows => { if (!signal?.aborted) setContractRows(rows); }).catch(cause => {
      if (!signal?.aborted) setContractsError(cause instanceof Error ? cause.message : 'Không tải được hợp đồng của khách hàng.');
    }).finally(() => { if (!signal?.aborted) setContractsLoading(false); });
  }, [row.id]);
  useEffect(() => {
    if (section === 'details' || contractRows || source !== 'api') return;
    const controller = new AbortController();
    fetchContracts(controller.signal);
    return () => controller.abort();
  }, [section, contractRows, source, fetchContracts]);

  const fetchCashflow = useCallback((signal?: AbortSignal) => {
    setCashflowLoading(true); setCashflowError('');
    loadCustomerCashflow(row.id, signal).then(rows => { if (!signal?.aborted) setCashflow(rows); }).catch(cause => {
      if (!signal?.aborted) setCashflowError(cause instanceof Error ? cause.message : 'Không tải được lịch sử thanh toán.');
    }).finally(() => { if (!signal?.aborted) setCashflowLoading(false); });
  }, [row.id]);
  useEffect(() => {
    if (section !== 'payments' || cashflow || source !== 'api') return;
    const controller = new AbortController();
    fetchCashflow(controller.signal);
    return () => controller.abort();
  }, [section, cashflow, source, fetchCashflow]);

  function panel(id: CustomerSection, children: ReactNode) {
    return <section id={`customer-detail-panel-${id}`} role="tabpanel" aria-labelledby={`customer-detail-tab-${id}`} hidden={section !== id} className="mg-contract-panel">{children}</section>;
  }
  const totals = cashflowTotals(cashflow || []);

  return <Dialog title={String(row.name)} subtitle={`${row.code} · ${config.title}`} className="mg-customer-detail" onClose={onClose}>
    <div className="mg-dialog-body">
      <ContractSectionTabs prefix="customer-detail" sections={SECTIONS} active={section} onChange={setSection} />
      {panel('details', <>
        <span className={`mg-status mg-status-${statusTone(row.status)}`}><span />{optionLabel(config, 'status', row.status)}</span>
        <dl className="mg-detail-grid">{config.columns.filter(column => column.key !== 'name' && column.key !== 'status').map(column => <div key={column.key}><dt>{column.label}</dt><dd>{optionLabel(config, column.key, formatValue(row[column.key], column.format))}</dd></div>)}
          {config.fields.filter(field => !config.columns.some(column => column.key === field.key) && field.key !== 'store_id').map(field => <div key={field.key}><dt>{field.label}</dt><dd>{row[field.key] || '—'}</dd></div>)}</dl>
      </>)}
      {panel('contracts', <>
        <div className="mg-contract-history-toolbar"><p>Hợp đồng của khách hàng đang xem.</p><button type="button" className="mg-button" disabled={contractsLoading} onClick={() => fetchContracts()}>
          {contractsLoading ? <LoaderCircle size={15} className="mg-spin" /> : <RotateCcw size={15} />}Làm mới</button></div>
        {contractsLoading && !contractRows && <p className="mg-contract-history-state" role="status">Đang tải hợp đồng…</p>}
        {contractsError && <p className="mg-field-error" role="alert">{contractsError}</p>}
        {contractRows && <>
        <dl className="mg-payment-totals"><div><dt>Số hợp đồng</dt><dd>{contracts.length}</dd></div><div><dt>Tổng tiền hợp đồng / Đã thu</dt><dd>{formatMoney(contractTotal)} / {formatMoney(contractPaid)}</dd></div><div><dt>Còn nợ</dt><dd>{formatMoney(contractDebt)}</dd></div></dl>
        {contracts.length ? <ul className="mg-customer-contracts">{contracts.map(contract => {
          const total = amount(contract.total_amount), paid = amount(contract.paid_amount);
          return <li key={contract.id}>
            <div className="mg-cashflow-line"><Link href={`/contracts?contract_id=${contract.id}`} onClick={onClose}><strong>{contract.code}</strong></Link>
              <span className={`mg-status mg-status-${statusTone(contract.status)}`}><span />{optionLabel(MANAGEMENT_CONFIG.contracts, 'status', contract.status)}</span></div>
            <span>{contract.vehicle_name || '—'}{contract.license ? ` · ${contract.license}` : ''}</span>
            <small>{formatDateTime(String(contract.start_date || ''))} → {formatDateTime(String(contract.end_date || ''))} · {contract.store_name || '—'}</small>
            <small>Tiền HĐ {money(total)} · Đã thu {money(paid)}{total !== null && paid !== null && total > paid ? <> · <b className="mg-customer-debt">Còn thiếu {formatMoney(total - paid)}</b></> : ''}</small>
          </li>;
        })}</ul> : <p className="mg-contract-history-state">Khách hàng chưa có hợp đồng.</p>}
        </>}
        <Link className="mg-button mg-related-link" href={`/contracts?customer_id=${row.id}`} onClick={onClose}>Mở danh sách hợp đồng của khách <ChevronRight size={15} /></Link>
      </>)}
      {panel('payments', <>
        <div className="mg-contract-history-toolbar"><p>Phiếu thu / chi của tất cả hợp đồng thuộc khách hàng này.</p>
          {source === 'api' && <button type="button" className="mg-button" disabled={cashflowLoading} onClick={() => fetchCashflow()}>{cashflowLoading ? <LoaderCircle size={15} className="mg-spin" /> : <RotateCcw size={15} />}Làm mới</button>}</div>
        {source !== 'api' && <p className="mg-contract-history-state">Lịch sử thanh toán chỉ có khi kết nối dữ liệu Supabase.</p>}
        {cashflowLoading && !cashflow && <p className="mg-contract-history-state" role="status"><LoaderCircle size={16} className="mg-spin" /> Đang tải lịch sử thanh toán…</p>}
        {cashflowError && <p className="mg-contract-history-state mg-field-error" role="alert">{cashflowError}</p>}
        {cashflow && !cashflow.length && <p className="mg-contract-history-state">Chưa có phiếu thu / chi nào.</p>}
        {cashflow && cashflow.length > 0 && <>
          <dl className="mg-payment-totals"><div><dt>Tổng thu (đã duyệt)</dt><dd>{formatMoney(totals.income)}</dd></div><div><dt>Tổng chi (đã duyệt)</dt><dd>{formatMoney(totals.expense)}</dd></div><div><dt>Còn nợ theo hợp đồng</dt><dd>{contractRows && !contractsError ? formatMoney(contractDebt) : '—'}</dd></div></dl>
          <CashflowColumns items={cashflow} showContract />
        </>}
      </>)}
    </div>
    <div className="mg-dialog-footer"><button type="button" className="mg-button" onClick={onClose}>Đóng</button>{canEdit && <button type="button" className="mg-button mg-button-primary" onClick={onEdit}>Chỉnh sửa thông tin</button>}</div>
  </Dialog>;
}
