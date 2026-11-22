import { Platform, useColorScheme, type ViewStyle } from "react-native";

const light = {
  background: "#F6F7F9",
  surface: "#FFFFFF",
  text: "#171717",
  muted: "#525252",
  border: "#E5E7EB",
  controlBorder: "#767E8C",
  primary: "#D32F2F",
  primaryText: "#FFFFFF",
  tint: "#FFF5F5",
  accent: "#B45309",
  accentBackground: "#FFFBEB",
  success: "#15803D",
  successBackground: "#ECFDF5",
  danger: "#B91C1C",
  dangerBackground: "#FEF2F2",
  warning: "#92400E",
  warningBackground: "#FFFBEB",
  info: "#1D4ED8",
  infoBackground: "#EFF6FF",
  scrim: "rgba(15,23,42,0.52)",
};

const dark: typeof light = {
  background: "#111419",
  surface: "#1B2028",
  text: "#F5F6F8",
  muted: "#B0BAC9",
  border: "#333C4A",
  controlBorder: "#707D91",
  primary: "#FF8A8A",
  primaryText: "#3B080A",
  tint: "#3F1D21",
  accent: "#FCD34D",
  accentBackground: "#3D3014",
  success: "#86EFAC",
  successBackground: "#143324",
  danger: "#FCA5A5",
  dangerBackground: "#421E1E",
  warning: "#FDE68A",
  warningBackground: "#3F3216",
  info: "#93C5FD",
  infoBackground: "#182C4A",
  scrim: "rgba(0,0,0,0.68)",
};

export const cardShadow: ViewStyle = (Platform?.select?.({
  ios: {
    shadowColor: "#171717",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  android: {
    elevation: 1.5,
  },
  default: {},
}) ?? {}) as ViewStyle;

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

export { statuses } from "./lib/status-labels";

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
