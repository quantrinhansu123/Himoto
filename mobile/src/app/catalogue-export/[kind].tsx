import { useState } from 'react';
import { Stack, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isCatalogueExportKind, type MobileCatalogueExportKind } from '../../../../shared/mobile-catalogue-export';
import { contractWorkspace } from '../../../../shared/mobile-contract-workspaces';
import { useSession } from '@/providers/session';
import { useWorkspace } from '@/hooks/use-workspace';
import { useCsvExport } from '@/hooks/use-csv-export';
import { statuses, useTheme } from '@/theme';
import { Button, Card, InlineError, StateView } from '@/components/ui';

export default function CatalogueExportRoute() {
  const { kind, filters = '' } = useLocalSearchParams<{ kind: string; filters?: string }>(), { api, session } = useSession();
  if (!api || !session || !isCatalogueExportKind(kind) || typeof filters !== 'string' || filters.length > 2048 || !session.user.permissions.includes(kind === 'staff' ? 'hr.read' : kind === 'stores' ? 'contracts.read' : `${kind}.read`)) return <StateView title="Không mở được xuất danh mục" />;
  return <Exporter key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(',')}:${kind}:${filters}`} kind={kind} filters={filters} />;
}
function Exporter({ kind, filters }: { kind: MobileCatalogueExportKind; filters: string }) {
  const { api, session } = useSession(), theme = useTheme(), workspace = useWorkspace(), output = useCsvExport();
  const [selection, setSelection] = useState<Set<string> | null>(null);
  usePreventRemove(output.busy, () => {});
  const query = useQuery({ queryKey: ['export-columns', api?.origin, session?.user.id, session?.user.storeId, session?.user.allStores, kind, filters], queryFn: ({ signal }) => api!.catalogueExportColumns(kind, filters, signal), retry: false });
  const p = query.data, selected = selection || new Set(p?.columns.filter(c => c.selected).map(c => c.key)), params = new URLSearchParams(filters), store = params.get('store') || 'all';
  const storeName = store === 'all' ? kind === 'vehicles' || session!.user.allStores ? 'Tất cả cơ sở trong phạm vi được xem' : 'Cơ sở được phân công' : workspace.data?.stores.find(s => String(s.id) === store)?.name || `Cơ sở #${store}`;
  const text = { color: theme.text, fontSize: 16, lineHeight: 24 }, muted = { color: theme.muted, fontSize: 14, lineHeight: 22 };
  return <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: theme.background }}><Stack.Screen options={{ title: 'Xuất danh mục Excel' }} /><FlatList data={p?.columns || []} keyExtractor={c => c.key} contentContainerStyle={{ padding: 16, gap: 10, maxWidth: 760, width: '100%', alignSelf: 'center' }}
    ListHeaderComponent={<View style={{ gap: 14, marginBottom: 6 }}>
      <Card style={{ gap: 10 }}><Text accessibilityRole="header" style={{ ...text, fontSize: 23, fontWeight: '700' }}>{p?.title || 'Xuất danh mục'}</Text><Text style={text}>{storeName}</Text>{kind === 'contracts' && <Text style={text}>{contractWorkspace(params.get('scope') || '')?.title || 'Hợp đồng'}</Text>}{!!params.get('search') && <Text style={muted}>Tìm: {params.get('search')}</Text>}{!!params.get('status') && <Text style={muted}>Trạng thái: {statuses[params.get('status')!] || params.get('status')}</Text>}{!!params.get('position') && <Text style={muted}>Chức vụ: {params.get('position')}</Text>}{!!(params.get('from') || params.get('to')) && <Text style={muted}>Ngày bắt đầu thuê: {params.get('from') || 'Không giới hạn'} → {params.get('to') || 'Không giới hạn'}</Text>}{params.get('store_basis') === 'warehouse' && <Text style={muted}>Lọc theo cơ sở kho xe</Text>}<Text style={text}>Xuất toàn bộ kết quả khớp bộ lọc đã chọn, gồm cả các trang chưa tải. Dữ liệu được đối chiếu tại thời điểm tạo file.</Text><Text style={muted}>Excel dùng nhãn và định dạng web. Chọn các cột cần dùng trước khi lưu hoặc chia sẻ file.</Text></Card>
      {!!output.error && <InlineError message={output.error} />}{!!output.message && <Text accessibilityLiveRegion="polite" style={text}>{output.message}</Text>}
      {query.isPending && <StateView title="Đang tải các cột xuất" loading />}{query.isError && <StateView title="Chưa mở được xuất danh mục" message={query.error.message} retry={() => void query.refetch()} />}
      {p && <><Text accessibilityRole="header" style={{ ...text, fontWeight: '700' }}>Chọn cột · {selected.size}/{p.columns.length}</Text><View style={{ flexDirection: 'row', gap: 12 }}><View style={{ flex: 1 }}><Button secondary label="Chọn tất cả cột" disabled={output.busy} onPress={() => setSelection(new Set(p.columns.map(c => c.key)))} /></View><View style={{ flex: 1 }}><Button secondary label="Cột mặc định" disabled={output.busy} onPress={() => setSelection(null)} /></View></View></>}
    </View>}
    renderItem={({ item }) => <Pressable accessibilityRole="checkbox" accessibilityLabel={`Xuất cột ${item.label}`} accessibilityState={{ checked: selected.has(item.key), disabled: output.busy }} disabled={output.busy} onPress={() => setSelection(current => { const next = new Set(current || selected); if (next.has(item.key)) next.delete(item.key); else next.add(item.key); return next; })} style={{ minHeight: 52, padding: 14, borderWidth: 1, borderColor: selected.has(item.key) ? theme.primary : theme.border, borderRadius: 12, backgroundColor: theme.surface }}><Text style={{ ...text, color: selected.has(item.key) ? theme.primary : theme.text }}>{selected.has(item.key) ? 'Đã chọn · ' : ''}{item.label}</Text></Pressable>}
  />{p && <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: theme.border }}><Button label={output.stage === 'fetching' ? 'Đang tạo file từ toàn bộ kết quả' : output.stage === 'saving' ? 'Đang lưu / chia sẻ file' : `Tải Excel với ${selected.size} cột`} loading={output.busy} disabled={!selected.size || query.isFetching || query.isError} onPress={() => void output.run(signal => api!.catalogueExcel(kind, filters, [...selected], signal))} /></View>}</SafeAreaView>;
}
