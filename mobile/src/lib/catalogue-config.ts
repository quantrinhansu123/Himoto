import type { CatalogueKind } from "@himoto/mobile-contract";
import { statuses } from './status-labels';
import type { MobileContractScope } from '../../../shared/mobile-contract-workspaces';

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
  if (typeof value === "string") {
    if (value === "all") return "";
    if (catalogueConfig[kind].allStatuses.includes(value)) return value;
  }
  return kind === "contracts" ? "draft" : "";
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
  return statuses[status];
}

/** A workspace is already a filter. Avoid a second identical rental filter,
 * or lifecycle states that cannot occur in that workspace. */
export function catalogueStatuses(kind: CatalogueKind, scope: MobileContractScope = '', all = false): string[] {
  if (kind === 'contracts') {
    if (scope === 'overdue') return ['', 'bad_debt'];
    if (scope === 'drafts' || scope === 'due') return [''];
    if (scope === 'active') return ['', 'overdue', 'wait_payment'];
    if (scope === 'renewable') return ['', 'overdue', 'bad_debt'];
  }
  return all ? ['', ...catalogueConfig[kind].allStatuses] : catalogueConfig[kind].quickStatuses;
}

export function catalogueAllLabel(kind: CatalogueKind, scope: MobileContractScope = '') {
  if (kind === 'vehicles') return 'Đang quản lý';
  if (kind !== 'contracts' || !scope) return 'Tất cả';
  if (scope === 'overdue') return 'Tất cả quá hạn';
  if (scope === 'active') return 'Tất cả đang xử lý';
  if (scope === 'drafts') return 'Tất cả bản nháp';
  return 'Tất cả trong nhóm';
}

/** Monitoring can add overdue rentals to the overdue badge while retaining
 * their original status. Subtract the other lifecycle states to count each
 * active rental once. */
export function activeRentalCount(counts: Map<string, number>, total: number) {
  let count = total;
  for (const [status, value] of counts)
    if (!['renting', 'overdue', 'bad_debt'].includes(status)) count -= value;
  return Math.max(0, count);
}
