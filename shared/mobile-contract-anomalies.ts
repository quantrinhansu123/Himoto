export interface MobileContractAnomaly {
  transaction_id: string;
  contract_code: string;
  employee: string;
  store: string;
  occurred_at: string;
  amount: string;
  expected_amount: string;
  transaction_status: string | null;
}

export interface MobileContractAnomaliesPage {
  rows: MobileContractAnomaly[];
  hasMore: boolean;
}

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown) => typeof value === "string";

export function isMobileContractAnomaliesPage(
  value: unknown,
): value is MobileContractAnomaliesPage {
  return (
    object(value) &&
    typeof value.hasMore === "boolean" &&
    Array.isArray(value.rows) &&
    value.rows.length <= 50 &&
    value.rows.every(
      (row) =>
        object(row) &&
        (text(row.transaction_id) || typeof row.transaction_id === "number") &&
        text(row.contract_code) &&
        text(row.employee) &&
        text(row.store) &&
        text(row.occurred_at) &&
        (text(row.amount) || typeof row.amount === "number") &&
        (text(row.expected_amount) || typeof row.expected_amount === "number") &&
        (row.transaction_status === null || text(row.transaction_status)),
    )
  );
}
