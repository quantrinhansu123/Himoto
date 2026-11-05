import { Text, View } from "react-native";
import type { MobileCashbookAccount } from "../../../shared/mobile-cashbook";
import { money, useTheme } from "@/theme";
import { Card, StatusBadge } from "./ui";
export const cashbookAccountLabel = (row: MobileCashbookAccount) => row.kind === "cash" ? "Tiền mặt (két)" : row.ownerType === "company" ? "TK công ty" : "Ngân hàng cơ sở";
export function CashbookAccountCard({ row, details = false }: { row: MobileCashbookAccount; details?: boolean }) {
  const theme = useTheme();
  const fields = details ? [["Loại", cashbookAccountLabel(row)], ["Cơ sở", row.storeName || (row.ownerType === "company" ? "Toàn công ty" : "—")], ...(row.kind === "bank" ? [["Ngân hàng", row.bankName], ["Chủ tài khoản", row.ownerName], ["Số tài khoản", row.accountNumber]] : []), ["Số dư đầu kỳ", money(row.opening)], ["Tổng thu", money(row.income)], ["Tổng chi", money(row.expense)], ["Số phiếu", String(row.voucherCount)]] : [];
  return <Card style={{ gap: 14 }}>
    <Text accessibilityRole="header" style={{ color: theme.text, fontSize: details ? 24 : 19, fontWeight: "800" }}>{row.name || row.bankName || row.label}</Text>
    <Text style={{ color: theme.muted, lineHeight: 22 }}>{details ? row.label : `${cashbookAccountLabel(row)} · ${row.storeName || (row.ownerType === "company" ? "Toàn công ty" : "—")}`}</Text>
    <StatusBadge status={row.status} label={row.status === "active" ? "Đang sử dụng" : "Ngừng sử dụng"} />
    {fields.map(([label, value]) => <View key={label} style={{ gap: 4 }}><Text style={{ color: theme.muted }}>{label}</Text><Text selectable style={{ color: theme.text, fontSize: 16, lineHeight: 23 }}>{value || "—"}</Text></View>)}
    <Text style={{ color: row.balance < 0 ? theme.danger : theme.text, fontSize: 22, fontWeight: "800" }}>Số dư {money(row.balance)}</Text>
    {details && <Text style={{ color: theme.muted, lineHeight: 22 }}>Số dư đầu kỳ + tổng thu − tổng chi. Tính trên toàn bộ phiếu, không theo bộ lọc ngày.</Text>}
  </Card>;
}
