import { FilteredListExport } from '@/components/filtered-list-export';
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Plus, Search, SlidersHorizontal, X } from "lucide-react-native";
import { BATTERY_STATUSES, batteryStatusLabel } from "../../../shared/mobile-battery";
import { useSession } from "@/providers/session";
import { useWorkspace } from "@/hooks/use-workspace";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useTheme, money } from "@/theme";
import { Button, Card, Chip, InlineError, KeyValueRow, PaginationBar, SkeletonList, StateView, StatusBadge } from "@/components/ui";
import { ChoiceField } from "@/components/form-fields";

function List({ source }: { source: string }) {
  const { api, session } = useSession();
  const workspace = useWorkspace();
  const theme = useTheme();
  const canReadAll = Boolean(session!.user.allStores || session!.user.allStoresRead);
  const [store, setStore] = useState(session!.user.allStores ? '' : String(session!.user.storeId || ''));
  const [status, setStatus] = useState('');
  const [input, setInput] = useState('');
  const search = useDebouncedValue(input);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const allowed = session!.user.permissions.includes('contracts.read');
  const options = useQuery({ queryKey: ['battery-options', session!.user.id], queryFn: ({ signal }) => api!.batteryOptions(signal), enabled: allowed });
  const params = new URLSearchParams({ ...source ? { vehicle_contract_id: source } : store ? { store_id: store } : {}, status, search, page: String(page) }).toString();
  const query = useQuery({ queryKey: ['batteries', session!.user.id, session!.user.allStoresRead, params], queryFn: ({ signal }) => api!.batteries(params, signal), enabled: allowed, retry: false });
  const filterStores = (canReadAll && workspace.data?.stores.length ? workspace.data.stores : options.data?.stores || []).filter(s => canReadAll || s.id === session!.user.storeId);
  if (!allowed) return <StateView title="Không có quyền xem hợp đồng pin / sạc" />;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 11, maxWidth: 760, width: '100%', alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={query.isRefetching} tintColor={theme.primary} onRefresh={() => { void query.refetch(); }} />}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <Text style={{ color: theme.muted, fontSize: 13, flex: 1 }}>
            {query.data ? `${query.data.scopeCount} hợp đồng trong phạm vi` : 'Đang tải…'}{source ? ` · HĐ xe #${source}` : ''}
          </Text>
          {session!.user.permissions.includes('contracts.draft') && (
            <Button size="sm" icon={<Plus size={14} color={theme.primaryText} />} label="Lập HĐ pin" onPress={() => router.push({ pathname: '/battery-editor/[id]', params: { id: 'new', ...(source ? { source } : {}) } })} />
          )}
        </View>

        {source ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button size="sm" equalWidth secondary label="Xem tất cả pin" onPress={() => router.replace('/battery-contracts')} />
            <Button size="sm" equalWidth secondary label="Đổi pin theo HĐ xe" onPress={() => router.push({ pathname: '/contract-operation/[action]/[id]', params: { id: source, action: 'battery_swap' } })} />
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, borderColor: theme.controlBorder, backgroundColor: theme.surface, paddingHorizontal: 11, minHeight: 44 }}>
            <Search size={18} color={theme.muted} accessible={false} />
            <TextInput
              accessibilityLabel="Tìm hợp đồng pin / sạc"
              placeholder="Tìm mã HĐ, tên khách, biển số, tên pin…"
              placeholderTextColor={theme.muted}
              value={input}
              maxLength={200}
              onChangeText={v => { setInput(v); setPage(1); }}
              autoCorrect={false}
              style={{ flex: 1, color: theme.text, fontSize: 14.5, paddingVertical: 8 }}
            />
            {!!input && <Pressable onPress={() => { setInput(''); setPage(1); }} hitSlop={8}><X size={17} color={theme.muted} /></Pressable>}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Bộ lọc và xuất Excel"
            onPress={() => setFiltersOpen(v => !v)}
            style={{ minWidth: 44, minHeight: 44, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: filtersOpen || store ? theme.primary : theme.controlBorder, backgroundColor: filtersOpen || store ? theme.tint : theme.surface, alignItems: 'center', justifyContent: 'center' }}
          >
            <SlidersHorizontal size={18} color={filtersOpen || store ? theme.primary : theme.text} />
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
          <Chip label="Tất cả" selected={status === ''} onPress={() => { setStatus(''); setPage(1); }} />
          {BATTERY_STATUSES.map(s => (
            <Chip
              key={s.value}
              label={s.label}
              count={query.data ? query.data.statusCounts.find(c => c.status === s.value)?.count || 0 : undefined}
              selected={status === s.value}
              onPress={() => { setStatus(s.value); setPage(1); }}
            />
          ))}
        </ScrollView>

        {filtersOpen && (
          <Card style={{ gap: 10 }}>
            <ChoiceField label="Cơ sở pin / sạc" value={source ? '' : store} choices={[...(canReadAll || source ? [{ value: '', label: source ? 'Theo cơ sở hợp đồng xe' : 'Tất cả cơ sở' }] : []), ...filterStores.map(s => ({ value: String(s.id), label: s.name }))]} disabled={!!source} searchable onChange={v => { setStore(v); setPage(1); }} />
            <FilteredListExport kind="battery" filters={params} disabled={query.isFetching || query.isError || !query.data?.total || input !== search} />
          </Card>
        )}

        {options.isError && <InlineError message={options.error.message} />}

        {query.isPending ? (
          <SkeletonList count={4} lines={3} />
        ) : query.isError ? (
          <StateView title="Chưa tải được pin / sạc" message={query.error.message} retry={() => { void query.refetch(); }} />
        ) : query.data.rows.length ? (
          query.data.rows.map(r => (
            <Pressable key={r.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/battery/[id]', params: { id: String(r.id) } })} style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}>
              <Card style={{ gap: 8, padding: 13 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <Text style={{ color: theme.primary, fontSize: 13.5, fontWeight: '800' }}>{r.code}</Text>
                    <Text numberOfLines={1} style={{ color: theme.text, fontSize: 15.5, fontWeight: '700', flexShrink: 1 }}>{r.customer_name}</Text>
                  </View>
                  <StatusBadge status={r.status} label={batteryStatusLabel(r.status)} />
                </View>
                <View style={{ gap: 2 }}>
                  <KeyValueRow label="Pin / Biển số" value={[r.battery_name, r.vehicle_license].filter(Boolean).join(' · ')} />
                  <KeyValueRow label="Cơ sở" value={r.store_name} />
                  <KeyValueRow label="Giá thuê" strong value={r.rent_price === null ? 'Chưa ghi' : `${money(r.rent_price)} / ${r.price_unit}`} />
                </View>
              </Card>
            </Pressable>
          ))
        ) : (
          <StateView title="Không có hợp đồng pin / sạc phù hợp" />
        )}

        {query.data && (
          <PaginationBar page={query.data.page} pages={query.data.pages} total={query.data.total} unit="hợp đồng" disabled={query.isFetching} onChange={setPage} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function Route() {
  const { source = '' } = useLocalSearchParams<{ source?: string }>();
  const { api, session } = useSession();
  if (!api || !session || (source && !/^[1-9]\d{0,14}$/.test(source))) return <StateView title="Không mở được danh sách pin / sạc" />;
  return <List key={`${source}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(',')}`} source={source} />;
}
