import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BatteryContractsPage } from '@/components/battery/BatteryContractsPage';
export const metadata: Metadata = { title: 'Hợp đồng thuê pin — HIMOTO' };
export default function BatteryContractsRoute() { return <Suspense fallback={<p role="status">Đang tải hợp đồng pin / sạc…</p>}><BatteryContractsPage /></Suspense>; }
