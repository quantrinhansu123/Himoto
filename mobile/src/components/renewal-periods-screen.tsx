import { FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSession } from "@/providers/session";
import { dateTime, money, useTheme } from "@/theme";
import { Button, Card, InlineError, StateView } from "./ui";

export function RenewalPeriodsScreen({ id }: { id: string }) {
  const { session } = useSession();
  if (!/^[1-9]\d{0,14}$/.test(id) || !session?.user.permissions.includes("contracts.read") ||
    !session.user.permissions.some(value => value === "finance.read" || value === "finance.write"))
    return <StateView title="Không mở được các kỳ gia hạn" message="Kiểm tra liên kết và quyền tài chính của tài khoản." />;
  return <Periods key={`${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}:${id}`} id={id} />;
}
function Periods({ id }: { id: string }) {
  const { api, session } = useSession(), theme = useTheme();
  const query = useInfiniteQuery({ queryKey: ["renewal-periods", session?.user.id, session?.user.storeId, session?.user.allStores, id],
    initialPageParam: 1, queryFn: ({ pageParam, signal }) => api!.renewalPeriods(id, pageParam, signal), enabled: !!api, staleTime: 0,
    getNextPageParam: last => last.page < last.pages ? last.page + 1 : undefined });
  if (query.isPending) return <StateView title="Đang tải các kỳ gia hạn" loading />;
  if (!query.data) return <StateView title="Chưa tải được các kỳ gia hạn" message={query.error?.message} retry={() => { void query.refetch(); }} />;
  const data = query.data.pages[0], rows = [...new Map(query.data.pages.flatMap(page => page.rows).map(row => [row.version, row])).values()];
  const stale = query.isError && !query.isFetchNextPageError;
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
    <FlatList data={rows} keyExtractor={row => String(row.version)} contentContainerStyle={{ padding: 20, gap: 16, maxWidth: 760, width: "100%", alignSelf: "center" }}
      refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => { if (!query.isFetching) void query.refetch(); }}
      ListHeaderComponent={<View style={{ gap: 16 }}>
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 26, fontWeight: "800" }}>{data.code}</Text>
        <Text style={{ color: theme.muted, fontSize: 16, lineHeight: 25 }}>Các kỳ đã gia hạn, mới nhất trước. Thu tiếp phần phí còn thiếu của đúng kỳ; phí và ngày hẹn trả giữ nguyên.</Text>
        {!data.available && <InlineError message={data.blockedReason || "Hợp đồng hiện chưa thể thu theo kỳ."} />}
        {stale && <InlineError message="Chưa cập nhật được các kỳ gia hạn. Tải lại danh sách trước khi thu tiền." />}
        {!data.canWrite && <Text style={{ color: theme.muted, fontSize: 15 }}>Tài khoản có quyền xem; cần quyền ghi thu/chi để nhận tiền.</Text>}
      </View>}
      ListEmptyComponent={<Card><Text style={{ color: theme.muted, fontSize: 16, lineHeight: 25 }}>Chưa có kỳ gia hạn đã lưu. Mở Gia hạn ở hồ sơ hợp đồng để lập kỳ mới.</Text></Card>}
      renderItem={({ item }) => <Card style={{ gap: 12 }}>
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 20, fontWeight: "700" }}>Kỳ gia hạn #{item.version}</Text>
        <Text style={{ color: theme.text, fontSize: 17 }}>{item.license} · {item.vehicleName}</Text>
        <Text style={{ color: theme.muted, fontSize: 15, lineHeight: 24 }}>{dateTime(item.beforeReturnAt ?? item.createdAt ?? "")} → {dateTime(item.returnAt)}</Text>
        <Text style={{ color: theme.text, fontSize: 16 }}>Phí: {money(item.amount)} · Đã thu: {money(item.collected)}</Text>
        <Text style={{ color: item.remaining > 0 ? theme.warning : theme.success, fontSize: 20, fontWeight: "700" }}>{item.remaining > 0 ? `Còn thu: ${money(item.remaining)}` : "Đã thu đủ phí kỳ"}</Text>
        {data.canWrite && item.remaining > 0 && <Button label={`Thu cho kỳ gia hạn #${item.version}`} disabled={!data.available || stale || query.isFetching}
          onPress={() => router.push({ pathname: "/renewal-payment/[id]", params: { id, version: String(item.version) } })} />}
      </Card>}
      ListFooterComponent={<View style={{ gap: 12, paddingTop: 8 }}>
        {query.isFetchNextPageError && <InlineError message="Chưa tải được các kỳ tiếp theo. Các kỳ đã tải vẫn được giữ." />}
        <Text style={{ color: theme.muted, textAlign: "center" }}>Đã hiển thị {rows.length}/{data.total} kỳ</Text>
        {query.hasNextPage && <Button secondary label={query.isFetchNextPageError ? "Thử tải thêm kỳ" : "Tải thêm kỳ gia hạn"} loading={query.isFetchingNextPage} disabled={query.isFetching && !query.isFetchingNextPage}
          onPress={() => { if (!query.isFetching) void query.fetchNextPage({ cancelRefetch: false }); }} />}
      </View>} />
  </SafeAreaView>;
}
