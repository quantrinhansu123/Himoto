import banks from './vietqr-banks.json';
import { MAX_PAYMENT_AMOUNT, PaymentAccount, PaymentInput } from './contract-payments';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
export function bankBin(name: string) {
  const key = normalize(name).toLowerCase().replace(/[^a-z0-9]/g, '');
  return banks.find(bank => [bank.bin, bank.code, bank.shortName, bank.name].some(alias => normalize(alias).toLowerCase().replace(/[^a-z0-9]/g, '') === key))?.bin;
}
export function transferQr(account: PaymentAccount, input: PaymentInput, contractCode: string) {
  const bin = bankBin(account.bank_name || '');
  if (!bin || !account.account_number || !/^[A-Za-z0-9]{1,19}$/.test(account.account_number) || !account.owner_name?.trim()) throw new Error('Tài khoản nhận thiếu thông tin hoặc chưa xác định được ngân hàng để tạo QR. Chọn lại tài khoản.');
  if (!/^[1-9]\d{0,12}$/.test(input.amount) || Number(input.amount) > MAX_PAYMENT_AMOUNT) throw new Error('Nhập số tiền nguyên VNĐ trước khi tạo QR.');
  const content = normalize(input.note || `Gia hạn hợp đồng_${contractCode}`).replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!content || content.length > 50) throw new Error('Nội dung chuyển khoản trên QR cần từ 1 đến 50 ký tự không dấu. Rút gọn nội dung thu rồi thử lại.');
  const params = new URLSearchParams({ amount: input.amount, addInfo: content, accountName: account.owner_name.trim() });
  return { url: `https://img.vietqr.io/image/${bin}-${account.account_number}-qr_only.png?${params}`, content, bin };
}
