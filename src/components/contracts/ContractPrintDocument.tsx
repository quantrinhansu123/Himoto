import type { ComponentType, ReactNode } from 'react';
import type { LegacyContractDocument } from '@/lib/management/contract-document';
import { ContractPaymentQr } from '@/components/management/ContractPaymentQr';
import { ContractPrintBody } from './ContractPrintBody';

export function ContractPrintDocument({ doc, pageWrapper, contractId }: { doc: LegacyContractDocument; pageWrapper?: ComponentType<{ children: ReactNode }>; contractId?: number }) {
  return <ContractPrintBody doc={doc} pageWrapper={pageWrapper} paymentQr={contractId ? <ContractPaymentQr id={contractId} compact /> : undefined} />;
}
