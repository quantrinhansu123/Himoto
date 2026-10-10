'use client';

import { ContractCashflow } from '@/lib/management/contract-history';
import { formatDateTime, formatMoney } from '@/lib/formatters';

export function cashflowTotals(items: ContractCashflow[]) {
  const approved = items.filter(item => item.status === 'Đã duyệt');
  const income = approved.filter(item => item.type === 'income').reduce((sum, item) => sum + item.amount, 0);
  const expense = approved.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0);
  return { income, expense };
}

export function CashflowColumns({ items, showContract = false }: { items: ContractCashflow[]; showContract?: boolean }) {
  const totals = cashflowTotals(items);
  return <div className="mg-contract-cashflow-columns">
    {(['income', 'expense'] as const).map(type => {
      const rows = items.filter(item => item.type === type);
      return <section key={type} className={`mg-contract-cashflow-column is-${type}`} aria-label={type === 'income' ? 'Phiếu thu' : 'Phiếu chi'}>
        <header><h4>{type === 'income' ? 'Phiếu thu' : 'Phiếu chi'} ({rows.length})</h4><strong>{type === 'income' ? '+' : '−'}{formatMoney(type === 'income' ? totals.income : totals.expense)}</strong></header>
        {rows.length ? <ul>{rows.map(item => <li key={item.id}>
          <div className="mg-cashflow-line"><span>#{item.id} · {formatDateTime(item.at)}</span><strong className={`mg-cashflow-amount is-${type}`}>{type === 'income' ? '+' : '−'}{formatMoney(item.amount)}</strong></div>
          <strong>{showContract && item.contract_code ? `${item.contract_code} · ` : ''}{item.reason}</strong>
          {item.note && <p>{item.note}</p>}
          <small>{item.method} · {item.account}</small>
          <small>{item.actor} · {item.status}</small>
        </li>)}</ul> : <p className="mg-contract-history-state">Chưa có {type === 'income' ? 'phiếu thu' : 'phiếu chi'}.</p>}
      </section>;
    })}
  </div>;
}
