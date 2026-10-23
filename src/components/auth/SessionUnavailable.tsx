'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

/** A database outage is retryable and must never be presented as a logout. */
export function SessionUnavailable() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <main className="mg-page">
    <h1>Kết nối dữ liệu đang gián đoạn</h1>
    <p>Chưa kiểm tra được phiên đăng nhập. Vui lòng thử lại khi kết nối ổn định.</p>
    <button type="button" className="mg-button mg-button-primary" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
      {pending ? 'Đang kết nối lại…' : 'Thử lại'}
    </button>
  </main>;
}
