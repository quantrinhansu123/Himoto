import { FilteredListExport } from '@/components/filtered-list-export';
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Search, SlidersHorizontal, X } from "lucide-react-native";
import type { MobileRecord } from "../../../shared/mobile-contract";
import { useGlobalBranch } from "@/providers/branch";
import { useSession } from "@/providers/session";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useTheme, money } from "@/theme";
import { Button, Card, InlineError, KeyValueRow, PaginationBar, SegmentedBar, SkeletonList, StateView } from "@/components/ui";
import { ChoiceField } from "@/components/form-fields";
import { ReminderCard } from "@/components/reminder-card";
import { ReminderBatch } from "@/components/reminder-batch";

function Reminders({ initialTab = "history", initialStore }: { initialTab?: string; initialStore?: string }) {
  const { api, session } = useSession(), theme = useTheme(), cache = useQueryClient();
  const canReadAll = Boolean(session!.user.allStores || session!.user.allStoresRead);
  const defaultStore = canReadAll ? "all" : String(session!.user.storeId || "all");
  const { selectedStore: globalStore, selectStore: setGlobalStore } = useGlobalBranch(defaultStore);
  const [storeOverride, setStoreOverride] = useState<string | null>(initialStore && (canReadAll || initialStore === String(session!.user.storeId)) ? initialStore : null);
  const store = !canReadAll ? defaultStore : (storeOverride !== null ? storeOverride : globalStore || defaultStore);
  const setStore = (next: string) => {
    if (!canReadAll) return;
    if (initialStore) setStoreOverride(next);
    else { setStoreOverride(null); setGlobalStore(next); }
  };
  const allowed = session!.user.permissions.includes("contracts.read");
  const canSend = allowed && session!.user.permissions.some(p => p === "contracts.draft" || p === "finance.write");
  const [tabState, setTab] = useState<"history" | "compose">(initialTab === "compose" && canSend ? "compose" : "history");
  const tab = canSend ? tabState : "history";
  const [page, setPage] = useState(1);
  const [input, setInput] = useState(""), search = useDebouncedValue(input);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selection, setSelection] = useState<Record<string, MobileRecord>>({});
  const [batch, setBatch] = useState<number[] | null>(null);
  const options = useQuery({ queryKey: ["reminder-options", session!.user.id], queryFn: ({ signal }) => api!.reminderOptions(signal), enabled: allowed });
  const filters = new URLSearchParams({ store, page: String(page) }), params = filters.toString();
  filters.set("search", search);
  const contractParams = filters.toString();
  const history = useQuery({ queryKey: ["reminder-history", session!.user.id, params], queryFn: ({ signal }) => api!.reminderHistory(params, signal), enabled: allowed && tab === "history", retry: false });
  const contracts = useQuery({ queryKey: ["reminder-contracts", session!.user.id, contractParams], queryFn: ({ signal }) => api!.reminderContracts(contractParams, signal), enabled: canSend && tab === "compose", retry: false });
  if (!allowed) return <StateView title="Không có quyền xem lịch sử nhắc nợ" />;
  const current = tab === "history" ? history : contracts, total = current.data?.total || 0, pages = current.data?.pages || 1, selected = Object.values(selection);
  const toggle = (row: MobileRecord) => setSelection(previous => { const next = { ...previous }; if (next[row.id]) delete next[row.id]; else next[row.id] = row; return next; });
  function sent() {
    setSelection({});
    void cache.invalidateQueries({ queryKey: ["reminder-history"] });
    void cache.invalidateQueries({ queryKey: ["reminder-contracts"] });
  }
  const storeName = store === "all" ? "Tất cả cơ sở" : (options.data?.stores || []).find(r => String(r.id) === store)?.name || "Cơ sở đã chọn";

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 11, maxWidth: 760, width: "100%", alignSelf: "center" }}
        refreshControl={<RefreshControl refreshing={current.isRefetching} tintColor={theme.primary} onRefresh={() => { void current.refetch(); }} />}
      >
        <View style={{ gap: 2 }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 22, fontWeight: "800" }}>Gửi nhắc nợ Zalo</Text>
          <Text style={{ color: theme.muted, fontSize: 12.5 }}>{storeName} · {total} {tab === "history" ? "lần gửi" : "hợp đồng đến hạn"}</Text>
        </View>
        {canSend && (
          <SegmentedBar
            value={tab}
            onChange={value => { setTab(value); setPage(1); }}
            options={[
              { value: "history", label: "Lịch sử gửi" },
              { value: "compose", label: "Soạn & Gửi hàng loạt" },
            ]}
          />
        )}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {tab === "compose" ? (
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, borderColor: theme.controlBorder, backgroundColor: theme.surface, paddingHorizontal: 11, minHeight: 44 }}>
              <Search size={18} color={theme.muted} accessible={false} />
              <TextInput
                accessibilityLabel="Tìm hợp đồng cần nhắc nợ"
                placeholder="Tìm mã HĐ, khách, SĐT…"
                placeholderTextColor={theme.muted}
                value={input}
                onChangeText={value => { setInput(value); setPage(1); }}
                maxLength={200}
                autoCorrect={false}
                style={{ flex: 1, color: theme.text, fontSize: 14.5, paddingVertical: 8 }}
              />
              {!!input && <Pressable onPress={() => { setInput(""); setPage(1); }} hitSlop={8}><X size={17} color={theme.muted} /></Pressable>}
            </View>
          ) : (
            <View style={{ flex: 1 }}><Text style={{ color: theme.muted, fontSize: 12.5, lineHeight: 18 }}>“Webhook đã tiếp nhận” chưa xác nhận khách đã đọc tin.</Text></View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chọn cơ sở và xuất Excel"
            onPress={() => setFiltersOpen(v => !v)}
            style={{ minWidth: 44, minHeight: 44, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: filtersOpen || store !== "all" ? theme.primary : theme.controlBorder, backgroundColor: filtersOpen || store !== "all" ? theme.tint : theme.surface, alignItems: "center", justifyContent: "center" }}
          >
            <SlidersHorizontal size={18} color={filtersOpen || store !== "all" ? theme.primary : theme.text} />
          </Pressable>
        </View>
        {filtersOpen && (
          <Card style={{ gap: 10 }}>
            <ChoiceField label="Cơ sở nhắc nợ" value={store} searchable choices={[...(canReadAll ? [{ value: "all", label: "Tất cả cơ sở" }] : []), ...(options.data?.stores || []).filter(row => canReadAll || row.id === session!.user.storeId).map(row => ({ value: String(row.id), label: row.name }))]} onChange={value => { setStore(value); setPage(1); setSelection({}); }} />
            {tab === 'history' && <FilteredListExport kind="reminders" filters={params} disabled={history.isFetching || history.isError || !history.data?.total} />}
          </Card>
        )}
        {options.isError && <InlineError message={options.error.message} />}
        {tab === "compose" && (
          <>
            {!!selected.length && (
              <Card style={{ gap: 10, padding: 13 }}>
                <Text style={{ color: theme.text, fontSize: 14.5, fontWeight: "700" }}>Đã chọn {selected.length} hợp đồng để gửi mẫu hàng loạt</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button size="sm" equalWidth label="Gửi hàng loạt" onPress={() => setBatch(selected.map(row => row.id))} />
                  <Button size="sm" equalWidth secondary label="Bỏ chọn" onPress={() => setSelection({})} />
                </View>
              </Card>
            )}
            {!!contracts.data?.rows.length && (
              <Button size="sm" secondary label="Chọn tất cả hợp đồng trang này" onPress={() => setSelection(previous => ({ ...previous, ...Object.fromEntries(contracts.data!.rows.map(row => [row.id, row])) }))} />
            )}
          </>
        )}
        {current.isPending ? (
          <SkeletonList count={4} lines={3} />
        ) : current.isError ? (
          <StateView title="Chưa tải được nhắc nợ" message={current.error.message} retry={() => { void current.refetch(); }} />
        ) : tab === "history" ? (
          history.data?.rows.map(row => <ReminderCard key={row.request_id} row={row} />)
        ) : (
          contracts.data?.rows.map(row => (
            <Card key={row.id} style={{ gap: 8, padding: 13 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ color: theme.primary, fontSize: 13.5, fontWeight: "800" }}>{row.code}</Text>
                <Text numberOfLines={1} style={{ color: theme.text, fontSize: 15.5, fontWeight: "700", flex: 1 }}>{row.name}</Text>
              </View>
              <View style={{ gap: 2 }}>
                <KeyValueRow label="SĐT / Cơ sở" value={[row.phone, row.storeName].filter(Boolean).join(" · ")} />
                <KeyValueRow label="Khoản đến hạn" strong valueColor={theme.warning} value={row.monitoring?.dueAmount != null ? money(row.monitoring.dueAmount) : row.totalAmount != null && row.paidAmount != null ? money(Math.max(0, row.totalAmount - row.paidAmount)) : "Mở soạn để đối chiếu"} />
              </View>
              <View style={{ flexDirection: "row", gap: 8, paddingTop: 2 }}>
                <Button size="sm" equalWidth secondary label={selection[row.id] ? "Bỏ chọn" : "Chọn gửi loạt"} onPress={() => toggle(row)} />
                <Button size="sm" equalWidth label="Soạn Zalo" onPress={() => router.push({ pathname: "/reminder-editor/[id]", params: { id: String(row.id) } })} />
              </View>
            </Card>
          ))
        )}
        {!current.isPending && !current.isError && !total && (
          <StateView title={tab === "history" ? "Chưa có lịch sử nhắc nợ" : "Không có hợp đồng đến hạn phù hợp"} />
        )}
        <PaginationBar page={page} pages={pages} total={total} unit={tab === "history" ? "lần gửi" : "hợp đồng"} disabled={current.isFetching} onChange={setPage} />
        {batch && <ReminderBatch ids={batch} onClose={() => setBatch(null)} onSent={sent} onOpenHistory={() => { setBatch(null); setTab("history"); setPage(1); }} />}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function Route() {
  const { api, session } = useSession();
  const { tab, store } = useLocalSearchParams<{ tab?: string; store?: string }>();
  if (!api || !session) return <StateView title="Đăng nhập để xem nhắc nợ" />;
  return <Reminders key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.allStoresRead}:${session.user.permissions.join(",")}:${tab || ""}:${store || ""}`} initialTab={typeof tab === "string" ? tab : undefined} initialStore={typeof store === "string" ? store : undefined} />;
}
