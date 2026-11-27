import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Plus } from "lucide-react-native";
import { useGlobalBranch } from "@/providers/branch";
import { useSession } from "@/providers/session";
import { useWorkspace } from "@/hooks/use-workspace";
import { money, useTheme } from "@/theme";
import { Button, Card, KeyValueRow, SegmentedBar, SkeletonList, StateView } from "@/components/ui";
import { ChoiceField } from "@/components/form-fields";
import { CashbookAccountCard } from "@/components/cashbook-account-card";
import {FileExportButton} from '@/components/file-export-button';
function Accounts({ initialStore,initialStatus }: { initialStore?: string;initialStatus:string }) {
  const { api, session } = useSession(), workspace = useWorkspace(), theme = useTheme();
  const canReadAll=Boolean(session!.user.allStores||session!.user.allStoresRead);
  const defaultStore = canReadAll ? "all" : String(session!.user.storeId || "all");
  const { selectedStore: globalStore, selectStore: setGlobalStore } = useGlobalBranch(defaultStore);
  const [storeOverride, setStoreOverride] = useState<string | null>(initialStore && (canReadAll || initialStore === String(session!.user.storeId)) ? initialStore : null);
  const store = !canReadAll ? defaultStore : (storeOverride !== null ? storeOverride : globalStore || defaultStore);
  const setStore = (next: string) => {
    if (!canReadAll) return;
    if (initialStore) setStoreOverride(next);
    else { setStoreOverride(null); setGlobalStore(next); }
  };
  const [status, setStatus] = useState(initialStatus);
  const allowed = session!.user.permissions.includes("finance.read"), query = useQuery({ queryKey: ["cashbook-accounts", session!.user.id, store, status], queryFn: ({ signal }) => api!.cashbookAccounts(new URLSearchParams({ store_id: store, status }).toString(), signal), enabled: allowed });
  if (!allowed) return <StateView title="Không có quyền xem tài khoản sổ quỹ" />;
  const stores = (workspace.data?.stores || []).filter(row => canReadAll || row.id === session!.user.storeId), rows = query.data?.rows || [];
  const total = rows.reduce((sum, row) => sum + row.balance, 0);
  const totalOpening = rows.reduce((sum, row) => sum + row.opening, 0);
  const totalIncome = rows.reduce((sum, row) => sum + row.income, 0);
  const totalExpense = rows.reduce((sum, row) => sum + row.expense, 0);
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}><FlatList data={rows} keyExtractor={row => `${row.kind}:${row.id}`} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12, maxWidth: 760, width: "100%", alignSelf: "center" }}
    refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }} tintColor={theme.primary} />}
    ListHeaderComponent={<View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <Text style={{ color: theme.muted, fontSize: 13, flex: 1 }}>Số dư = đầu kỳ + tổng thu − tổng chi</Text>
        {session!.user.permissions.includes("finance.write") && <Button size="sm" icon={<Plus size={14} color={theme.primaryText} />} label="Thêm tài khoản" onPress={() => router.push({ pathname: "/cashbook-account-editor/[kind]/[id]", params: { kind: "cash", id: "new", store } })} />}
      </View>
      <SegmentedBar value={status} onChange={setStatus} options={[{ value: "active", label: "Đang sử dụng" }, { value: "inactive", label: "Ngừng sử dụng" }, { value: "all", label: "Tất cả tài khoản" }]} />
      <ChoiceField label="Cơ sở tài khoản" value={store} choices={[...(canReadAll ? [{ value: "all", label: "Tất cả cơ sở" }] : []), ...stores.map(row => ({ value: String(row.id), label: row.name }))]} searchable onChange={setStore} />
      {query.data && <Card style={{ gap: 6, padding: 14 }}>
        <KeyValueRow label="Số lượng tài khoản" value={`${rows.length} tài khoản`} />
        <KeyValueRow label="Số dư đầu kỳ" value={money(totalOpening)} />
        <KeyValueRow label="Tổng thu / Tổng chi" value={`${money(totalIncome)} / ${money(totalExpense)}`} />
        <KeyValueRow label="Tổng số dư hiện tại" value={money(total)} emphasize valueColor={total < 0 ? theme.danger : theme.primary} />
      </Card>}
      <FileExportButton label="Tải Excel tài khoản theo bộ lọc" disabled={query.isFetching||query.isError||!rows.length}
        load={signal=>api!.cashbookAccountsExcel(new URLSearchParams({store_id:store,status}).toString(),signal)} />
    </View>}
    renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Mở tài khoản ${item.label}`} onPress={() => router.push({ pathname: "/cashbook-account/[kind]/[id]", params: { kind: item.kind, id: String(item.id) } })} style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}><CashbookAccountCard row={item} /></Pressable>}
    ListEmptyComponent={query.isPending ? <SkeletonList count={3} lines={3} /> : query.isError ? <StateView title="Chưa tải được tài khoản" message={query.error.message} retry={() => { void query.refetch(); }} /> : <StateView title="Chưa có tài khoản phù hợp" />}
  /></SafeAreaView>;
}
export default function AccountsRoute() {
  const { store,status } = useLocalSearchParams<{ store?: string;status?:string }>(), { api, session } = useSession();
  if (!api || !session || store && store !== "all" && !/^[1-9]\d{0,14}$/.test(store)) return <StateView title="Không mở được tài khoản sổ quỹ" />;
  const initialStatus=status==='all'||status==='inactive'?status:'active';
  return <Accounts key={`${store}:${initialStatus}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.allStoresRead}:${session.user.permissions.join(",")}`} initialStore={store} initialStatus={initialStatus} />;
}
