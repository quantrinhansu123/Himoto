import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSession } from "@/providers/session";
import { useWorkspace } from "@/hooks/use-workspace";
import { money, useTheme } from "@/theme";
import { Button, Card, StateView } from "@/components/ui";
import { ChoiceField } from "@/components/form-fields";
import { CashbookAccountCard } from "@/components/cashbook-account-card";
function Accounts({ initialStore }: { initialStore?: string }) {
  const { api, session } = useSession(), workspace = useWorkspace(), theme = useTheme();
  const [store, setStore] = useState(initialStore || (session!.user.allStores ? "all" : String(session!.user.storeId || "all"))), [status, setStatus] = useState("active");
  const allowed = session!.user.permissions.includes("finance.read"), query = useQuery({ queryKey: ["cashbook-accounts", session!.user.id, store, status], queryFn: ({ signal }) => api!.cashbookAccounts(new URLSearchParams({ store_id: store, status }).toString(), signal), enabled: allowed });
  if (!allowed) return <StateView title="Không có quyền xem tài khoản sổ quỹ" />;
  const stores = (workspace.data?.stores || []).filter(row => session!.user.allStores || row.id === session!.user.storeId), rows = query.data?.rows || [];
  const total = rows.reduce((sum, row) => sum + row.balance, 0);
  return <FlatList data={rows} keyExtractor={row => `${row.kind}:${row.id}`} contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16, maxWidth: 760, width: "100%", alignSelf: "center" }}
    refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }} tintColor={theme.primary} />}
    ListHeaderComponent={<View style={{ gap: 16 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 26, fontWeight: "800" }}>Tài khoản ngân hàng / Két</Text>
      <Text style={{ color: theme.muted, lineHeight: 23 }}>Số dư = số dư đầu kỳ + tổng thu − tổng chi. Tính trên toàn bộ phiếu, không theo bộ lọc ngày.</Text>
      {session!.user.permissions.includes("finance.write") && <Button label="Thêm tài khoản sổ quỹ" onPress={() => router.push({ pathname: "/cashbook-account-editor/[kind]/[id]", params: { kind: "cash", id: "new", store } })} />}
      <ChoiceField label="Cơ sở tài khoản" value={store} choices={[...(session!.user.allStores ? [{ value: "all", label: "Tất cả cơ sở" }] : []), ...stores.map(row => ({ value: String(row.id), label: row.name }))]} searchable onChange={setStore} />
      <ChoiceField label="Trạng thái tài khoản sổ quỹ" value={status} choices={[{ value: "active", label: "Đang sử dụng" }, { value: "inactive", label: "Ngừng sử dụng" }, { value: "all", label: "Tất cả tài khoản" }]} onChange={setStatus} />
      {query.data && <Card style={{ gap: 6 }}><Text style={{ color: theme.muted }}>{rows.length} tài khoản trong danh sách</Text><Text style={{ color: total < 0 ? theme.danger : theme.text, fontSize: 23, fontWeight: "800" }}>Tổng số dư {money(total)}</Text></Card>}
    </View>}
    renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Mở tài khoản ${item.label}`} onPress={() => router.push({ pathname: "/cashbook-account/[kind]/[id]", params: { kind: item.kind, id: String(item.id) } })} style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}><CashbookAccountCard row={item} /></Pressable>}
    ListEmptyComponent={query.isPending ? <StateView title="Đang tính số dư tài khoản" loading /> : query.isError ? <StateView title="Chưa tải được tài khoản" message={query.error.message} retry={() => { void query.refetch(); }} /> : <StateView title="Chưa có tài khoản phù hợp" />}
  />;
}
export default function AccountsRoute() {
  const { store } = useLocalSearchParams<{ store?: string }>(), { api, session } = useSession();
  if (!api || !session || store && store !== "all" && !/^[1-9]\d{0,14}$/.test(store)) return <StateView title="Không mở được tài khoản sổ quỹ" />;
  return <Accounts key={`${store}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} initialStore={store} />;
}
