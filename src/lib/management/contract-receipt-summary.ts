import type { ContractCashflow } from './contract-history';

export interface ContractReceiptSummary {
  received: number; spent: number; net: number; receipt_count: number;
  rental_received: number; renewal_received: number; other_received: number; rental_refunded: number;
  deposit_received: number; deposit_refunded: number; deposit_held: number;
}

/** Only approved, identified vouchers count. Equal amounts/notes can belong to
 * different real receipts: never deduplicate or reconstruct totals from dates. */
export function summarizeContractReceipts(items: ContractCashflow[]): ContractReceiptSummary {
  const totals: ContractReceiptSummary = { received: 0, spent: 0, net: 0, receipt_count: 0,
    rental_received: 0, renewal_received: 0, other_received: 0, rental_refunded: 0, deposit_received: 0, deposit_refunded: 0, deposit_held: 0 };
  for (const item of items) {
    if (item.status_code !== 'approved') continue;
    if (!Number.isSafeInteger(item.amount) || item.amount < 0) throw new Error('Số tiền phiếu chưa hợp lệ để tổng hợp đầy đủ.');
    if (item.type === 'expense') {
      totals.spent += item.amount;
      if (item.category === 'deposit_refund') totals.deposit_refunded += item.amount;
      if (item.category === 'rental_refund') totals.rental_refunded += item.amount;
    } else {
      totals.received += item.amount; totals.receipt_count++;
      if (item.category === 'deposit') totals.deposit_received += item.amount;
      else if (item.category === 'renewal') totals.renewal_received += item.amount;
      else if (item.category === 'rental') totals.rental_received += item.amount;
      else totals.other_received += item.amount;
    }
  }
  totals.net = totals.received - totals.spent;
  totals.deposit_held = Math.max(totals.deposit_received - totals.deposit_refunded, 0);
  if (!Object.values(totals).every(Number.isSafeInteger)) throw new Error('Tổng tiền phiếu vượt giới hạn đối chiếu.');
  return totals;
}
