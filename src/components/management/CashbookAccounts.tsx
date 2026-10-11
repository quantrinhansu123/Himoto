'use client';

import { useState } from 'react';
import { Banknote, Eye, FileSearch, Landmark, LoaderCircle, Pencil, Plus, RotateCcw, Trash2, WalletCards } from 'lucide-react';
import type { CashbookAccount } from '@/lib/management/cashbook-repository';
import { AccountDialogMode, CashbookAccountDialog } from './CashbookAccountDialog';
import { useManagement } from './ManagementProvider';
import { RowActionsMenu } from './RowActionsMenu';

const money = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)} ₫`;
const typeLabel = (account: CashbookAccount) => account.kind === 'cash' ? 'Tiền mặt' : account.owner_type === 'company' ? 'TK công ty' : 'Ngân hàng';

interface Props { accounts: CashbookAccount[]; loading: boolean; error: string; onRetry: () => void }
export function CashbookAccounts({ accounts, loading, error, onRetry }: Props) {
  const { selectedStore } = useManagement();
  const [target, setTarget] = useState<{ account: CashbookAccount; mode: Exclude<AccountDialogMode, 'create'> } | null>(null);
  const [creating, setCreating] = useState(false);
  const total = accounts.reduce((sum, account) => ({ opening: sum.opening + account.opening_balance, income: sum.income + account.income, expense: sum.expense + account.expense, balance: sum.balance + account.balance }), { opening: 0, income: 0, expense: 0, balance: 0 });
  return <section className="mg-data-panel mg-cashbook-panel mg-cashbook-accounts" aria-labelledby="cashbook-accounts-title" id="cashbook-accounts">
    <div className="mg-cashbook-panel-heading"><span className="mg-cashbook-symbol is-account" aria-hidden="true"><WalletCards size={20} /></span>
      <div><h2 id="cashbook-accounts-title">Danh sách TK<span className="mg-title-count">{loading || error ? '—' : accounts.length}</span></h2><p>Số dư = số dư đầu kỳ + tổng thu − tổng chi của từng tài khoản.</p></div>
      <span className="mg-cashbook-panel-description">Tính trên toàn bộ phiếu, không theo bộ lọc ngày</span>
      <button type="button" className="mg-button mg-button-primary mg-cashbook-account-add" onClick={() => setCreating(true)}><Plus size={16} />Thêm tài khoản</button>
    </div>
    <div className="mg-mobile-records" aria-busy={loading}>
      {loading ? <div className="mg-table-state" role="status"><LoaderCircle size={25} className="mg-spin" /><strong>Đang tính số dư…</strong></div>
        : error ? <div className="mg-table-state mg-table-error" role="alert"><strong>Không tải được danh sách tài khoản</strong><p>{error}</p><button type="button" className="mg-button" onClick={onRetry}>Thử lại</button></div>
        : !accounts.length ? <div className="mg-table-state"><strong>Chưa có tài khoản cho cơ sở này</strong></div>
        : <><ul className="mg-mobile-card-list">{accounts.map(account => <li key={account.key} className="mg-mobile-record-card">
          <button type="button" className="mg-mobile-card-main" onClick={() => setTarget({ account, mode: 'view' })}>
            <span className="mg-mobile-card-title">{account.name || account.bank_name || account.label}</span>
            <span className="mg-mobile-card-summary"><span>{typeLabel(account)}</span><span>{account.store_name || (account.owner_type === 'company' ? 'Toàn công ty' : '—')}</span></span>
            <span className={`mg-mobile-card-amount${account.balance < 0 ? ' is-negative' : ''}`}>Số dư {money(account.balance)}{account.status.toLowerCase() !== 'active' && ' · Ngừng sử dụng'}</span>
          </button>
          <div className="mg-mobile-card-actions"><RowActionsMenu label={`Thao tác ${account.label}`} actions={[
            { key: 'view', label: 'Xem chi tiết', icon: <Eye size={16} />, onSelect: () => setTarget({ account, mode: 'view' }) },
            { key: 'edit', label: 'Sửa tài khoản', icon: <Pencil size={16} />, onSelect: () => setTarget({ account, mode: 'edit' }) },
            { key: 'delete', label: 'Xóa tài khoản', icon: <Trash2 size={16} />, danger: true, onSelect: () => setTarget({ account, mode: 'delete' }) },
          ]} /></div>
        </li>)}</ul><p className="mg-mobile-list-total">Tổng số dư <strong>{money(total.balance)}</strong></p></>}
    </div>
    <div className="mg-table-scroll mg-desktop-records" tabIndex={0} role="region" aria-label="Bảng danh sách tài khoản và số dư">
      <table className="mg-table mg-cashbook-account-table" aria-busy={loading}><caption className="mg-sr-only">Danh sách tài khoản và số dư</caption>
        <thead><tr><th scope="col">Loại</th><th scope="col">Tài khoản</th><th scope="col">Cơ sở</th><th scope="col" className="mg-align-right">Số dư đầu kỳ</th><th scope="col" className="mg-align-right">Tổng thu</th><th scope="col" className="mg-align-right">Tổng chi</th><th scope="col" className="mg-align-right">Số dư</th><th scope="col" className="mg-align-right">Thao tác</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={8}><div className="mg-table-state" role="status"><LoaderCircle size={25} className="mg-spin" /><strong>Đang tính số dư…</strong></div></td></tr>
          : error ? <tr><td colSpan={8}><div className="mg-table-state mg-table-error" role="alert"><FileSearch size={28} /><strong>Không tải được danh sách tài khoản</strong><p>{error}</p><button type="button" className="mg-button" onClick={onRetry}><RotateCcw size={15} />Thử lại</button></div></td></tr>
          : !accounts.length ? <tr><td colSpan={8}><div className="mg-table-state"><FileSearch size={28} /><strong>Chưa có tài khoản cho cơ sở này</strong></div></td></tr>
          : accounts.map(account => <tr key={account.key}>
            <td><span className="mg-cashbook-account-type">{account.kind === 'cash' ? <Banknote size={15} /> : <Landmark size={15} />}{typeLabel(account)}</span></td>
            <td><span className="mg-cashbook-cell" title={account.label}>{account.label}</span>{account.status && account.status.toLowerCase() !== 'active' && <small className="mg-cashbook-account-inactive">Ngừng sử dụng</small>}</td>
            <td><span className="mg-cashbook-cell">{account.store_name || (account.owner_type === 'company' ? 'Toàn công ty' : '—')}</span></td>
            <td className="mg-align-right mg-numeric">{money(account.opening_balance)}</td>
            <td className="mg-align-right mg-numeric mg-cashbook-income-amount">{money(account.income)}</td>
            <td className="mg-align-right mg-numeric mg-cashbook-expense-amount">{money(account.expense)}</td>
            <td className={`mg-align-right mg-numeric mg-cashbook-balance${account.balance < 0 ? ' is-negative' : ''}`}><strong>{money(account.balance)}</strong></td>
            <td className="mg-align-right"><div className="mg-row-actions">
              <button type="button" className="mg-icon-button" aria-label={`Xem ${account.label}`} title="Xem" onClick={() => setTarget({ account, mode: 'view' })}><Eye size={16} /></button>
              <button type="button" className="mg-icon-button" aria-label={`Sửa ${account.label}`} title="Sửa" onClick={() => setTarget({ account, mode: 'edit' })}><Pencil size={16} /></button>
              <button type="button" className="mg-icon-button" aria-label={`Xóa ${account.label}`} title="Xóa" onClick={() => setTarget({ account, mode: 'delete' })}><Trash2 size={16} /></button></div></td>
          </tr>)}</tbody>
        {!loading && !error && accounts.length > 0 && <tfoot><tr><th scope="row" colSpan={3}>Tổng cộng</th>
          <td className="mg-align-right mg-numeric">{money(total.opening)}</td><td className="mg-align-right mg-numeric mg-cashbook-income-amount">{money(total.income)}</td>
          <td className="mg-align-right mg-numeric mg-cashbook-expense-amount">{money(total.expense)}</td>
          <td className={`mg-align-right mg-numeric mg-cashbook-balance${total.balance < 0 ? ' is-negative' : ''}`}><strong>{money(total.balance)}</strong></td><td /></tr></tfoot>}
      </table>
    </div>
    {target && <CashbookAccountDialog key={`${target.mode}-${target.account.key}`} account={target.account} mode={target.mode} ownerSuggestions={accounts.map(item => item.owner_name || '')} onClose={() => setTarget(null)} onChanged={onRetry} />}
    {creating && <CashbookAccountDialog mode="create" defaultStoreId={selectedStore === 'all' ? '' : selectedStore} ownerSuggestions={accounts.map(item => item.owner_name || '')} onClose={() => setCreating(false)} onChanged={onRetry} />}
  </section>;
}
