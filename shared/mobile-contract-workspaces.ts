/** Native workspaces use the web table's scope and financial calculations. */
export const CONTRACT_WORKSPACES = [
  { key: "", title: "Tất cả", description: "Tra cứu toàn bộ hợp đồng trong phạm vi được cấp." },
  { key: "active", title: "Đang thuê", description: "Hợp đồng đang thuê, quá hạn và chờ thanh toán để xử lý tại quầy." },
  { key: "overdue", title: "Quá hạn", description: "Theo dõi hạn trả xe và kỳ thanh toán. Phí trễ là tạm tính, chốt khi trả xe." },
  { key: "drafts", title: "Hợp đồng nháp", description: "Mở hồ sơ đang chuẩn bị để tiếp tục nhập và lưu." },
  { key: "due", title: "Đến hạn đóng tiền", description: "Các kỳ thuê sở hữu đã đến hẹn và chưa đóng đủ." },
  { key: "renewable", title: "Có thể gia hạn", description: "Hợp đồng đang thuê hoặc quá hạn, không có lịch trả góp theo đúng bộ lọc web." },
  { key: "ownership", title: "Thuê sở hữu", description: "Hồ sơ tại cơ sở thuê sở hữu và các loại thuê sở hữu theo web." },
  { key: "vat", title: "Hợp đồng VAT", description: "Hợp đồng có khoản thu vào tài khoản công ty để chuẩn bị chứng từ VAT." },
  { key: "backfill", title: "Nhập bổ sung", description: "Hợp đồng đã có, gồm hồ sơ đã kết thúc, để bổ sung đúng giao dịch thực tế." },
] as const;
export type MobileContractScope = typeof CONTRACT_WORKSPACES[number]["key"];
export function contractWorkspace(value: unknown) {
  return CONTRACT_WORKSPACES.find(item => item.key === value);
}
export interface MobileContractMonitoring {
  rentalType: string;
  contractTypeName: string;
  nextDueAt: string;
  overdueAt: string;
  dueAmount: number | null;
  rentalDebt: number | null;
  lateFeeEstimate: number | null;
  overdueMinutes: number | null;
  companyPaidAmount: number | null;
  collectionOverdue: boolean;
  basis: "payment" | "return";
}
export function isContractMonitoring(value: unknown): value is MobileContractMonitoring {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return ["rentalType", "contractTypeName", "nextDueAt", "overdueAt"].every(key => typeof row[key] === "string")
    && ["dueAmount", "rentalDebt", "lateFeeEstimate", "overdueMinutes", "companyPaidAmount"].every(key => row[key] === null || typeof row[key] === "number" && Number.isFinite(row[key]) && Number(row[key]) >= 0)
    && typeof row.collectionOverdue === "boolean" && ["payment", "return"].includes(String(row.basis));
}
