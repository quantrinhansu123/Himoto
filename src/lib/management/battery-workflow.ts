import type { BatteryCollectionMethod, BatteryContract } from './battery-contracts';

export interface BatteryReceipt { method: Exclude<BatteryCollectionMethod, ''>; account_id: number; paid_at: string }
export type BatteryActionInput = { revision: string; request_id: string; note: string } & (
  | { action: 'renew'; ends_at: string; amount: number; receipt?: BatteryReceipt }
  | { action: 'collect_renewal'; renewal_id: string; amount: number; receipt: BatteryReceipt }
  | { action: 'return'; returned_at: string }
);
export interface BatteryWorkflowEvent {
  request_id: string; request_hash: string; action: BatteryActionInput['action']; at: string; actor_id: number; actor_name: string;
  note: string; before_ends_at?: string; ends_at?: string; returned_at?: string; amount?: number;
  renewal_id?: string; transaction_id?: number; receipt?: BatteryReceipt;
  collected?: number; remaining?: number;
}
export interface BatteryWorkflowAccount { id: number; kind: 'cash' | 'bank'; store_id: number; owner_type: string; status: string; label: string }
export interface BatteryWorkflowContext {
  contract: BatteryContract; history: BatteryWorkflowEvent[]; accounts: BatteryWorkflowAccount[];
  renewal_amount: number; renewal_collected: number; renewal_remaining: number;
}
