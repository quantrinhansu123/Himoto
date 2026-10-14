'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export function ManagementLanding() {
  const router = useRouter();
  useEffect(() => { router.replace(window.matchMedia('(max-width: 767px)').matches ? '/operations' : '/vehicles'); }, [router]);
  return <p role="status">Đang mở quản lý…</p>;
}
