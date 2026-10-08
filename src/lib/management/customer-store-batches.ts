import { CUSTOMER_STORE_BATCH_SIZE, CUSTOMER_STORE_DUPLICATE, CustomerStoreInput, CustomerStoreResult } from './customer-store-import';

interface CustomerStoreBatch { inputs: CustomerStoreInput[]; result: CustomerStoreResult }
export interface CustomerStorePreview { batches: CustomerStoreBatch[]; result: CustomerStoreResult }
export interface CustomerStoreProgress {
  processed: number;
  total: number;
  batch: number;
  batches: number;
  updated: number;
}
type CheckStores = (rows: CustomerStoreInput[], commit: boolean, revision?: string) => Promise<CustomerStoreResult>;

function summarize(batches: CustomerStoreBatch[], committed = false): CustomerStoreResult {
  return {
    rows: batches.flatMap(batch => batch.result.rows),
    total: batches.reduce((sum, batch) => sum + batch.result.total, 0),
    ready: batches.reduce((sum, batch) => sum + batch.result.ready, 0),
    unchanged: batches.reduce((sum, batch) => sum + batch.result.unchanged, 0),
    invalid: batches.reduce((sum, batch) => sum + batch.result.invalid, 0),
    updated: batches.reduce((sum, batch) => sum + batch.result.updated, 0),
    committed, revision: '',
  };
}

export async function previewCustomerStoreBatches(inputs: CustomerStoreInput[], check: CheckStores, onProgress: (progress: CustomerStoreProgress, result: CustomerStoreResult) => void): Promise<CustomerStorePreview> {
  // Check the whole file before sending its first batch: duplicates in later
  // batches must also exclude their earlier occurrences from any update.
  const counts = new Map<string, number>();
  for (const input of inputs) {
    const card = input.values.id_card.replace(/\s/g, '');
    if (card) counts.set(card, (counts.get(card) || 0) + 1);
  }
  const prepared = inputs.map(input => (counts.get(input.values.id_card.replace(/\s/g, '')) || 0) > 1
    ? { ...input, errors: [...new Set([...(input.errors || []), CUSTOMER_STORE_DUPLICATE])] } : input);
  const batches: CustomerStoreBatch[] = [];
  const count = Math.ceil(prepared.length / CUSTOMER_STORE_BATCH_SIZE);
  for (let start = 0; start < prepared.length; start += CUSTOMER_STORE_BATCH_SIZE) {
    const rows = prepared.slice(start, start + CUSTOMER_STORE_BATCH_SIZE);
    const result = await check(rows, false);
    if (result.committed || result.total !== rows.length || !/^[a-f0-9]{64}$/.test(result.revision)) throw new Error('Kết quả đối chiếu chưa đầy đủ. Nhấn Kiểm tra lại.');
    batches.push({ inputs: rows, result });
    onProgress({ processed: start + rows.length, total: inputs.length, batch: batches.length, batches: count, updated: 0 }, summarize(batches));
  }
  return { batches, result: summarize(batches) };
}

export class CustomerStoreBatchSaveError extends Error {
  constructor(cause: unknown, public updated: number) {
    super(`Đã xác nhận cập nhật ${updated} khách hàng trước khi dừng. ${cause instanceof Error ? cause.message : 'Không xác nhận được kết quả lưu.'} Nhấn Kiểm tra lại để xác định phần còn lại; phần đã lưu được giữ nguyên.`);
  }
}

export async function saveCustomerStoreBatches(preview: CustomerStorePreview, check: CheckStores, onProgress: (progress: CustomerStoreProgress) => void): Promise<CustomerStoreResult> {
  const saved: CustomerStoreBatch[] = [];
  let processed = 0, updated = 0;
  try {
    for (const batch of preview.batches) {
      const result = batch.result.ready ? await check(batch.inputs, true, batch.result.revision) : batch.result;
      if (batch.result.ready && (!result.committed || result.updated !== batch.result.ready)) throw new Error('Chưa xác nhận đủ khách hàng đã cập nhật.');
      saved.push({ ...batch, result }); processed += batch.inputs.length; updated += result.updated;
      onProgress({ processed, total: preview.result.total, batch: saved.length, batches: preview.batches.length, updated });
    }
    return summarize(saved, true);
  } catch (cause) { throw new CustomerStoreBatchSaveError(cause, updated); }
}
