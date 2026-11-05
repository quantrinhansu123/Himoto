import { useColorScheme } from "react-native";
const light = {
  background: "#F5F6F8",
  surface: "#FFFFFF",
  text: "#17202A",
  muted: "#536071",
  border: "#D6DAE1",
  controlBorder: "#7A8596",
  primary: "#BA2028",
  primaryText: "#FFFFFF",
  tint: "#FFF0F0",
  success: "#166534",
  successBackground: "#EAF6EE",
  danger: "#B91C1C",
  dangerBackground: "#FEF0EF",
  warning: "#854D0E",
  warningBackground: "#FEF3C7",
  scrim: "rgba(10,16,24,0.55)",
};
const dark: typeof light = {
  background: "#11151C",
  surface: "#1C232E",
  text: "#F2F4F7",
  muted: "#B3BECC",
  border: "#465366",
  controlBorder: "#718096",
  primary: "#FF9297",
  primaryText: "#3D080C",
  tint: "#442127",
  success: "#9BE5B3",
  successBackground: "#193D2A",
  danger: "#FFADA5",
  dangerBackground: "#482726",
  warning: "#F7DA82",
  warningBackground: "#44391B",
  scrim: "rgba(0,0,0,0.65)",
};
export function useTheme() {
  return useColorScheme() === "dark" ? dark : light;
}
export const roles: Record<string, string> = {
  admin: "Quản trị viên",
  branch_staff: "Nhân viên cơ sở",
  branch_manager: "Quản lý cơ sở",
  ownership_staff: "Nhân viên thuê sở hữu",
  ownership_manager: "Quản lý thuê sở hữu",
  accounting: "Kế toán",
  hr: "Hành chính nhân sự",
  internal_control: "Kiểm toán nội bộ",
  headquarters_sales: "Kinh doanh trụ sở",
  headquarters_debt: "Quản lý công nợ",
};
export const statuses: Record<string, string> = {
  ready: "Lưu kho",
  using: "Đang thuê",
  repairing: "Bảo dưỡng",
  pending: "Đặt trước",
  in_transit: "Chờ luân chuyển",
  sold: "Đã bán",
  broken: "Hỏng",
  bad_debt: "Nợ xấu",
  renting: "Đang thuê",
  overdue: "Quá hạn",
  completed: "Hoàn thành",
  draft: "Bản nháp",
  wait_payment: "Chờ tất toán",
  cancelled: "Đã hủy",
  reserved: "Bảo lưu",
  deposit_contract: "Đã cọc",
  cancel_pending_settlement: "Chờ tất toán hủy",
  active: "Bình thường",
  warning: "Cần lưu ý",
  blacklist: "Danh sách cảnh báo",
  inactive: "Tạm nghỉ",
};
export function money(value: number | null) {
  return value === null
    ? "Chưa có dữ liệu"
    : new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0,
      }).format(value);
}
export function dateTime(value: string) {
  if (!value) return "Chưa có dữ liệu";
  const date = new Date(
    /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}+07:00`,
  );
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Asia/Ho_Chi_Minh",
      }).format(date)
    : "Chưa có dữ liệu";
}
