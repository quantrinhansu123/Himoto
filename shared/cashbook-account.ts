export type CashbookAccountKind = "bank" | "cash";
export interface CashbookAccountInput {
  status: "active" | "inactive"; opening_balance: number; store_id: string;
  owner_type?: "company" | "store"; name?: string; bank_name?: string; owner_name?: string; account_number?: string;
  revision?: string;
}
export interface CashbookAccountValues {
  storeId: number; status: "Active" | "Inactive"; opening: number; ownerType: "company" | "unknown";
  bankName: string; ownerName: string; accountNumber: string; name: string;
}
export function cashbookAccountValues(kind: CashbookAccountKind, body: Record<string, unknown>): CashbookAccountValues {
  const text = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 192) : "";
  return { status: (body.status === "inactive" ? "Inactive" : body.status === "active" ? "Active" : "") as CashbookAccountValues["status"], opening: Number(body.opening_balance ?? 0),
    ownerType: kind === "bank" && body.owner_type === "company" ? "company" : "unknown", bankName: text(body.bank_name), ownerName: text(body.owner_name), accountNumber: text(body.account_number),
    name: kind === "cash" ? text(body.name) : "", storeId: body.store_id == null || body.store_id === "" ? 0 : Number(body.store_id) };
}
export function validateCashbookAccount(kind: CashbookAccountKind, value: CashbookAccountValues) {
  const errors: Record<string, string> = {};
  if (!["Active", "Inactive"].includes(value.status)) errors.status = "Chọn trạng thái tài khoản.";
  if (!Number.isSafeInteger(value.opening) || Math.abs(value.opening) > 1e13) errors.opening_balance = "Số dư đầu kỳ là số nguyên, tối đa 10.000 tỷ đồng.";
  if (kind === "bank") {
    for (const [field, key] of [["bankName", "bank_name"], ["ownerName", "owner_name"], ["accountNumber", "account_number"]] as const) if (!value[field] || value[field].length > 191) errors[key] = "Nhập thông tin, tối đa 191 ký tự.";
  }
  if (value.name.length > 191) errors.name = "Tên két tối đa 191 ký tự.";
  if ((value.storeId !== 0 || value.ownerType !== "company") && (!Number.isSafeInteger(value.storeId) || value.storeId <= 0)) errors.store_id = "Chọn cơ sở cho tài khoản.";
  return errors;
}
