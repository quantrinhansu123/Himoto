'use client';

import { useEffect, useRef, useState } from 'react';
import { PaymentAccount, PaymentInput } from '@/lib/management/contract-payments';
import { formatMoney } from '@/lib/formatters';

export function TransferQrPanel({ account, input, qr, confirmed, onConfirm }: {
  account: PaymentAccount; input: PaymentInput; qr: { url: string; content: string }; confirmed: boolean; onConfirm: (value: boolean) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  return <section className="mg-transfer-qr" aria-labelledby="transfer-qr-title">
    <h3 id="transfer-qr-title" ref={heading} tabIndex={-1}>Quét QR để chuyển khoản</h3>
    <p>Quét bằng ứng dụng ngân hàng. Kiểm tra đúng người nhận, số tiền và nội dung trước khi chuyển.</p>
    {!failed && <img key={attempt} src={qr.url} width={240} height={240} alt="Mã QR chuyển khoản theo tài khoản, số tiền và nội dung bên dưới" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
    {failed && <p role="alert">Không tải được QR. <button type="button" className="mg-button" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>Tải lại QR</button> Có thể chuyển theo thông tin tài khoản bên dưới.</p>}
    <dl><div><dt>Ngân hàng</dt><dd>{account.bank_name}</dd></div><div><dt>Số tài khoản</dt><dd>{account.account_number}</dd></div><div><dt>Chủ tài khoản</dt><dd>{account.owner_name}</dd></div><div><dt>Số tiền chuyển</dt><dd>{formatMoney(Number(input.amount))}</dd></div><div><dt>Nội dung trên QR</dt><dd>{qr.content}</dd></div></dl>
    <a href={qr.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Mở ảnh QR</a>
    <p>Mở QR chưa ghi nhận thanh toán hoặc gia hạn. Hệ thống chưa tự kiểm tra tiền vào ngân hàng.</p>
    <label className="mg-transfer-confirm"><input type="checkbox" checked={confirmed} onChange={event => onConfirm(event.target.checked)} required />Tôi đã kiểm tra tài khoản và nhận đủ {formatMoney(Number(input.amount))}.</label>
  </section>;
}
