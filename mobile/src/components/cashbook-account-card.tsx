import { Text, View } from "react-native";
import type { MobileCashbookAccount } from "../../../shared/mobile-cashbook";
import { money, useTheme } from "@/theme";
import { Card, KeyValueRow, StatusBadge } from "./ui";

export const cashbookAccountLabel = (row: MobileCashbookAccount) =>
  row.kind === "cash"
    ? "Tiền mặt (két)"
    : row.ownerType === "company"
      ? "TK công ty"
      : "Ngân hàng cơ sở";

export function CashbookAccountCard({
  row,
  details = false,
}: {
  row: MobileCashbookAccount;
  details?: boolean;
}) {
  const theme = useTheme();
  const fields: [string, string][] = details
    ? [
        ["Loại", cashbookAccountLabel(row)],
        [
          "Cơ sở",
          row.storeName ||
            (row.ownerType === "company" ? "Toàn công ty" : "—"),
        ],
        ...(row.kind === "bank"
          ? ([
              ["Ngân hàng", row.bankName],
              ["Chủ tài khoản", row.ownerName],
              ["Số tài khoản", row.accountNumber],
            ] as [string, string][])
          : []),
        ["Số dư đầu kỳ", money(row.opening)],
        ["Tổng thu", money(row.income)],
        ["Tổng chi", money(row.expense)],
        ["Số phiếu", String(row.voucherCount)],
      ]
    : [];

  return (
    <Card style={{ gap: 8, padding: details ? 16 : 13 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Text
          accessibilityRole="header"
          numberOfLines={details ? 2 : 1}
          style={{
            color: theme.text,
            fontSize: details ? 19 : 15.5,
            fontWeight: "800",
            flex: 1,
          }}
        >
          {row.name || row.bankName || row.label}
        </Text>
        <StatusBadge
          status={row.status}
          label={row.status === "active" ? "Đang dùng" : "Ngừng"}
        />
      </View>
      <Text style={{ color: theme.muted, fontSize: 12.5, lineHeight: 18 }}>
        {details
          ? row.label
          : `${cashbookAccountLabel(row)} · ${row.storeName || (row.ownerType === "company" ? "Toàn công ty" : "—")}`}
      </Text>
      {fields.length > 0 && (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: theme.border,
            paddingTop: 6,
            gap: 2,
          }}
        >
          {fields.map(([label, value]) => (
            <KeyValueRow key={label} label={label} value={value || "—"} selectable />
          ))}
        </View>
      )}
      <KeyValueRow
        label="Số dư hiện tại"
        strong
        valueColor={row.balance < 0 ? theme.danger : theme.text}
        value={money(row.balance)}
      />
      {details && (
        <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18 }}>
          Số dư đầu kỳ + tổng thu − tổng chi. Tính trên toàn bộ phiếu, không theo bộ lọc ngày.
        </Text>
      )}
    </Card>
  );
}
