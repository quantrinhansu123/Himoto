import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import type { MobileDirectoryKind } from "../../../shared/mobile-directory";
import { STAFF_PROFILE_STATUSES } from "../../../shared/mobile-staff";
import { STAFF_POSITIONS } from "../../../shared/staff-positions";
import { useSession } from "@/providers/session";
import { useWorkspace } from "@/hooks/use-workspace";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useTheme } from "@/theme";
import { Button, Card, InlineError, StateView, StatusBadge } from "./ui";
import { ChoiceField, FormField } from "./form-fields";

export function DirectoryScreen({ kind, initialStore }: { kind: MobileDirectoryKind; initialStore?: string }) {
  const { api, session } = useSession(), theme = useTheme(), workspace = useWorkspace();
  const [input, setInput] = useState(""), [status, setStatus] = useState(""), [store, setStore] = useState(initialStore || (session!.user.allStores ? "all" : String(session!.user.storeId || "all")));
  const [position, setPosition] = useState(""), search = useDebouncedValue(input);
  const allowed = session!.user.permissions.includes(kind === "staff" ? "hr.read" : "contracts.read");
  const query = useInfiniteQuery({ queryKey: ["directory", kind, session!.user.id, search, status, store, position], initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => api!.directory(kind, new URLSearchParams({ page: String(pageParam), size: "20", search, status, ...(kind === "staff" ? { store, position } : {}) }).toString(), signal),
    getNextPageParam: page => page.page < page.pages ? page.page + 1 : undefined, enabled: allowed });
  if (!allowed) return <StateView title="Không có quyền xem danh bạ" />;
  const rows = [...new Map(query.data?.pages.flatMap(page => page.rows).map(row => [row.id, row])).values()];
  const title = kind === "staff" ? "Nhân sự" : "Cơ sở";
  const stores = (workspace.data?.stores || []).filter(item => session!.user.allStores || item.id === session!.user.storeId);
  return <>
    <FlatList data={rows} keyExtractor={row => String(row.id)} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 14, maxWidth: 760, width: "100%", alignSelf: "center" }}
      refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => { void query.refetch(); }} tintColor={theme.primary} />}
      ListHeaderComponent={<View style={{ gap: 14 }}>
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 26, fontWeight: "800" }}>{title}</Text>
        {kind === "stores" && session!.user.permissions.includes("settings.write") && <Button secondary label="Thêm cơ sở" onPress={() => router.push({ pathname: "/store-editor/[id]", params: { id: "new" } })} />}
        {kind === "staff" && session!.user.permissions.includes("hr.write") && <Button secondary label="Thêm nhân sự" onPress={() => router.push({ pathname: "/staff-editor/[id]", params: { id: "new", store } })} />}
        {kind==='staff'&&<Button secondary label="Sơ đồ nhân sự" onPress={()=>router.push('/staff-organization')}/>}
        {session!.user.permissions.includes(kind==='staff'?'hr.write':'settings.write')&&<Button secondary label="Chọn nhiều hồ sơ để xóa" onPress={()=>router.push({pathname:'/bulk-delete/[kind]',params:{kind,filters:new URLSearchParams({search,status,...(kind==='staff'?{store,position}:{})}).toString()}})}/>}
        <FormField label={kind === "staff" ? "Tìm tên, mã nhân sự, điện thoại" : "Tìm tên, mã, địa chỉ cơ sở"} value={input} onChangeText={setInput} maxLength={120} />
        <ChoiceField label="Trạng thái" value={status} choices={[{ value: "", label: "Tất cả trạng thái" }, ...(kind === "staff" ? STAFF_PROFILE_STATUSES : [{ value: "active", label: "Hoạt động" }, { value: "inactive", label: "Tạm ngừng" }])]} onChange={setStatus} />
        {kind === "staff" && <ChoiceField label="Lọc chức vụ nhân sự" value={position} choices={[{ value: "", label: "Tất cả chức vụ" }, ...[...new Set([...STAFF_POSITIONS, ...rows.map(row => row.position)].filter(Boolean))].map(value => ({ value, label: value }))]} onChange={setPosition} searchable />}
        {kind === "staff" && <ChoiceField label="Cơ sở nhân sự" value={store} choices={[...(session!.user.allStores ? [{ value: "all", label: "Tất cả cơ sở" }] : []), ...stores.map(item => ({ value: String(item.id), label: item.name }))]} onChange={setStore} searchable />}
        <Text style={{ color: theme.muted }}>{query.data ? `${query.data.pages[0].total} hồ sơ` : "Đang tải…"}</Text>
        {query.isError && rows.length > 0 && <><InlineError message={query.error.message} /><Button secondary label="Tải lại danh bạ" onPress={() => { void query.refetch(); }} /></>}
      </View>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Xem ${item.name}`} onPress={() => router.push({ pathname: kind === "stores" ? "/store/[id]" : "/staff/[id]", params: { id: String(item.id) } })} style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}><Card style={{ gap: 8 }}><Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>{item.name}</Text><Text style={{ color: theme.muted }}>{[item.code, item.position, item.storeName].filter(Boolean).join(" · ")}</Text>{!!item.phone && <Text style={{ color: theme.text }}>{item.phone}</Text>}<StatusBadge status={item.status} label={kind === "staff" ? STAFF_PROFILE_STATUSES.find(status => status.value === item.status)?.label : undefined} /></Card></Pressable>}
      onEndReachedThreshold={0.4} onEndReached={() => { if (query.hasNextPage && !query.isFetching && !query.isFetchNextPageError) void query.fetchNextPage(); }}
      ListEmptyComponent={query.isPending ? <StateView title="Đang tải danh bạ" loading /> : query.isError ? <StateView title="Chưa tải được danh bạ" message={query.error.message} retry={() => { void query.refetch(); }} /> : <StateView title="Không có kết quả" message="Thử từ khóa hoặc bộ lọc khác." />}
      ListFooterComponent={query.isFetchingNextPage ? <StateView title="Đang tải tiếp" loading /> : query.isFetchNextPageError ? <Button secondary label="Tải tiếp danh bạ" onPress={() => { void query.fetchNextPage(); }} /> : undefined}
    />
  </>;
}
