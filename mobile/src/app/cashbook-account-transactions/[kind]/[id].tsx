import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { FlatList, RefreshControl, Text, View } from "react-native";
import type { CashbookAccountKind } from "../../../../../shared/mobile-cashbook";
import { useSession } from "@/providers/session";
import { money, useTheme } from "@/theme";
import { Button, Card, InlineError, StateView } from "@/components/ui";
import { DateField } from "@/components/date-field";
function Transactions({ kind, id }: { kind: CashbookAccountKind; id: string }) {
  const { api, session } = useSession(), theme = useTheme(), [from, setFrom] = useState(""), [to, setTo] = useState(""), [type, setType] = useState("income");
  const valid = !from || !to || from <= to, allowed = session!.user.permissions.includes("finance.read");
  const query = useQuery({ queryKey: ["cashbook-account-transactions", session!.user.id, kind, id, from, to], queryFn: ({ signal }) => api!.cashbookAccountTransactions(kind, id, new URLSearchParams({ from, to }).toString(), signal), enabled: allowed && valid });
  if (!allowed) return <StateView title="Không có quyền xem thu chi tài khoản" />;
  const rows = valid ? query.data?.rows || [] : [], visible = rows.filter(row => row.type === type), income = rows.filter(row => row.type === "income"), expense = rows.filter(row => row.type === "expense");
  return <FlatList data={visible} keyExtractor={row => row.id} contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 14, maxWidth: 760, width: "100%", alignSelf: "center" }}
    refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }} tintColor={theme.primary} />}
    ListHeaderComponent={<View style={{ gap: 16 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 25, fontWeight: "800" }}>Thu chi {kind === "cash" ? "két" : "ngân hàng"} #{id}</Text>
      <DateField label="Phiếu tài khoản từ ngày" value={from} onChange={setFrom} /><DateField label="Phiếu tài khoản đến ngày" value={to} onChange={setTo} />
      {!valid && <InlineError message="Đến ngày phải bằng hoặc sau Từ ngày." />}
      <Text style={{ color: theme.muted, lineHeight: 22 }}>Tối đa 2.000 phiếu gần nhất theo khoảng ngày, cùng giới hạn nguồn web. Tổng dưới đây tính trên các phiếu đã tải.</Text>
      <Card style={{ gap: 8 }}><Text style={{ color: theme.text }}>Tổng thu ({income.length} phiếu): {query.data && valid ? money(income.reduce((sum, row) => sum + row.amount, 0)) : "—"}</Text><Text style={{ color: theme.text }}>Tổng chi ({expense.length} phiếu): {query.data && valid ? money(expense.reduce((sum, row) => sum + row.amount, 0)) : "—"}</Text></Card>
      <View style={{ flexDirection: "row", gap: 10 }}><View style={{ flex: 1 }}><Button secondary={type !== "income"} label="Thu của tài khoản" onPress={() => setType("income")} /></View><View style={{ flex: 1 }}><Button secondary={type !== "expense"} label="Chi của tài khoản" onPress={() => setType("expense")} /></View></View>
    </View>}
    renderItem={({ item }) => <Card style={{ gap: 9 }}><Text style={{ color: type === "income" ? theme.success : theme.danger, fontWeight: "800", fontSize: 20 }}>{money(item.amount)}</Text><Text style={{ color: theme.text, fontWeight: "600" }}>#{item.id} · {item.contractCode || "Không gắn hợp đồng"}</Text><Text style={{ color: theme.muted }}>{item.date ? item.date.split("-").reverse().join("/") : "Chưa có ngày"} {item.time} · {item.actorName || "—"}</Text>{!!item.content && <Text selectable style={{ color: theme.text, lineHeight: 23 }}>{item.content}</Text>}</Card>}
    ListEmptyComponent={!valid ? <StateView title="Kiểm tra khoảng ngày" /> : query.isPending ? <StateView title="Đang tải thu chi tài khoản" loading /> : query.isError ? <StateView title="Chưa tải được thu chi" message={query.error.message} retry={() => { void query.refetch(); }} /> : <StateView title="Chưa có phiếu phù hợp" />}
  />;
}
export default function TransactionsRoute() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>(), { api, session } = useSession();
  if (!api || !session || kind !== "bank" && kind !== "cash" || !/^[1-9]\d{0,14}$/.test(id)) return <StateView title="Không mở được thu chi tài khoản" />;
  return <Transactions key={`${kind}:${id}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} kind={kind} id={id} />;
}
