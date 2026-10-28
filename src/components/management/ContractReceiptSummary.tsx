import type { ContractReceiptSummary as ReceiptSummary } from '@/lib/management/contract-receipt-summary';
import { formatMoney } from '@/lib/formatters';

export function ContractReceiptSummary({ receipts }: { receipts: ReceiptSummary }) {
  const fields: [string, number][] = [
    ['Tổng tiền đã thu (gồm cọc)', receipts.received], ['Đã thu thuê / phí', receipts.rental_received],
    ['Đã thu gia hạn', receipts.renewal_received], ['Đã thu cọc', receipts.deposit_received],
    ['Khoản thu khác', receipts.other_received], ['Tổng đã chi / hoàn', receipts.spent],
    ['Đã hoàn cọc', receipts.deposit_refunded], ['Cọc đang giữ', receipts.deposit_held], ['Đã hoàn tiền thuê', receipts.rental_refunded],
    ['Thu trừ chi / hoàn', receipts.net],
  ];
  return <section className="mg-contract-cost-section mg-contract-receipts" aria-label="Tổng thu chi theo phiếu của hợp đồng">
    <h3>Thu chi theo phiếu của hợp đồng</h3>
    <p>{receipts.receipt_count} phiếu thu đã duyệt · Bao gồm phiếu cũ và các lần gia hạn. Tiền cọc được tách riêng bên dưới.</p>
    <dl className="mg-contract-detail-grid">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatMoney(value)}</dd></div>)}</dl>
  </section>;
}
