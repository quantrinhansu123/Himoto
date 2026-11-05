import type { MobileDraftCustomer } from "./mobile-contract";
import { isMobileDraftCustomers } from "./mobile-draft-validation";

export type MobileCustomerMatchQuery = { id_card: string; phone: string } | { id: number };
export type MobileCustomerMatch = { customer: MobileDraftCustomer; canEdit: boolean };
export type MobileCustomerMatches = {
  id: number | null;
  idCard: string;
  phoneDigits: string;
  rows: MobileCustomerMatch[];
  hasMore: boolean;
};

export function customerMatchIdentity(value: unknown): { id: number | null; idCard: string; phoneDigits: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if ("id" in input) return Object.keys(input).length === 1 && typeof input.id === "number" &&
    Number.isSafeInteger(input.id) && input.id > 0 ? { id: input.id, idCard: "", phoneDigits: "" } : null;
  if (Object.keys(input).some((key) => !["id_card", "phone"].includes(key)) ||
      typeof input.id_card !== "string" || input.id_card.length > 100 ||
      typeof input.phone !== "string" || input.phone.length > 1000) return null;
  const idCard = input.id_card.replace(/\s/g, "").toUpperCase();
  const phoneDigits = input.phone.replace(/\D/g, "");
  return idCard || phoneDigits ? { id: null, idCard, phoneDigits } : null;
}

function matches(row: MobileDraftCustomer, query: { id: number | null; idCard: string; phoneDigits: string }) {
  if (query.id !== null) return row.id === query.id;
  const doc = row.details.id_card.replace(/\s/g, "").toUpperCase();
  const contact = row.details.contact_detail;
  return !!query.idCard && doc === query.idCard || !!query.phoneDigits && (
    row.details.phone.replace(/\D/g, "") === query.phoneDigits || doc === query.phoneDigits ||
    row.details.customer_type === "foreign" && /^[+0-9\s.()-]+$/.test(contact) && contact.replace(/\D/g, "") === query.phoneDigits
  );
}

export function isMobileCustomerMatches(value: unknown, input: MobileCustomerMatchQuery): value is MobileCustomerMatches {
  const identity = customerMatchIdentity(input);
  if (!identity || !value || typeof value !== "object") return false;
  const result = value as MobileCustomerMatches;
  if (result.id !== identity.id || result.idCard !== identity.idCard || result.phoneDigits !== identity.phoneDigits ||
      !Array.isArray(result.rows) || typeof result.hasMore !== "boolean" || result.rows.length > 10) return false;
  if (!result.rows.every((row) => row && typeof row === "object" && typeof row.canEdit === "boolean")) return false;
  const customers = result.rows.map((row) => row.customer);
  return isMobileDraftCustomers({ rows: customers, hasMore: result.hasMore }) &&
    new Set(customers.map((row) => row.id)).size === customers.length && customers.every((row) => matches(row, identity));
}
