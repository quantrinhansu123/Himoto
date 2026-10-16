import type { Metadata } from 'next';
import { ContractTypeManager } from '@/components/contracts/ContractTypeManager';
export const metadata: Metadata = { title: 'Loại hợp đồng — HIMOTO' };
export default function ContractTypesPage() { return <ContractTypeManager />; }
