import type { CatalogueKind } from "@himoto/mobile-contract";

export const catalogueConfig: Record<
  CatalogueKind,
  {
    title: string;
    noun: string;
    placeholder: string;
    quickStatuses: string[];
    allStatuses: string[];
  }
> = {
  vehicles: {
    title: "Đội xe",
    noun: "xe",
    placeholder: "Tìm biển số, tên xe, nhãn hiệu",
    quickStatuses: ["ready", "using", "in_transit"],
    allStatuses: [
      "ready",
      "using",
      "repairing",
      "in_transit",
      "pending",
      "sold",
      "broken",
      "bad_debt",
    ],
  },
  contracts: {
    title: "Hợp đồng",
    noun: "hợp đồng",
    placeholder: "Tìm mã hợp đồng, khách, biển số",
    quickStatuses: ["renting", "overdue", "draft"],
    allStatuses: [
      "renting",
      "overdue",
      "draft",
      "completed",
      "wait_payment",
      "bad_debt",
      "reserved",
      "deposit_contract",
      "pending",
      "cancelled",
      "cancel_pending_settlement",
    ],
  },
  customers: {
    title: "Khách hàng",
    noun: "khách hàng",
    placeholder: "Tìm tên hoặc số điện thoại",
    quickStatuses: ["active", "warning", "blacklist"],
    allStatuses: ["active", "warning", "blacklist", "draft"],
  },
};

export function initialCatalogueStatus(
  kind: CatalogueKind,
  value?: string | string[],
) {
  return typeof value === "string" &&
    catalogueConfig[kind].allStatuses.includes(value)
    ? value
    : "";
}

export function contextualStatusLabel(
  kind: CatalogueKind,
  status: string,
): string | undefined {
  if (kind === "contracts" && status === "pending") return "Chờ giao xe";
  if (kind === "customers" && status === "draft") return "Chưa hoàn tất";
  return undefined;
}
