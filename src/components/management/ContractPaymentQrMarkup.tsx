import type { ContractQrData } from '@/lib/management/sepay';
import { formatMoney } from '@/lib/formatters';
export function ContractPaymentQrMarkup({ data, image }: { data: ContractQrData; image?: string }) {
  if (!data.qr_url || !data.bank) return null;
  return <div className="contract-payment-qr"><img src={image || data.qr_url} width={96} height={96} alt={`QR thanh toán hợp đồng ${data.code}`} referrerPolicy="no-referrer" /><div><strong>{data.mode === 'test' ? 'QR thử nghiệm SePay' : 'Quét QR thanh toán'}</strong><span>{data.amount > 0 ? `${formatMoney(data.amount)} · ` : ''}{data.bank.bank_code}</span><span>{data.bank.account_number} · {data.bank.account_name}</span><span>{data.memo}</span></div></div>;
}
