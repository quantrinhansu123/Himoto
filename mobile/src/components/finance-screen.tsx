import { FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSession } from "@/providers/session";
import { dateTime, money, useTheme } from "@/theme";
import { Button, Card, InlineError, StateView, StatusBadge } from "./ui";

export function FinanceScreen({ id }: { id: string }) {
  const { session } = useSession();
  if (!/^[1-9]\d{0,14}$/.test(id) || !session?.user.permissions.includes("contracts.read") ||
      !session.user.permissions.some((p) => p === "finance.read" || p === "finance.write"))
    return <StateView title="Không mở được thu/chi" message="Kiểm tra liên kết và quyền tài chính của tài khoản." />;
  return <FinanceContent key={`${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}:${id}`} id={id} />;
}
function FinanceContent({ id }: { id: string }) {
  const theme = useTheme(), { api, session } = useSession();
  const query = useInfiniteQuery({
    queryKey: ["finance", session?.user.id, session?.user.storeId, session?.user.allStores, id, "history"],
    initialPageParam: 1,
    queryFn: ({ signal, pageParam }) => api!.finance(id, pageParam, signal), enabled: !!api, staleTime: 0,
    getNextPageParam: (last) => last.history.page < last.history.pages ? last.history.page + 1 : undefined,
  });
  if (query.isPending) return <StateView title="Đang tải thu/chi" loading />;
  if (!query.data) return <StateView title="Chưa tải được thu/chi" message={query.error?.message} retry={() => { void query.refetch(); }} />;
  const data = query.data.pages[0];
  const rows = [...new Map(query.data.pages.flatMap((part) => part.history.rows).map((row) => [row.id, row])).values()];
  const summary = (label: string, value: number | null) => <View key={label} style={{ gap: 4 }}>
    <Text style={{ color: theme.muted, fontSize: 14 }}>{label}</Text>
    <Text style={{ color: theme.text, fontSize: 20, fontWeight: "700" }}>{money(value)}</Text>
  </View>;
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
    <FlatList data={rows} keyExtractor={(item) => String(item.id)}
      contentContainerStyle={{ padding: 20, gap: 16, maxWidth: 760, width: "100%", alignSelf: "center" }}
      refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => { if (!query.isFetching) void query.refetch(); }}
      ListHeaderComponent={<View style={{ gap: 18 }}>
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 26, fontWeight: "800" }}>{data.code}</Text>
          <StatusBadge status={data.status} />
          <Text style={{ color: theme.muted, fontSize: 13 }}>Đối chiếu lúc {dateTime(data.observedAt)}</Text>
        </View>
        {query.isError && !query.isFetchNextPageError && <InlineError message="Chưa cập nhật được thu/chi. Số liệu đang hiển thị là lần tải gần nhất; kéo xuống để thử lại." />}
        <Card style={{ gap: 18 }}>
          {summary(data.billing ? "Tổng tiền đã phát sinh" : "Giá trị hợp đồng", data.totalAmount)}
          {summary("Tiền thuê đã ghi nhận", data.rentalPaid)}
          {summary("Tiền thuê còn thiếu", data.rentalRemaining)}
        </Card>
        <Card style={{ gap: 18 }}>
          {summary("Cọc đang giữ", data.depositHeld)}
          {summary("Cọc còn thiếu", data.depositRemaining)}
          {summary("Cọc đã hoàn", data.depositRefunded)}
          {data.rentalRefundable > 0 && summary("Tiền thuê được hoàn do trả sớm", data.rentalRefundable)}
        </Card>
        {data.billing && <Card style={{ gap: 14 }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 19, fontWeight: "700" }}>Lịch đóng tiền thuê sở hữu</Text>
          <Text style={{ color: theme.muted, fontSize: 15 }}>Đã đóng {data.billing.paidPeriods}/{data.billing.periodCount} kỳ</Text>
          {summary("Đến hạn cần đóng", data.billing.dueAmount)}
          {summary("Còn lại để sở hữu", data.billing.remainingToOwn)}
          {data.billing.nextDueAt && <Text style={{ color: theme.text, fontSize: 15 }}>Kỳ tiếp theo: {dateTime(data.billing.nextDueAt)}</Text>}
        </Card>}
        {(data.holdActive || data.completedFromHold) && <Text style={{ color: theme.warning, fontSize: 15, lineHeight: 23 }}>
          {data.completedFromHold ? "Hợp đồng đã hoàn thành sau bảo lưu. Chỉ xử lý các khoản hoàn còn hợp lệ." : "Hợp đồng đang bảo lưu. Không ghi thêm phí mới; chỉ xử lý các khoản còn hợp lệ."}
        </Text>}
        {data.canWrite && data.purposes.length > 0 && <Button label="Ghi nhận thu/chi" disabled={(query.isError && !query.isFetchNextPageError) || query.isFetching} onPress={() => router.push({ pathname: "/payment/[id]", params: { id } })} />}
        {!data.billing && <Button secondary label="Các kỳ gia hạn và tiền còn thu" onPress={() => router.push({ pathname: "/renewal-periods/[id]", params: { id } })} />}
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 21, fontWeight: "700" }}>Lịch sử thu/chi · {data.history.total} phiếu</Text>
      </View>}
      ListEmptyComponent={<Card><Text style={{ color: theme.muted, fontSize: 15 }}>Chưa có phiếu thu/chi trong lịch sử hợp đồng.</Text></Card>}
      renderItem={({ item }) => <Card style={{ gap: 10 }}>
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>Phiếu #{item.id} · {item.direction === "out" ? "Chi" : "Thu"}{item.deposit ? " cọc" : " tiền thuê / khoản khác"}</Text>
        <Text style={{ color: item.direction === "out" ? theme.danger : theme.success, fontSize: 23, fontWeight: "800" }}>{money(item.amount)}</Text>
        <Text style={{ color: theme.muted, fontSize: 14 }}>{dateTime(item.paidAt)} · {item.method}</Text>
        <Text selectable style={{ color: theme.text, fontSize: 15, lineHeight: 23 }}>{item.account || "Tài khoản chưa xác định"}</Text>
        {!!item.note && <Text selectable style={{ color: theme.text, fontSize: 15, lineHeight: 23 }}>{item.note}{item.noteTruncated ? "… (ghi chú dài đã rút gọn)" : ""}</Text>}
        {!!item.actor && <Text style={{ color: theme.muted, fontSize: 13 }}>Người ghi: {item.actor}</Text>}
        {item.renewalVersion !== null && <Text style={{ color: theme.muted, fontSize: 13 }}>Phiên bản gia hạn {item.renewalVersion}</Text>}
        {item.status === "cancelled" && <Text style={{ color: theme.danger, fontSize: 14, fontWeight: "700" }}>Phiếu đã hủy</Text>}
      </Card>}
      ListFooterComponent={<View style={{ gap: 12, paddingTop: 8 }}>
        {query.isFetchNextPageError && <InlineError message="Chưa tải được các phiếu tiếp theo. Các phiếu đã tải vẫn được giữ." />}
        <Text style={{ color: theme.muted, textAlign: "center" }}>Đã hiển thị {rows.length}/{data.history.total} phiếu</Text>
        {query.hasNextPage && <Button secondary label={query.isFetchNextPageError ? "Thử tải thêm phiếu" : "Tải thêm phiếu thu/chi"} loading={query.isFetchingNextPage} disabled={query.isFetching && !query.isFetchingNextPage} onPress={() => { if (!query.isFetching) void query.fetchNextPage({ cancelRefetch: false }); }} />}
      </View>}
    />
  </SafeAreaView>;
}
