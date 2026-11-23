import { FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  MessageCircle,
  Pencil,
  PlusCircle,
  Wallet,
} from "lucide-react-native";
import { useSession } from "@/providers/session";
import { dateTime, money, useTheme } from "@/theme";
import {
  Button,
  Card,
  InfoBanner,
  InlineError,
  KeyValueRow,
  SectionHeader,
  SkeletonList,
  StateView,
  StatusBadge,
} from "./ui";

export function FinanceScreen({ id }: { id: string }) {
  const { session } = useSession();
  if (
    !/^[1-9]\d{0,14}$/.test(id) ||
    !session?.user.permissions.includes("contracts.read") ||
    !session.user.permissions.some(
      (p) => p === "finance.read" || p === "finance.write",
    )
  )
    return (
      <StateView
        title="Không mở được thu/chi"
        message="Kiểm tra liên kết và quyền tài chính của tài khoản."
      />
    );
  return (
    <FinanceContent
      key={`${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}:${id}`}
      id={id}
    />
  );
}

function FinanceContent({ id }: { id: string }) {
  const theme = useTheme(),
    { api, session } = useSession();
  const query = useInfiniteQuery({
    queryKey: [
      "finance",
      session?.user.id,
      session?.user.storeId,
      session?.user.allStores,
      id,
      "history",
    ],
    initialPageParam: 1,
    queryFn: ({ signal, pageParam }) => api!.finance(id, pageParam, signal),
    enabled: !!api,
    staleTime: 0,
    getNextPageParam: (last) =>
      last.history.page < last.history.pages
        ? last.history.page + 1
        : undefined,
  });

  if (query.isPending)
    return (
      <SafeAreaView
        edges={["left", "right", "bottom"]}
        style={{ flex: 1, backgroundColor: theme.background, padding: 16 }}
      >
        <View
          style={{
            maxWidth: 760,
            width: "100%",
            alignSelf: "center",
          }}
        >
          <SkeletonList count={4} lines={3} />
        </View>
      </SafeAreaView>
    );

  if (!query.data)
    return (
      <SafeAreaView
        edges={["left", "right", "bottom"]}
        style={{ flex: 1, backgroundColor: theme.background }}
      >
        <StateView
          title="Chưa tải được thu/chi"
          message={query.error?.message}
          retry={() => {
            void query.refetch();
          }}
        />
      </SafeAreaView>
    );

  const data = query.data.pages[0];
  const rows = [
    ...new Map(
      query.data.pages
        .flatMap((part) => part.history.rows)
        .map((row) => [row.id, row]),
    ).values(),
  ];
  const approvedInTotal = rows.reduce(
    (sum, r) => sum + (r.status !== "cancelled" && r.direction !== "out" ? r.amount : 0),
    0,
  );
  const approvedOutTotal = rows.reduce(
    (sum, r) => sum + (r.status !== "cancelled" && r.direction === "out" ? r.amount : 0),
    0,
  );
  const perms = session?.user.permissions ?? [];
  const canSettle = perms.includes("contracts.settle");
  const canCorrectReceipts =
    perms.includes("finance.write") || perms.includes("contracts.draft");
  const canCorrectRenewal =
    perms.includes("finance.write") || perms.includes("contracts.renew");
  const canOpenCashbook =
    perms.includes("finance.write") || perms.includes("finance.read");

  return (
    <SafeAreaView
      edges={["left", "right", "bottom"]}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 32,
          gap: 12,
          maxWidth: 760,
          width: "100%",
          alignSelf: "center",
        }}
        refreshing={query.isRefetching && !query.isFetchingNextPage}
        onRefresh={() => {
          if (!query.isFetching) void query.refetch();
        }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  accessibilityRole="header"
                  style={{ color: theme.text, fontSize: 21, fontWeight: "800" }}
                >
                  {data.code}
                </Text>
                <Text style={{ color: theme.muted, fontSize: 12.5 }}>
                  Đối chiếu lúc {dateTime(data.observedAt)}
                </Text>
              </View>
              <StatusBadge status={data.status} />
            </View>

            {query.isError && !query.isFetchNextPageError && (
              <InlineError message="Chưa cập nhật được thu/chi. Số liệu đang hiển thị là lần tải gần nhất; kéo xuống để thử lại." />
            )}

            {(data.holdActive || data.completedFromHold) && (
              <InfoBanner
                tone="warning"
                message={
                  data.completedFromHold
                    ? "Hợp đồng đã hoàn thành sau bảo lưu. Chỉ xử lý các khoản hoàn còn hợp lệ."
                    : "Hợp đồng đang bảo lưu. Không ghi thêm phí mới; chỉ xử lý các khoản còn hợp lệ."
                }
              />
            )}

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Card style={{ flex: 1, gap: 4, padding: 13 }}>
                <Text style={{ color: theme.muted, fontSize: 12.5 }}>
                  {data.billing ? "Tổng phát sinh" : "Giá trị hợp đồng"}
                </Text>
                <Text
                  style={{ color: theme.text, fontSize: 17, fontWeight: "800" }}
                >
                  {money(data.totalAmount)}
                </Text>
              </Card>
              <Card style={{ flex: 1, gap: 4, padding: 13 }}>
                <Text style={{ color: theme.muted, fontSize: 12.5 }}>
                  Tiền thuê còn thiếu
                </Text>
                <Text
                  style={{
                    color:
                      (data.rentalRemaining ?? 0) > 0
                        ? theme.danger
                        : theme.success,
                    fontSize: 17,
                    fontWeight: "800",
                  }}
                >
                  {money(data.rentalRemaining)}
                </Text>
              </Card>
            </View>

            <Card style={{ gap: 6, padding: 14 }}>
              <KeyValueRow
                label="Tiền thuê đã ghi nhận"
                value={money(data.rentalPaid)}
                valueColor={theme.success}
                strong
              />
              <KeyValueRow
                label="Cọc đang giữ"
                value={money(data.depositHeld)}
                strong
              />
              <KeyValueRow
                label="Cọc còn thiếu"
                value={money(data.depositRemaining)}
                valueColor={
                  data.depositRemaining > 0 ? theme.warning : theme.muted
                }
              />
              <KeyValueRow
                label="Cọc đã hoàn"
                value={money(data.depositRefunded)}
              />
              {data.rentalRefundable > 0 && (
                <KeyValueRow
                  label="Tiền thuê được hoàn do trả sớm"
                  value={money(data.rentalRefundable)}
                  valueColor={theme.info}
                  strong
                />
              )}
            </Card>

            {data.billing && (
              <Card style={{ gap: 6, padding: 14 }}>
                <Text
                  accessibilityRole="header"
                  style={{
                    color: theme.text,
                    fontSize: 15.5,
                    fontWeight: "700",
                    marginBottom: 2,
                  }}
                >
                  Lịch đóng tiền thuê sở hữu
                </Text>
                <KeyValueRow
                  label="Tiến độ đóng kỳ"
                  value={`${data.billing.paidPeriods}/${data.billing.periodCount} kỳ`}
                />
                <KeyValueRow
                  label="Đến hạn cần đóng"
                  value={money(data.billing.dueAmount)}
                  valueColor={
                    (data.billing.dueAmount ?? 0) > 0
                      ? theme.danger
                      : theme.text
                  }
                  strong
                />
                <KeyValueRow
                  label="Còn lại để sở hữu"
                  value={money(data.billing.remainingToOwn)}
                  strong
                />
                {data.billing.nextDueAt && (
                  <KeyValueRow
                    label="Kỳ tiếp theo"
                    value={dateTime(data.billing.nextDueAt)}
                  />
                )}
              </Card>
            )}

            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {data.canWrite && data.purposes.length > 0 && (
                  <Button
                    size="sm"
                    equalWidth
                    icon={<PlusCircle size={15} color={theme.primaryText} />}
                    label="Ghi nhận thu/chi"
                    disabled={
                      (query.isError && !query.isFetchNextPageError) ||
                      query.isFetching
                    }
                    onPress={() =>
                      router.push({ pathname: "/payment/[id]", params: { id } })
                    }
                  />
                )}
                {canSettle && (
                  <Button
                    size="sm"
                    secondary
                    equalWidth
                    icon={<CheckCircle2 size={15} color={theme.text} />}
                    label="Thanh toán & Đóng HĐ"
                    onPress={() =>
                      router.push({
                        pathname: "/contract-operation/[action]/[id]",
                        params: { action: "payment_settlement", id },
                      })
                    }
                  />
                )}
              </View>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {!data.billing && (
                  <Button
                    size="sm"
                    secondary
                    icon={<CalendarClock size={14} color={theme.text} />}
                    label="Các kỳ gia hạn"
                    onPress={() =>
                      router.push({
                        pathname: "/renewal-periods/[id]",
                        params: { id },
                      })
                    }
                  />
                )}
                {canCorrectReceipts && (
                  <Button
                    size="sm"
                    secondary
                    icon={<Pencil size={14} color={theme.text} />}
                    label="Sửa cọc / khoản đã thu"
                    onPress={() =>
                      router.push({
                        pathname: "/contract-correction/[kind]/[id]",
                        params: { kind: "receipts", id },
                      })
                    }
                  />
                )}
                {canCorrectRenewal && (
                  <Button
                    size="sm"
                    secondary
                    icon={<Pencil size={14} color={theme.text} />}
                    label="Sửa ngày / tiền gia hạn"
                    onPress={() =>
                      router.push({
                        pathname: "/contract-correction/[kind]/[id]",
                        params: { kind: "renewal", id },
                      })
                    }
                  />
                )}
                <Button
                  size="sm"
                  secondary
                  icon={<MessageCircle size={14} color={theme.text} />}
                  label="Gửi Telegram"
                  onPress={() =>
                    router.push({
                      pathname: "/contract-telegram/[id]",
                      params: { id },
                    })
                  }
                />
                {canOpenCashbook && (
                  <Button
                    size="sm"
                    secondary
                    icon={<Wallet size={14} color={theme.text} />}
                    label="Mở Sổ quỹ"
                    onPress={() => router.push("/cashbook")}
                  />
                )}
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Card style={{ flex: 1, gap: 3, padding: 12 }}>
                <Text style={{ color: theme.muted, fontSize: 12 }}>
                  Tổng thu đã duyệt ({rows.length} phiếu)
                </Text>
                <Text
                  style={{
                    color: theme.success,
                    fontSize: 16,
                    fontWeight: "800",
                  }}
                >
                  +{money(approvedInTotal)}
                </Text>
              </Card>
              <Card style={{ flex: 1, gap: 3, padding: 12 }}>
                <Text style={{ color: theme.muted, fontSize: 12 }}>
                  Tổng chi đã duyệt ({rows.length} phiếu)
                </Text>
                <Text
                  style={{
                    color: theme.danger,
                    fontSize: 16,
                    fontWeight: "800",
                  }}
                >
                  -{money(approvedOutTotal)}
                </Text>
              </Card>
            </View>

            <SectionHeader
              title="Lịch sử thu/chi"
              subtitle={`${data.history.total} phiếu đã ghi nhận`}
            />
          </View>
        }
        ListEmptyComponent={
          <Card>
            <Text style={{ color: theme.muted, fontSize: 14 }}>
              Chưa có phiếu thu/chi trong lịch sử hợp đồng.
            </Text>
          </Card>
        }
        renderItem={({ item }) => {
          const isOut = item.direction === "out";
          const cancelled = item.status === "cancelled";
          return (
            <Card style={{ gap: 8, padding: 14 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Text
                  style={{
                    color: theme.text,
                    fontSize: 15,
                    fontWeight: "700",
                    flex: 1,
                  }}
                >
                  Phiếu #{item.id} · {isOut ? "Chi" : "Thu"}
                  {item.deposit ? " cọc" : " tiền thuê / khoản khác"}
                </Text>
                <StatusBadge
                  status={
                    cancelled ? "cancelled" : isOut ? "expense" : "income"
                  }
                  label={
                    cancelled ? "Đã hủy" : isOut ? "Phiếu chi" : "Phiếu thu"
                  }
                />
              </View>
              <Text
                style={{
                  color: cancelled
                    ? theme.muted
                    : isOut
                      ? theme.danger
                      : theme.success,
                  fontSize: 19,
                  fontWeight: "800",
                  textDecorationLine: cancelled ? "line-through" : "none",
                }}
              >
                {isOut ? "-" : "+"}
                {money(item.amount)}
              </Text>
              <View style={{ gap: 2 }}>
                <KeyValueRow label="Thời gian" value={dateTime(item.paidAt)} />
                <KeyValueRow label="Hình thức" value={item.method} />
                <KeyValueRow
                  label="Tài khoản"
                  value={item.account || "Chưa xác định"}
                  selectable
                />
                {!!item.actor && (
                  <KeyValueRow label="Người ghi" value={item.actor} />
                )}
                {item.renewalVersion !== null && (
                  <KeyValueRow
                    label="Kỳ gia hạn"
                    value={`Phiên bản #${item.renewalVersion}`}
                  />
                )}
              </View>
              {!!item.note && (
                <Text
                  selectable
                  style={{
                    color: theme.muted,
                    fontSize: 13.5,
                    lineHeight: 19,
                    borderTopWidth: 1,
                    borderTopColor: theme.border,
                    paddingTop: 6,
                  }}
                >
                  {item.note}
                  {item.noteTruncated ? "… (ghi chú dài đã rút gọn)" : ""}
                </Text>
              )}
            </Card>
          );
        }}
        ListFooterComponent={
          <View style={{ gap: 10, paddingTop: 6 }}>
            {query.isFetchNextPageError && (
              <InlineError message="Chưa tải được các phiếu tiếp theo. Các phiếu đã tải vẫn được giữ." />
            )}
            <Text
              style={{
                color: theme.muted,
                fontSize: 12.5,
                textAlign: "center",
              }}
            >
              Đã hiển thị {rows.length}/{data.history.total} phiếu
            </Text>
            {query.hasNextPage && (
              <Button
                size="sm"
                secondary
                label={
                  query.isFetchNextPageError
                    ? "Thử tải thêm phiếu"
                    : "Tải thêm phiếu thu/chi"
                }
                loading={query.isFetchingNextPage}
                disabled={query.isFetching && !query.isFetchingNextPage}
                onPress={() => {
                  if (!query.isFetching)
                    void query.fetchNextPage({ cancelRefetch: false });
                }}
              />
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
}
