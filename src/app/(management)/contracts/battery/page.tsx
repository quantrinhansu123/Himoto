import type { Metadata } from 'next';
import { BatteryContractsPage } from '@/components/battery/BatteryContractsPage';
export const metadata: Metadata = { title: 'Hợp đồng thuê pin — HIMOTO' };
export default function BatteryContractsRoute() { return <BatteryContractsPage />; }
