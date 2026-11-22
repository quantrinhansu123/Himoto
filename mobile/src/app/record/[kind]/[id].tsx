import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Building2,
  FilePenLine,
  FileText,
  Phone,
  ShieldBan,
  ShieldCheck,
  Trash2,
} from "lucide-react-native";
import type { CatalogueKind, MobileRecord } from "@himoto/mobile-contract";
import {
  Button,
  Card,
  InfoBanner,
  InlineError,
  KeyValueRow,
  SegmentedBar,
  StateView,
  StatusBadge,
} from "@/components/ui";
import { ConfirmEdit } from "@/components/editor-sheet";
import { useSession } from "@/providers/session";
import { dateTime, money, useTheme } from "@/theme";
import { contextualStatusLabel } from "@/lib/catalogue-config";
import { recordPreviewKey } from "@/lib/record-preview";
import { ContractDetailView } from "@/components/contract-detail-view";

function CustomerDetailScreen({
  id,
  fallback,
  isFallbackRefreshing,
  onRefreshFallback,
}: {
  id: string;
  fallback: MobileRecord;
  isFallbackRefreshing: boolean;
  onRefreshFallback: () => void;
}) {
  const { api, session } = useSession();
  const cache = useQueryClient();
  const theme = useTheme();
  const [tab, setTab] = useState<"info" | "contracts" | "payments">("info");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [blacklistConfirm, setBlacklistConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const canWrite = Boolean(session?.user.permissions.includes("customers.write"));
  const canDelete = Boolean(session?.user.permissions.includes("settings.write"));
  const canReadContracts = Boolean(session?.user.permissions.includes("contracts.read"));

  const detailQuery = useQuery({
    queryKey: ["customer-detail", session?.user.id, id],
    queryFn: ({ signal }) => api!.customerDetail(id, signal),
    enabled: !!api,
    staleTime: 15_000,
    retry: false,
  });

  const contractsQuery = useQuery({
    queryKey: ["customer-contracts-inline", session?.user.id, id],
    queryFn: ({ signal }) =>
      api!.catalogue(
        "contracts",
        new URLSearchParams({ customer_id: id, status: "", store: "all", size: "50", page: "1" }).toString(),
        signal,
      ),
    enabled: !!api && canReadContracts && tab === "contracts",
    staleTime: 30_000,
    retry: false,
  });

  const paymentsQuery = useQuery({
    queryKey: ["customer-payments", session?.user.id, id],
    queryFn: ({ signal }) => api!.customerPayments(id, signal),
    enabled: !!api && tab === "payments",
    staleTime: 30_000,
    retry: false,
  });

  const detail = detailQuery.data;
  const displayName = detail?.name || fallback.name || "Khách hàng";
  const displayCode = detail?.code || fallback.code || `KH #${id}`;
  const displayStatus = detail?.status || fallback.status;
  const displayStore = detail?.store_name || fallback.storeName || "Toàn hệ thống";
  const displayPhone = detail?.phone || fallback.phone || "";
  const cleanPhone = displayPhone.replace(/[\s().-]/g, "");
  const canCall = /^\+?[0-9]{8,15}$/.test(cleanPhone);
  const isBlacklisted = displayStatus === "blacklist";

  async function callCustomer() {
    if (!canCall) return;
    setActionError("");
    try {
      await Linking.openURL(`tel:${cleanPhone}`);
    } catch {
      setActionError("Thiết bị chưa mở được cuộc gọi.");
    }
  }

  async function submitBlacklist() {
    if (!api || !detail || busy) return;
    setBusy(true);
    setActionError("");
    setBlacklistConfirm(false);
    try {
      await api.toggleCustomerBlacklist(id, {
        blacklisted: !isBlacklisted,
        revision: detail.revision,
      });
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["customer-detail", session?.user.id, id] }),
        cache.invalidateQueries({ queryKey: ["record", session?.user.id, "customers", id] }),
        cache.invalidateQueries({ queryKey: ["catalogue"] }),
      ]);
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitDelete() {
    if (!api || busy) return;
    setBusy(true);
    setActionError("");
    setDeleteConfirm(false);
    try {
      await api.deleteCustomer(id);
      await cache.invalidateQueries({ queryKey: ["catalogue"] });
      router.replace("/(tabs)/customers");
    } catch (error) {
      setActionError((error as Error).message);
      setBusy(false);
    }
  }

  const contracts = (contractsQuery.data?.rows || []).filter((c) => c.status !== "draft");
  const totalContractAmount = contracts.reduce((sum, c) => sum + (c.totalAmount ?? 0), 0);
  const totalContractPaid = contracts.reduce((sum, c) => sum + (c.paidAmount ?? 0), 0);
  const totalContractDebt = contracts.reduce((sum, c) => sum + Math.max(0, (c.totalAmount ?? 0) - (c.paidAmount ?? 0)), 0);

  const payments = paymentsQuery.data?.rows || [];
  const approvedIncome = payments
    .filter((p) => p.status_code === "approved" && p.type === "income")
    .reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const approvedExpense = payments
    .filter((p) => p.status_code === "approved" && p.type === "expense")
    .reduce((sum, p) => sum + (p.amount ?? 0), 0);

  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen options={{ title: displayName }} />
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 36,
          gap: 12,
          width: "100%",
          maxWidth: 760,
          alignSelf: "center",
        }}
        refreshControl={
          <RefreshControl
            refreshing={isFallbackRefreshing || detailQuery.isRefetching || contractsQuery.isRefetching || paymentsQuery.isRefetching}
            onRefresh={() => {
              onRefreshFallback();
              void detailQuery.refetch();
              if (tab === "contracts") void contractsQuery.refetch();
              if (tab === "payments") void paymentsQuery.refetch();
            }}
            tintColor={theme.primary}
          />
        }
      >
        {/* Header Profile Card */}
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: theme.primary, fontSize: 12.5, fontWeight: "700" }}>
                {displayCode}
                {detail ? ` · ${detail.customer_type === "foreign" ? "Khách nước ngoài" : "Khách Việt Nam"}` : ""}
              </Text>
              <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 21, fontWeight: "800" }}>
                {displayName}
              </Text>
            </View>
            <StatusBadge
              status={displayStatus}
              label={contextualStatusLabel("customers", displayStatus)}
            />
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Building2 size={14} color={theme.muted} />
            <Text style={{ color: theme.muted, fontSize: 13 }}>
              Cơ sở tiếp nhận: <Text style={{ color: theme.text, fontWeight: "600" }}>{displayStore}</Text>
            </Text>
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 2 }}>
            {canCall && (
              <Button
                size="sm"
                label={`Gọi ${cleanPhone}`}
                icon={<Phone size={14} color={theme.primaryText} />}
                onPress={() => { void callCustomer(); }}
              />
            )}
            {canWrite && (
              <Button
                size="sm"
                secondary
                label="Sửa hồ sơ"
                icon={<FilePenLine size={14} color={theme.text} />}
                onPress={() => router.push({ pathname: "/customer/[id]", params: { id } })}
              />
            )}
            {canWrite && detail && (
              <Button
                size="sm"
                danger={!isBlacklisted}
                secondary={isBlacklisted}
                disabled={busy}
                label={isBlacklisted ? "Gỡ Blacklist" : "Đưa vào Blacklist"}
                icon={isBlacklisted ? <ShieldCheck size={14} color={theme.text} /> : <ShieldBan size={14} color={theme.danger} />}
                onPress={() => setBlacklistConfirm(true)}
              />
            )}
          </View>
        </Card>

        {!!actionError && <InlineError message={actionError} />}
        {detailQuery.isError && <InlineError message="Một số chi tiết CCCD/người thân chưa tải được. Kéo xuống để thử lại." />}

        <SegmentedBar
          value={tab}
          onChange={setTab}
          options={[
            { value: "info", label: "Thông tin" },
            ...(canReadContracts ? [{ value: "contracts" as const, label: "Hợp đồng", count: detail?.contract_count }] : []),
            { value: "payments", label: "Thanh toán" },
          ]}
        />

        {tab === "info" && (
          <>
            {!!(detail?.warning_note || fallback.customerNote) && (
              <InfoBanner
                tone={isBlacklisted ? "danger" : "warning"}
                title="Lưu ý hồ sơ rủi ro"
                message={detail?.warning_note || fallback.customerNote || ""}
              />
            )}

            <Card style={{ gap: 4 }}>
              <Text style={{ color: theme.text, fontSize: 15.5, fontWeight: "800", marginBottom: 4 }}>
                Liên hệ & Cá nhân
              </Text>
              <KeyValueRow label="Số điện thoại" selectable strong valueColor={theme.primary} value={displayPhone} />
              <KeyValueRow label="Email" selectable value={detail?.email || fallback.email} />
              <KeyValueRow label="Địa chỉ" selectable value={detail?.address || fallback.address} />
              <KeyValueRow label="Quốc tịch" value={detail?.nationality || (detail?.customer_type === "foreign" ? "Nước ngoài" : "Việt Nam")} />
              <KeyValueRow label="Kênh liên hệ" value={detail?.contact_channel || fallback.contactChannel} />
              <KeyValueRow label="Chi tiết liên hệ" selectable value={detail?.contact_detail || fallback.contactDetail} />
            </Card>

            <Card style={{ gap: 4 }}>
              <Text style={{ color: theme.text, fontSize: 15.5, fontWeight: "800", marginBottom: 4 }}>
                CCCD / Hộ chiếu & GPLX
              </Text>
              <KeyValueRow label="Số CCCD / Hộ chiếu" selectable strong value={detail?.id_card} />
              <KeyValueRow label="Ngày cấp CCCD" value={detail?.id_card_issued_on} />
              <KeyValueRow label="Nơi cấp CCCD" value={detail?.id_card_issued_by} />
              <KeyValueRow label="Số GPLX" selectable value={detail?.driver_license_number} />
              <KeyValueRow label="Ngày cấp GPLX" value={detail?.driver_license_issued_on} />
            </Card>

            {detail && detail.relatives.length > 0 && (
              <Card style={{ gap: 8 }}>
                <Text style={{ color: theme.text, fontSize: 15.5, fontWeight: "800" }}>
                  Người thân ({detail.relatives.length})
                </Text>
                {detail.relatives.map((rel, index) => (
                  <View
                    key={index}
                    style={[
                      styles.relativeItem,
                      { borderTopColor: theme.border, borderTopWidth: index > 0 ? 1 : 0 },
                    ]}
                  >
                    <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700" }}>
                      {rel.name || "—"} {rel.relationship ? `(${rel.relationship})` : ""}
                    </Text>
                    <Text selectable style={{ color: theme.muted, fontSize: 13.5 }}>
                      {rel.phone || "Chưa có SĐT"}
                    </Text>
                  </View>
                ))}
              </Card>
            )}

            <Card style={{ gap: 9 }}>
              <Text style={{ color: theme.text, fontSize: 15.5, fontWeight: "800" }}>
                Giấy tờ & Quản lý
              </Text>
              <Button
                size="sm"
                secondary
                label="Giấy tờ, CCCD & Ảnh khách hàng"
                icon={<FileText size={15} color={theme.text} />}
                onPress={() =>
                  router.push({
                    pathname: "/record-media/[entity]/[id]",
                    params: { entity: "customers", id, kind: "customer", referenceId: id },
                  })
                }
              />
              {canDelete && (
                <Button
                  size="sm"
                  danger
                  disabled={busy || Boolean(detail && detail.contract_count > 0)}
                  label={detail && detail.contract_count > 0 ? `Không thể xóa (đang có ${detail.contract_count} HĐ)` : "Xóa hồ sơ khách hàng"}
                  icon={<Trash2 size={15} color={theme.danger} />}
                  onPress={() => setDeleteConfirm(true)}
                />
              )}
            </Card>
          </>
        )}

        {tab === "contracts" && (
          <>
            {contractsQuery.isPending ? (
              <StateView title="Đang tải hợp đồng của khách" loading />
            ) : contractsQuery.isError ? (
              <StateView title="Chưa tải được hợp đồng" message={contractsQuery.error.message} retry={() => void contractsQuery.refetch()} />
            ) : (
              <>
                <Card style={{ gap: 4 }}>
                  <KeyValueRow label="Tổng số hợp đồng" strong value={contractsQuery.data.total.toLocaleString("vi-VN")} />
                  <KeyValueRow label="Tổng tiền thuê" value={money(totalContractAmount)} />
                  <KeyValueRow label="Đã thanh toán" valueColor={theme.success} value={money(totalContractPaid)} />
                  <KeyValueRow label="Còn nợ" strong valueColor={totalContractDebt > 0 ? theme.danger : theme.text} value={money(totalContractDebt)} />
                </Card>
                {contracts.length === 0 ? (
                  <StateView title="Khách hàng chưa có hợp đồng" />
                ) : (
                  contracts.map((item) => (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      onPress={() => router.push({ pathname: "/record/[kind]/[id]", params: { kind: "contracts", id: String(item.id) } })}
                    >
                      <Card style={{ gap: 6 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <Text style={{ color: theme.primary, fontSize: 15, fontWeight: "800" }}>{item.code}</Text>
                          <StatusBadge status={item.status} label={contextualStatusLabel("contracts", item.status)} />
                        </View>
                        <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: "600" }}>
                          {[item.license, item.storeName].filter(Boolean).join(" · ") || "—"}
                        </Text>
                        <KeyValueRow label="Thời hạn" value={`${item.startsAt ? dateTime(item.startsAt) : "—"} → ${item.endsAt ? dateTime(item.endsAt) : "—"}`} />
                        <KeyValueRow label="Tổng / Đã thu" strong value={`${money(item.totalAmount)} / ${money(item.paidAmount)}`} />
                      </Card>
                    </Pressable>
                  ))
                )}
                {contractsQuery.data.total > contracts.length && (
                  <Button
                    size="sm"
                    secondary
                    label={`Xem đủ ${contractsQuery.data.total} hợp đồng trong danh sách`}
                    onPress={() =>
                      router.push({
                        pathname: "/(tabs)/contracts",
                        params: { customer_id: id, customer_name: displayName, status: "all", store: "all" },
                      })
                    }
                  />
                )}
              </>
            )}
          </>
        )}

        {tab === "payments" && (
          <>
            {paymentsQuery.isPending ? (
              <StateView title="Đang tải lịch sử thanh toán" loading />
            ) : paymentsQuery.isError ? (
              <StateView title="Chưa tải được thanh toán" message={paymentsQuery.error.message} retry={() => void paymentsQuery.refetch()} />
            ) : (
              <>
                <Card style={{ gap: 4 }}>
                  <KeyValueRow label="Số phiếu thu/chi" strong value={payments.length.toLocaleString("vi-VN")} />
                  <KeyValueRow label="Tổng thu đã duyệt" strong valueColor={theme.success} value={money(approvedIncome)} />
                  <KeyValueRow label="Tổng chi / hoàn đã duyệt" strong valueColor={theme.danger} value={money(approvedExpense)} />
                  <KeyValueRow label="Thực thu ròng" strong value={money(approvedIncome - approvedExpense)} />
                </Card>
                {payments.length === 0 ? (
                  <StateView title="Chưa có giao dịch thanh toán" />
                ) : (
                  payments.map((tx) => (
                    <Card key={tx.id} style={{ gap: 5 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <Text style={{ color: theme.text, fontSize: 14.5, fontWeight: "700", flex: 1 }}>
                          {tx.reason} (#{tx.id})
                        </Text>
                        <Text style={{ color: tx.type === "income" ? theme.success : theme.danger, fontSize: 15, fontWeight: "800" }}>
                          {tx.type === "income" ? "+" : "-"}{money(tx.amount)}
                        </Text>
                      </View>
                      <Text style={{ color: theme.muted, fontSize: 12.5 }}>
                        {tx.at ? dateTime(tx.at) : "—"} · {tx.status} · {tx.actor}
                      </Text>
                      <Text style={{ color: theme.muted, fontSize: 12.5 }}>
                        {[tx.method, tx.account].filter(Boolean).join(" · ")}
                      </Text>
                      {!!tx.note && <Text selectable style={{ color: theme.text, fontSize: 13 }}>{tx.note}</Text>}
                      {!!tx.order_id && canReadContracts && (
                        <Button
                          size="sm"
                          secondary
                          label={`Mở HĐ ${tx.contract_code || `#${tx.order_id}`}`}
                          onPress={() => router.push({ pathname: "/record/[kind]/[id]", params: { kind: "contracts", id: String(tx.order_id) } })}
                        />
                      )}
                    </Card>
                  ))
                )}
              </>
            )}
          </>
        )}
      </ScrollView>

      {blacklistConfirm && (
        <ConfirmEdit
          title={isBlacklisted ? "Gỡ khách khỏi Blacklist?" : "Đưa khách vào Blacklist?"}
          message={
            isBlacklisted
              ? `${displayName} sẽ được khôi phục trạng thái hoạt động (hoặc chưa hoàn tất nếu thiếu giấy tờ).`
              : `${displayName} sẽ bị đánh dấu Nợ xấu / Cấm thuê trên toàn hệ thống.`
          }
          confirmLabel={isBlacklisted ? "Xác nhận gỡ Blacklist" : "Xác nhận đưa vào Blacklist"}
          busy={busy}
          onCancel={() => setBlacklistConfirm(false)}
          onConfirm={() => { void submitBlacklist(); }}
        />
      )}

      {deleteConfirm && (
        <ConfirmEdit
          title="Xóa hồ sơ khách hàng?"
          message={
            detail && detail.contract_count > 0
              ? `Khách hàng đang liên kết ${detail.contract_count} hợp đồng nên không thể xóa. Hãy giữ lại hồ sơ để bảo toàn lịch sử.`
              : `Xóa vĩnh viễn khách hàng ${displayName} (${displayCode})? Thao tác này không thể hoàn tác.`
          }
          confirmLabel="Xác nhận xóa khách hàng"
          busy={busy}
          onCancel={() => setDeleteConfirm(false)}
          onConfirm={() => { void submitDelete(); }}
        />
      )}
    </SafeAreaView>
  );
}

export default function RecordDetail() {
  const params = useLocalSearchParams<{ kind: string; id: string }>();
  const { api, session } = useSession();
  const cache = useQueryClient();
  const theme = useTheme();

  const valid =
    ["vehicles", "contracts", "customers"].includes(params.kind) &&
    /^[1-9]\d{0,14}$/.test(params.id);
  const allowed =
    valid && session?.user.permissions.includes(`${params.kind}.read`);

  useEffect(() => {
    if (allowed && params.kind === "vehicles") {
      router.replace({ pathname: "/vehicle/[id]", params: { id: params.id } });
    }
  }, [allowed, params.kind, params.id]);

  const query = useQuery<MobileRecord>({
    queryKey: ["record", session?.user.id, params.kind, params.id],
    queryFn: ({ signal }) =>
      api!.record(params.kind as CatalogueKind, params.id, signal),
    placeholderData: () =>
      api && session
        ? cache.getQueryData<MobileRecord>(
          recordPreviewKey(
            api.origin,
            session.user,
            params.kind as CatalogueKind,
            params.id,
          ),
        )
        : undefined,
    staleTime: 30_000,
    refetchOnMount: "always",
    gcTime: 300_000,
    enabled: !!api && !!allowed && params.kind !== "vehicles",
  });

  if (!allowed) {
    return (
      <StateView
        title="Không mở được hồ sơ"
        message="Kiểm tra liên kết và quyền truy cập của tài khoản."
      />
    );
  }

  if (params.kind === "vehicles") {
    return <StateView title="Đang chuyển sang hồ sơ xe..." loading />;
  }

  if (query.isPending && !query.data) return <StateView title="Đang tải hồ sơ" loading />;
  if (query.isError && !query.data) {
    return (
      <StateView
        title="Chưa tải được hồ sơ"
        message={query.error.message}
        retry={() => {
          void query.refetch();
        }}
      />
    );
  }

  const row = query.data!;

  if (params.kind === "contracts") {
    return (
      <SafeAreaView edges={["bottom", "left", "right"]} style={{ flex: 1, backgroundColor: theme.background }}>
        <Stack.Screen options={{ title: `HĐ ${row.code}` }} />
        <ContractDetailView
          record={row}
          isRefetching={query.isRefetching}
          onRefresh={() => {
            void query.refetch();
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <CustomerDetailScreen
      id={params.id}
      fallback={row}
      isFallbackRefreshing={query.isRefetching}
      onRefreshFallback={() => {
        void query.refetch();
      }}
    />
  );
}

const styles = StyleSheet.create({
  relativeItem: {
    paddingTop: 8,
    gap: 2,
  },
});
