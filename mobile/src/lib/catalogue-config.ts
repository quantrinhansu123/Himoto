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
    title: "Danh sách xe",
    noun: "xe",
    placeholder: "Tìm biển số, tên xe, nhãn hiệu",
    quickStatuses: [
      "",
      "ready",
      "using",
      "repairing",
      "in_transit",
      "bad_debt",
      "pending",
      "sold",
      "broken",
    ],
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
    title: "Danh sách hợp đồng",
    noun: "hợp đồng",
    placeholder: "Tìm mã hợp đồng, khách, biển số",
    quickStatuses: [
      "",
      "renting",
      "draft",
      "overdue",
      "bad_debt",
      "reserved",
      "wait_payment",
      "deposit_contract",
      "completed",
      "cancelled",
    ],
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
    quickStatuses: ["", "active", "warning", "blacklist"],
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
  if (kind === "contracts") {
    if (status === "draft") return "Nháp";
    if (status === "deposit_contract") return "Đặt cọc";
    if (status === "pending") return "Chờ giao xe";
  }
  if (kind === "customers") {
    if (status === "draft") return "Chưa hoàn tất";
    if (status === "blacklist") return "Nợ xấu / Cấm thuê";
  }
  return undefined;
}
