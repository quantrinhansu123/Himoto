import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, RefreshControl, ScrollView, Text, View } from "react-native";
import type { CatalogueKind, MobileRecord } from "@himoto/mobile-contract";
import {
  Button,
  Card,
  InlineError,
  StateView,
  StatusBadge,
} from "@/components/ui";
import { useSession } from "@/providers/session";
import { dateTime, money, useTheme } from "@/theme";
import { contextualStatusLabel } from "@/lib/catalogue-config";
import { ContractApprovalSummary } from '@/components/contract-approval-summary';
export default function RecordDetail() {
  const params = useLocalSearchParams<{ kind: string; id: string }>();
  const { api, session } = useSession();
  const cache = useQueryClient();
  const theme = useTheme();
  const [actionError, setActionError] = useState("");
  const valid =
    ["vehicles", "contracts", "customers"].includes(params.kind) &&
    /^[1-9]\d{0,14}$/.test(params.id);
  const allowed =
    valid && session?.user.permissions.includes(`${params.kind}.read`);
  const query = useQuery<MobileRecord>({
    queryKey: ["record", session?.user.id, params.kind, params.id],
    queryFn: ({ signal }) =>
      api!.record(params.kind as CatalogueKind, params.id, signal),
    placeholderData: () =>
      cache.getQueryData<MobileRecord>(["record", session?.user.id, params.kind, params.id]),
    staleTime: 30_000,
    gcTime: 300_000,
    enabled: !!api && !!allowed,
  });
  if (!allowed)
    return (
      <StateView
        title="Không mở được hồ sơ"
        message="Kiểm tra liên kết và quyền truy cập của tài khoản."
      />
    );
  if (query.isPending && !query.data) return <StateView title="Đang tải hồ sơ" loading />;
  if (query.isError && !query.data)
    return (
      <StateView
        title="Chưa tải được hồ sơ"
        message={query.error.message}
        retry={() => {
          void query.refetch();
        }}
      />
    );
  const row = query.data!;
  const phone = (row.phone || "").replace(/[\s().-]/g, "");
  const canCall = /^\+?[0-9]{8,15}$/.test(phone);
  async function callCustomer() {
    if (!canCall) return;
    setActionError("");
    try {
      await Linking.openURL(`tel:${phone}`);
    } catch {
      setActionError(
        "Thiết bị chưa mở được cuộc gọi. Anh/chị có thể chọn và sao chép số điện thoại bên dưới.",
      );
    }
  }
  const fields: [string, string][] = [
    ["Cơ sở", row.storeName || "Chưa xác định"],
  ];
  if (params.kind === "vehicles")
    fields.push(
      ["Tên xe", row.name],
      ["Biển số", row.license],
      ["Nhãn hiệu", row.brand],
      ["Màu xe", row.color],
      [
        "Số km",
        row.odometer === null ? "" : row.odometer.toLocaleString("vi-VN"),
      ],
    );
  if (params.kind === "contracts")
    fields.push(
      ["Khách hàng", row.name],
      ["Điện thoại", row.phone],
      ["Xe", row.vehicleName],
      ["Biển số", row.license],
      ["Bắt đầu thuê", dateTime(row.startsAt)],
      ["Kết thúc thuê", dateTime(row.endsAt)],
      ["Giá trị hợp đồng", money(row.totalAmount)],
      ["Tiền thuê đã ghi nhận", money(row.paidAmount)],
    );
  if (params.kind === "contracts" && row.monitoring) fields.push(
    ["Loại hợp đồng", row.monitoring.contractTypeName],
    ["Kỳ thanh toán tiếp theo", row.monitoring.nextDueAt ? dateTime(row.monitoring.nextDueAt) : ""],
    ["Khoản phải đóng theo kỳ", money(row.monitoring.dueAmount)],
    ["Đã thu vào TK công ty", money(row.monitoring.companyPaidAmount)],
  );
  if (params.kind === "customers") {
    fields.push(["Điện thoại", row.phone]);
    if (row.email) fields.push(["Email", row.email]);
    if (row.address) fields.push(["Địa chỉ", row.address]);
    if (row.contactChannel) fields.push(["Kênh liên hệ", row.contactChannel]);
    if (row.contactDetail)
      fields.push(["Thông tin liên hệ", row.contactDetail]);
    if (row.customerNote) fields.push(["Lưu ý hồ sơ", row.customerNote]);
  }
  return (
    <ScrollView
      contentContainerStyle={{
        padding: 24,
        gap: 20,
        width: "100%",
        maxWidth: 760,
        alignSelf: "center",
      }}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => {
            void query.refetch();
          }}
          tintColor={theme.primary}
        />
      }
    >
      <Stack.Screen
        options={{
          title:
            params.kind === "vehicles"
              ? "Chi tiết xe"
              : params.kind === "contracts"
                ? "Chi tiết hợp đồng"
                : "Hồ sơ khách hàng",
        }}
      />
      <View style={{ gap: 12 }}>
        <Text
          style={{
            color: theme.primary,
            fontSize: 12,
            fontWeight: "700",
            letterSpacing: 1,
          }}
        >
          {row.code}
        </Text>
        <Text
          accessibilityRole="header"
          style={{
            color: theme.text,
            fontSize: 30,
            fontWeight: "800",
            lineHeight: 38,
          }}
        >
          {params.kind === "vehicles"
            ? row.license || row.name
            : row.name || row.code}
        </Text>
        <StatusBadge
          status={row.status}
          label={contextualStatusLabel(
            params.kind as CatalogueKind,
            row.status,
          )}
        />
      </View>
      {query.isError && (
        <InlineError message="Chưa cập nhật được hồ sơ. Thông tin bên dưới là lần tải gần nhất; kéo xuống để thử lại." />
      )}
      {!!actionError && <InlineError message={actionError} />}

      {params.kind === "contracts" && ["renting", "overdue", "wait_payment"].includes(row.status) && (
        <Card style={{ gap: 12, borderWidth: 2, borderColor: theme.primary, backgroundColor: theme.surface }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: "800" }}>
              Thao tác chính hợp đồng
            </Text>
            <StatusBadge
              status={row.status}
              label={contextualStatusLabel("contracts", row.status)}
            />
          </View>
          <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 19 }}>
            Ưu tiên thao tác tại quầy: gia hạn, trả xe quyết toán hoặc đổi xe.
          </Text>
          <View style={{ gap: 10 }}>
            {session?.user.permissions.includes("contracts.renew") && (
              <Button
                label="Gia hạn hợp đồng"
                onPress={() => router.push({ pathname: "/renewal/[id]", params: { id: params.id } })}
              />
            )}
            {session?.user.permissions.includes("contracts.return") && (
              <Button
                secondary
                label="Trả xe và quyết toán"
                onPress={() => router.push({ pathname: "/return-editor/[id]", params: { id: params.id } })}
              />
            )}
            <View style={{ flexDirection: "row", gap: 10 }}>
              {session?.user.permissions.includes("contracts.return") && (
                <View style={{ flex: 1 }}>
                  <Button
                    secondary
                    label="Đổi xe"
                    onPress={() => router.push({ pathname: "/swap-editor/[id]", params: { id: params.id } })}
                  />
                </View>
              )}
              {session?.user.permissions.some((p) => p === "finance.read" || p === "finance.write") && (
                <View style={{ flex: 1 }}>
                  <Button
                    secondary
                    label="Thu / chi"
                    onPress={() => router.push({ pathname: "/finance/[id]", params: { id: params.id } })}
                  />
                </View>
              )}
            </View>
          </View>
        </Card>
      )}

      {params.kind === "contracts" && ["draft", "deposit_contract"].includes(row.status) && (
        <Card style={{ gap: 10, borderWidth: 1.5, borderColor: theme.primary }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 17, fontWeight: "700" }}>
            Xử lý hợp đồng nháp / Giữ chỗ
          </Text>
          {session?.user.permissions.includes("contracts.finalize") && (
            <Button
              label={
                row.status === "draft"
                  ? "Rà soát và phát hành"
                  : "Xác nhận giao xe giữ chỗ"
              }
              onPress={() =>
                router.push({
                  pathname: "/contract/[id]",
                  params: { id: params.id },
                })
              }
            />
          )}
          {row.status === "draft" && session?.user.permissions.includes("contracts.draft") && (
            <Button
              secondary
              label="Tiếp tục soạn hợp đồng"
              onPress={() =>
                router.push({
                  pathname: "/draft/[id]",
                  params: { id: params.id },
                })
              }
            />
          )}
        </Card>
      )}

      {params.kind === "contracts" && row.status === "bad_debt" && session?.user.permissions.includes("contracts.return") && (
        <Button label="Thu hồi xe nợ xấu" onPress={() => router.push({ pathname: "/recovery-editor/[id]", params: { id: params.id } })} />
      )}

      {params.kind === "vehicles" && (
        <View style={{ gap: 10 }}>
          <Button label="Hồ sơ xe đầy đủ" onPress={() => router.push({ pathname: "/vehicle/[id]", params: { id: params.id } })} />
          {session?.user.permissions.includes("vehicles.read") && (
            <Button secondary label="Điều chuyển và nhận xe" onPress={() => router.push({ pathname: "/vehicle-transfer-editor/[id]", params: { id: params.id } })} />
          )}
          {session?.user.permissions.includes("vehicles.write") && (
            <Button secondary label="Đổi trạng thái / tạo nháp từ kho" onPress={() => router.push({ pathname: "/vehicle-status-editor/[id]", params: { id: params.id } })} />
          )}
        </View>
      )}

      {params.kind === "customers" && session?.user.permissions.includes("customers.write") && (
        <Button
          label="Sửa hồ sơ khách hàng"
          onPress={() =>
            router.push({
              pathname: "/customer/[id]",
              params: { id: params.id },
            })
          }
        />
      )}

      {canCall && (
        <Button
          secondary={
            params.kind === "contracts" &&
            ["draft", "deposit_contract"].includes(row.status) &&
            session?.user.permissions.includes("contracts.finalize")
          }
          label="Gọi khách hàng"
          onPress={() => {
            void callCustomer();
          }}
        />
      )}

      {params.kind === "contracts" && (
        <Card style={{ gap: 12 }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 17, fontWeight: "700" }}>
            Tiện ích & Tra cứu
          </Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button secondary label="Xem giấy / in" onPress={() => router.push({ pathname: "/print/[kind]/[id]", params: { kind: "contracts", id: params.id } })} />
            </View>
            {row.status !== "cancelled" && (
              <View style={{ flex: 1 }}>
                <Button secondary label="Mã QR CK" onPress={() => router.push({ pathname: "/contract-qr/[id]", params: { id: params.id } })} />
              </View>
            )}
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button secondary label="Phiếu thu / chi" onPress={() => router.push({ pathname: "/contract-history/[id]", params: { id: params.id } })} />
            </View>
            <View style={{ flex: 1 }}>
              <Button secondary label="Telegram" onPress={() => router.push({ pathname: "/contract-telegram/[id]", params: { id: params.id } })} />
            </View>
          </View>
          {session?.user.permissions.includes("contracts.renew") && (
            <Button secondary label="Xem bill gia hạn đã lưu" onPress={() => router.push({ pathname: "/renewal-bill/[id]", params: { id: params.id } })} />
          )}
          <Button secondary label="Pin / sạc của hợp đồng" onPress={() => router.push({ pathname: "/battery-contracts", params: { source: params.id } })} />
          {row.reminderEligible && session?.user.permissions.some(p => p === "contracts.draft" || p === "finance.write") && (
            <Button secondary label="Soạn nhắc nợ Zalo" onPress={() => router.push({ pathname: "/reminder-editor/[id]", params: { id: params.id } })} />
          )}
          <ContractApprovalSummary id={params.id} />
        </Card>
      )}

      {(params.kind === "contracts" || params.kind === "vehicles" || params.kind === "customers") && (
        <Button
          secondary
          label={params.kind === "customers" ? "Giấy tờ và ảnh khách hàng" : "Ảnh và hồ sơ nghiệp vụ"}
          onPress={() =>
            router.push({
              pathname: "/record-media/[entity]/[id]",
              params: { entity: params.kind, id: params.id },
            })
          }
        />
      )}

      {params.kind === "contracts" && (
        <Card style={{ gap: 14 }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>
            Hồ sơ và điều chỉnh
          </Text>
          {row.status === "draft" && session?.user.permissions.includes("contracts.draft") && (
            <Button secondary label="Xóa nháp trên máy chủ" onPress={() => router.push({ pathname: "/draft-delete/[id]", params: { id: params.id } })} />
          )}
          {row.status !== "draft" && (session?.user.role === "admin" || session?.user.permissions.includes("contracts.draft")) && (
            <>
              <Button secondary label="Sửa đầy đủ hợp đồng" onPress={() => router.push({ pathname: "/contract-edit/[id]", params: { id: params.id } })} />
              {row.status !== "cancelled" && !["ownership", "ownership_cd"].includes(row.monitoring?.rentalType || "") && (
                <Button secondary label="Sửa tiền / ngày thuê" onPress={() => router.push({ pathname: "/rental-terms/[id]", params: { id: params.id } })} />
              )}
            </>
          )}
          {!["draft", "cancelled"].includes(row.status) && session?.user.permissions.some(p => p === "contracts.draft" || p === "finance.write") && (
            <Button secondary label="Sửa cọc / khoản đã thu" onPress={() => router.push({ pathname: "/contract-correction/[kind]/[id]", params: { kind: "receipts", id: params.id } })} />
          )}
          {!["draft", "cancelled"].includes(row.status) && session?.user.permissions.some(p => p === "contracts.renew" || p === "finance.write") && (
            <Button secondary label="Sửa ngày / tiền thực thu gia hạn" onPress={() => router.push({ pathname: "/contract-correction/[kind]/[id]", params: { kind: "renewal", id: params.id } })} />
          )}
          {["ownership", "ownership_cd"].includes(row.monitoring?.rentalType || "") && (
            <Button secondary label="Thời hạn / mức đóng thuê sở hữu" onPress={() => router.push({ pathname: "/ownership-terms/[id]", params: { id: params.id } })} />
          )}
          {row.status !== "draft" && (
            <Button secondary label="Tình trạng xe / nợ / bảo lưu" onPress={() => router.push({ pathname: "/contract-lifecycle/[id]", params: { id: params.id } })} />
          )}
          {row.status !== "draft" && session?.user.permissions.includes("contracts.return") && (
            <Button secondary label="Sửa hồ sơ / quyết toán xe đã trả" onPress={() => router.push({ pathname: "/return-correction/[id]", params: { id: params.id } })} />
          )}
        </Card>
      )}
      <Card style={{ gap: 20 }}>
        {fields.map(([label, value]) => (
          <View key={label} style={{ gap: 6 }}>
            <Text style={{ color: theme.muted, fontSize: 13 }}>{label}</Text>
            <Text
              selectable
              style={{ color: theme.text, fontSize: 17, lineHeight: 25 }}
            >
              {value || "Chưa có dữ liệu"}
            </Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}
