import { useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { REMINDER_STATUS_LABELS, reminderResultMessage, type DebtReminderRow } from "../../../shared/mobile-debt-reminders";
import { money, useTheme } from "@/theme";
import { Button, Card, KeyValueRow, StatusBadge } from "./ui";

export function ReminderCard({ row, details = false }: { row: DebtReminderRow; details?: boolean }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(details);
  const sentAt = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(row.created_at));

  return (
    <Card style={{ gap: 8, padding: 13 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
          <Text style={{ color: theme.primary, fontSize: 13.5, fontWeight: "800" }}>{row.contract_code}</Text>
          <Text numberOfLines={1} style={{ color: theme.text, fontSize: 15.5, fontWeight: "700", flexShrink: 1 }}>{row.customer_name}</Text>
        </View>
        <StatusBadge status={row.status} label={REMINDER_STATUS_LABELS[row.status]} />
      </View>
      <View style={{ gap: 2 }}>
        <KeyValueRow label="Số tiền nhắc" strong value={money(row.amount)} />
        <KeyValueRow label="SĐT / Cơ sở" value={[row.phone, row.store_name].filter(Boolean).join(" · ")} />
        <KeyValueRow label="Gửi lúc / Người gửi" value={`${sentAt} · ${row.actor_name || "—"}`} />
      </View>
      {expanded && (
        <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 8 }}>
          <Text selectable style={{ color: theme.text, fontSize: 13.5, lineHeight: 20 }}>{row.message}</Text>
          <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17 }}>{reminderResultMessage(row.status)}</Text>
          <Text selectable style={{ color: theme.muted, fontSize: 12 }}>Mã lần gửi: {row.request_id}</Text>
        </View>
      )}
      <View style={{ flexDirection: "row", gap: 8, paddingTop: 2 }}>
        {!details && (
          <Button size="sm" equalWidth secondary label={expanded ? "Ẩn nội dung" : "Xem nội dung"} onPress={() => setExpanded(v => !v)} />
        )}
        <Button size="sm" equalWidth secondary label="Mở hợp đồng" onPress={() => router.push({ pathname: "/record/[kind]/[id]", params: { kind: "contracts", id: String(row.order_id) } })} />
      </View>
    </Card>
  );
}
