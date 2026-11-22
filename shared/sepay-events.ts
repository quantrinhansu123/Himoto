export interface SePayReceiptEvent {
  id: number;
  order_id: number;
  code: string;
  mode: 'live' | 'test';
  status: 'matched' | 'simulated';
  amount: number;
  received_at: string;
}

export function isSePayReceiptEvents(value: unknown): value is SePayReceiptEvent[] {
  return Array.isArray(value) && value.length <= 30 && value.every(row => row &&
    Number.isSafeInteger(row.id) && row.id > 0 && Number.isSafeInteger(row.order_id) && row.order_id > 0 &&
    (row.mode === 'live' || row.mode === 'test') && (row.status === 'matched' || row.status === 'simulated') &&
    Number.isFinite(row.amount) && row.amount > 0 && typeof row.code === 'string' &&
    typeof row.received_at === 'string' && Number.isFinite(Date.parse(row.received_at)));
}
