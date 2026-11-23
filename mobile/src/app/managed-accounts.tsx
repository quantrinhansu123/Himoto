import { FilteredListExport } from '@/components/filtered-list-export';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Plus, Search, SlidersHorizontal, X } from 'lucide-react-native';
import { useSession } from '@/providers/session';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useTheme } from '@/theme';
import { Button, Card, PaginationBar, SkeletonList, StateView } from '@/components/ui';
import { ChoiceField } from '@/components/form-fields';
import { ManagedAccountSummary } from '@/components/managed-account-summary';
import { canManageAccounts } from '../../../shared/mobile-managed-accounts';

function List() {
  const { api, session } = useSession(), theme = useTheme();
  const [store, setStore] = useState(''), [search, setSearch] = useState(''), debounced = useDebouncedValue(search, 300), [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const allowed = canManageAccounts(session?.user);
  const params = new URLSearchParams({ page: String(page) });
  if (store) params.set('store_id', store);
  if (debounced.trim()) params.set('search', debounced.trim());
  const options = useQuery({ queryKey: ['managed-account-options', session!.user.id], queryFn: ({ signal }) => api!.managedAccountOptions(signal), enabled: allowed, retry: false });
  const query = useQuery({ queryKey: ['managed-accounts', session!.user.id, params.toString()], queryFn: ({ signal }) => api!.managedAccounts(params, signal), enabled: allowed, retry: false });
  if (!allowed) return <StateView title="Chỉ quản trị viên được quản lý tài khoản" />;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 11, maxWidth: 760, width: '100%', alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={query.isRefetching} tintColor={theme.primary} onRefresh={() => { void query.refetch(); }} />}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <Text style={{ color: theme.muted, fontSize: 13, flex: 1 }}>
            {query.data ? `${query.data.total} tài khoản · ${query.data.staffCount} cá nhân` : 'Gắn cơ sở, vai trò và quyền thao tác'}
          </Text>
          <Button size="sm" icon={<Plus size={14} color={theme.primaryText} />} label="Tạo TK" onPress={() => router.push({ pathname: '/managed-account-editor/[id]', params: { id: 'new', store_id: store } })} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, borderColor: theme.controlBorder, backgroundColor: theme.surface, paddingHorizontal: 11, minHeight: 44 }}>
            <Search size={18} color={theme.muted} accessible={false} />
            <TextInput
              accessibilityLabel="Tìm tài khoản"
              placeholder="Tìm tên đăng nhập, email, họ tên…"
              placeholderTextColor={theme.muted}
              value={search}
              onChangeText={v => { setSearch(v); setPage(1); }}
              autoCorrect={false}
              style={{ flex: 1, color: theme.text, fontSize: 14.5, paddingVertical: 8 }}
            />
            {!!search && <Pressable onPress={() => { setSearch(''); setPage(1); }} hitSlop={8}><X size={17} color={theme.muted} /></Pressable>}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Lọc cơ sở và xuất Excel"
            onPress={() => setFiltersOpen(v => !v)}
            style={{ minWidth: 44, minHeight: 44, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: filtersOpen || store ? theme.primary : theme.controlBorder, backgroundColor: filtersOpen || store ? theme.tint : theme.surface, alignItems: 'center', justifyContent: 'center' }}
          >
            <SlidersHorizontal size={18} color={filtersOpen || store ? theme.primary : theme.text} />
          </Pressable>
        </View>
        {filtersOpen && (
          <Card style={{ gap: 10 }}>
            <ChoiceField label="Cơ sở tài khoản" value={store} searchable choices={[{ value: '', label: 'Tất cả cơ sở' }, ...(options.data?.stores || []).map(s => ({ value: String(s.id), label: s.name }))]} onChange={v => { setStore(v); setPage(1); }} />
            <FilteredListExport kind="accounts" filters={params.toString()} disabled={query.isFetching || query.isError || !query.data?.total} />
          </Card>
        )}
        {query.isPending ? (
          <SkeletonList count={4} lines={3} />
        ) : query.isError ? (
          <StateView title="Chưa tải được tài khoản" message={query.error.message} retry={() => { void query.refetch(); }} />
        ) : (
          <>
            {query.data.rows.map(r => (
              <Pressable key={r.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/managed-account/[id]', params: { id: String(r.id) } })} style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}>
                <ManagedAccountSummary account={r} />
              </Pressable>
            ))}
            {!query.data.rows.length && <StateView title="Không có tài khoản phù hợp" />}
            <PaginationBar page={query.data.page} pages={query.data.pages} total={query.data.total} unit="tài khoản" disabled={query.isFetching} onChange={setPage} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function Route() {
  const { api, session } = useSession();
  if (!api || !session) return <StateView title="Chưa mở được quản lý tài khoản" />;
  return <List key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(',')}`} />;
}
