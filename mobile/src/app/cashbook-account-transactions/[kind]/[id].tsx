import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { CashbookAccountKind } from "../../../../../shared/mobile-cashbook";
import { useSession } from "@/providers/session";
import { money, useTheme } from "@/theme";
import { Card, InlineError, KeyValueRow, SegmentedBar, SkeletonList, StateView, StatusBadge } from "@/components/ui";
import { DateField } from "@/components/date-field";
import { FileExportButton } from "@/components/file-export-button";
function Transactions({ kind, id }: { kind: CashbookAccountKind; id: string }) {
  const { api, session } = useSession(), theme = useTheme(), [from, setFrom] = useState(""), [to, setTo] = useState(""), [type, setType] = useState<"income" | "expense">("income");
  const valid = !from || !to || from <= to, allowed = session!.user.permissions.includes("finance.read");
  const query = useQuery({ queryKey: ["cashbook-account-transactions", session!.user.id, kind, id, from, to], queryFn: ({ signal }) => api!.cashbookAccountTransactions(kind, id, new URLSearchParams({ from, to }).toString(), signal), enabled: allowed && valid });
  if (!allowed) return <StateView title="Không có quyền xem thu chi tài khoản" />;
  const rows = valid ? query.data?.rows || [] : [], visible = rows.filter(row => row.type === type), income = rows.filter(row => row.type === "income"), expense = rows.filter(row => row.type === "expense");
  return <SafeAreaView edges={["bottom", "left", "right"]} style={{ flex: 1, backgroundColor: theme.background }}><FlatList data={visible} keyExtractor={row => row.id} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12, maxWidth: 760, width: "100%", alignSelf: "center" }}
    refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }} tintColor={theme.primary} />}
    ListHeaderComponent={<View style={{ gap: 12 }}>
      <View style={{ gap: 2 }}>
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 20, fontWeight: "800" }}>Thu chi {kind === "cash" ? "két" : "ngân hàng"} #{id}</Text>
        <Text style={{ color: theme.muted, fontSize: 12.5 }}>Tối đa 2.000 phiếu gần nhất theo khoảng ngày.</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}><DateField label="Từ ngày" value={from} onChange={setFrom} /></View>
        <View style={{ flex: 1 }}><DateField label="Đến ngày" value={to} onChange={setTo} /></View>
      </View>
      {!valid && <InlineError message="Đến ngày phải bằng hoặc sau Từ ngày." />}
      <Card style={{ gap: 4, padding: 13 }}>
        <KeyValueRow label={`Tổng thu (${income.length} phiếu)`} value={query.data && valid ? money(income.reduce((sum, row) => sum + row.amount, 0)) : "—"} valueColor={theme.success} emphasize />
        <KeyValueRow label={`Tổng chi (${expense.length} phiếu)`} value={query.data && valid ? money(expense.reduce((sum, row) => sum + row.amount, 0)) : "—"} valueColor={theme.danger} emphasize />
      </Card>
      <SegmentedBar value={type} onChange={setType} options={[{ value: "income", label: "Phiếu thu", count: income.length }, { value: "expense", label: "Phiếu chi", count: expense.length }]} />
      <FileExportButton
        label={`Tải Excel phiếu ${type === "income" ? "thu" : "chi"} (${visible.length})`}
        disabled={!valid || query.isFetching || query.isError || !visible.length}
        load={(signal) =>
          api!.exportWorkbook(
            {
              filename: `himoto-so-quy-${kind}-${id}-${type}`,
              headers: ["Mã phiếu", "Loại", "Số tiền (VND)", "Hợp đồng", "Ngày", "Giờ", "Người ghi", "Nội dung"],
              rows: visible.map((r) => [
                r.id,
                type === "income" ? "Thu" : "Chi",
                r.amount,
                r.contractCode || "",
                r.date || "",
                r.time || "",
                r.actorName || "",
                r.content || "",
              ]),
            },
            signal,
          )
        }
      />
    </View>}
    renderItem={({ item }) => <Card style={{ gap: 6, padding: 13 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
          <StatusBadge status={type} label={type === "income" ? "Thu" : "Chi"} />
          <Text style={{ color: theme.text, fontSize: 15, fontWeight: "800" }}>#{item.id}</Text>
          {!!item.contractCode && <Text style={{ color: theme.primary, fontSize: 13.5, fontWeight: "700" }}>{item.contractCode}</Text>}
        </View>
        <Text style={{ color: type === "income" ? theme.success : theme.danger, fontWeight: "800", fontSize: 17 }}>
          {type === "income" ? "+" : "−"}{money(item.amount)}
        </Text>
      </View>
      <KeyValueRow label="Thời gian / Người lập" value={`${item.date ? item.date.split("-").reverse().join("/") : "Chưa có ngày"} ${item.time || ""} · ${item.actorName || "—"}`} />
      {!!item.content && <Text selectable style={{ color: theme.text, fontSize: 13.5, lineHeight: 20 }}>{item.content}</Text>}
    </Card>}
    ListEmptyComponent={!valid ? <StateView title="Kiểm tra khoảng ngày" /> : query.isPending ? <SkeletonList count={3} lines={3} /> : query.isError ? <StateView title="Chưa tải được thu chi" message={query.error.message} retry={() => { void query.refetch(); }} /> : <StateView title="Chưa có phiếu phù hợp" />}
  /></SafeAreaView>;
}
export default function TransactionsRoute() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>(), { api, session } = useSession();
  if (!api || !session || kind !== "bank" && kind !== "cash" || !/^[1-9]\d{0,14}$/.test(id)) return <StateView title="Không mở được thu chi tài khoản" />;
  return <Transactions key={`${kind}:${id}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} kind={kind} id={id} />;
}
