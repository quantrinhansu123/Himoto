import React, { useState } from "react";
import {
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeftRight,
  BatteryCharging,
  Bike,
  CalendarPlus,
  FileCheck,
  FilePenLine,
  FileSpreadsheet,
  FileText,
  MessageCircle,
  Phone,
  Printer,
  QrCode,
  RotateCcw,
  Trash2,
  User,
  Wallet,
} from "lucide-react-native";
import type { MobileRecord } from "@himoto/mobile-contract";
import { rentalDayCount } from "../../../shared/rental-time";
import { contextualStatusLabel } from "@/lib/catalogue-config";
import { useSession } from "@/providers/session";
import { dateTime, money, useTheme } from "@/theme";
import { Button, Card, InfoBanner, InlineError, KeyValueRow, StatusBadge } from "./ui";
import { ConfirmEdit } from "./editor-sheet";
import { SectionTabs } from "./section-tabs";
import { ContractApprovalSummary } from "./contract-approval-summary";
import { ContractPhotosTab } from "./contract-photos-tab";

// Exact 11 tabs matching Web ContractDetail.tsx (SECTIONS) in order and labels.
type ContractTab =
  | "vehicle"
  | "contract"
  | "lifecycle"
  | "customer"
  | "payment"
  | "battery"
  | "signing"
  | "changes"
  | "cashflow"
  | "photos"
  | "telegram";

const CONTRACT_TABS = [
  { id: "vehicle" as ContractTab, label: "Thông tin phương tiện" },
  { id: "contract" as ContractTab, label: "Hợp đồng" },
  { id: "lifecycle" as ContractTab, label: "Nợ xấu / bảo lưu" },
  { id: "customer" as ContractTab, label: "Khách hàng (Bên B)" },
  { id: "payment" as ContractTab, label: "Chi phí" },
  { id: "battery" as ContractTab, label: "Pin / sạc" },
  { id: "signing" as ContractTab, label: "Ký kết & ghi chú" },
  { id: "changes" as ContractTab, label: "Lịch sử chỉnh sửa" },
  { id: "cashflow" as ContractTab, label: "Lịch sử thu chi" },
  { id: "photos" as ContractTab, label: "Ảnh thuê / trả xe" },
  { id: "telegram" as ContractTab, label: "Telegram" },
] as const;

const CHANGE_LABELS: Record<string, string> = {
  created: "Tạo mới",
  renew: "Gia hạn",
  payment: "Thu / chi",
  swap: "Đổi xe",
  return: "Trả xe",
  edit: "Chỉnh sửa",
  status: "Trạng thái",
};

const CHANGE_TONES: Record<string, string> = {
  created: "active",
  renew: "completed",
  payment: "income",
  swap: "pending",
  return: "completed",
  edit: "warning",
  status: "overdue",
};

const TELEGRAM_STATUS_LABELS: Record<string, string> = {
  sent: "Đã gửi",
  pending: "Đang chờ gửi",
  sending: "Đang gửi",
  failed: "Gửi lỗi",
  retracting: "Đang thu hồi",
  retracted: "Đã thu hồi",
  unknown: "Cần đối chiếu",
};

function InlineChangesTab({ id }: { id: string }) {
  const theme = useTheme();
  const { api, session } = useSession();
  const [expanded, setExpanded] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["contract-history-inline", api?.origin, session?.user.id, id, "changes"],
    queryFn: ({ signal }) => api!.contractHistory(id, new URLSearchParams({ tab: "changes", page: "1" }), signal),
    enabled: Boolean(api && typeof api.contractHistory === "function"),
    staleTime: 15_000,
    retry: false,
  });
  const changes = Array.isArray(query.data?.changes) ? query.data!.changes : [];
  return (
    <View style={{ gap: 12 }}>
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <Text style={[styles.cardTitle, { color: theme.text, flex: 1 }]}>Danh sách chỉnh sửa hợp đồng</Text>
          <Button size="sm" secondary label="Làm mới" loading={query.isFetching} onPress={() => void query.refetch()} />
        </View>
        <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 19 }}>
          Ghi nhận tạo hợp đồng, gia hạn, thu thêm, đổi xe và trả xe.
        </Text>
        {query.isError && <InlineError message={(query.error as Error).message} />}
        {query.isPending && !changes.length && <Text style={{ color: theme.muted, fontSize: 13.5 }}>Đang tải lịch sử…</Text>}
        {!query.isPending && !query.isError && !changes.length && (
          <Text style={{ color: theme.muted, fontSize: 13.5 }}>Chưa có lần chỉnh sửa nào.</Text>
        )}
        {changes.map((change) => (
          <View
            key={change.id}
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.border,
              paddingTop: 10,
              gap: 6,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <StatusBadge status={CHANGE_TONES[change.kind] || "active"} label={CHANGE_LABELS[change.kind] || change.kind} />
              <Text style={{ color: theme.muted, fontSize: 12 }}>{dateTime(change.at)} · {change.actor}</Text>
            </View>
            <Text style={{ color: theme.text, fontSize: 14.5, fontWeight: "700" }}>
              {change.title}
              {change.amount ? ` · ${change.amount < 0 ? "−" : ""}${money(Math.abs(change.amount))}` : ""}
            </Text>
            {!!change.detail && <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 19 }}>{change.detail}</Text>}
            {(change.version || ["created", "swap"].includes(change.kind)) && (
              <View style={{ flexDirection: "row", gap: 8, paddingTop: 2 }}>
                {change.kind !== "swap" && change.version && (
                  <Button
                    size="sm"
                    equalWidth
                    secondary
                    label={expanded === change.id ? "Ẩn" : "Xem"}
                    onPress={() => setExpanded((cur) => (cur === change.id ? null : change.id))}
                  />
                )}
                <Button
                  size="sm"
                  equalWidth
                  secondary
                  label="In"
                  icon={<Printer size={14} color={theme.text} />}
                  onPress={() => router.push({ pathname: "/print/[kind]/[id]", params: { kind: "contracts", id, version: change.id } })}
                />
              </View>
            )}
            {expanded === change.id && change.version && (
              <View style={{ gap: 2, padding: 10, borderRadius: 9, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border }}>
                <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: "700", marginBottom: 2 }}>{change.version.label}</Text>
                <KeyValueRow label="Hẹn trả" value={dateTime(change.version.return_at || "")} />
                <KeyValueRow label="Tiền thuê" value={money(change.version.total)} />
                <KeyValueRow label="Đã thu" value={money(change.version.paid)} emphasize />
              </View>
            )}
          </View>
        ))}
        <Button
          size="sm"
          secondary
          label="Tìm kiếm & xem đầy đủ lịch sử chỉnh sửa"
          onPress={() => router.push({ pathname: "/contract-history/[id]", params: { id, tab: "changes" } })}
        />
      </Card>
    </View>
  );
}

function InlineCashflowTab({
  id,
  status,
  canPay,
  remaining,
  depositHeld,
}: {
  id: string;
  status: string;
  canPay: boolean;
  remaining: number | null;
  depositHeld: number | null;
}) {
  const theme = useTheme();
  const { api, session } = useSession();
  const query = useQuery({
    queryKey: ["contract-history-inline", api?.origin, session?.user.id, id, "cashflow"],
    queryFn: ({ signal }) => api!.contractHistory(id, new URLSearchParams({ tab: "cashflow", page: "1" }), signal),
    enabled: Boolean(api && typeof api.contractHistory === "function"),
    staleTime: 15_000,
    retry: false,
  });
  const rows = Array.isArray(query.data?.cashflow) ? query.data!.cashflow : [];
  const receipts = query.data?.receipts;

  return (
    <View style={{ gap: 12 }}>
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <Text style={[styles.cardTitle, { color: theme.text, flex: 1 }]}>Lịch sử thu chi</Text>
          <Button size="sm" secondary label="Làm mới" loading={query.isFetching} onPress={() => void query.refetch()} />
        </View>
        <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 19 }}>
          Tất cả phiếu thu / chi gắn với hợp đồng trong Sổ quỹ / Sổ két.
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {canPay && (
            <Button
              size="sm"
              equalWidth
              label="Điền phiếu thu"
              icon={<Wallet size={14} color={theme.primaryText} />}
              onPress={() => router.push({ pathname: "/payment/[id]", params: { id } })}
            />
          )}
          {status !== "cancelled" && (
            <Button
              size="sm"
              equalWidth
              secondary
              label="Nhập phiếu chi"
              icon={<QrCode size={14} color={theme.text} />}
              onPress={() => router.push({ pathname: "/contract-qr/[id]", params: { id } })}
            />
          )}
        </View>
        {canPay && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Button
              size="sm"
              equalWidth
              secondary
              label={`Thu công nợ${remaining && remaining > 0 ? ` (${money(remaining)})` : ""}`}
              disabled={remaining === 0}
              onPress={() => router.push({ pathname: "/payment/[id]", params: { id } })}
            />
            <Button
              size="sm"
              equalWidth
              secondary
              label={`Trả cọc${depositHeld != null && depositHeld > 0 ? ` (${money(depositHeld)})` : ""}`}
              disabled={depositHeld == null || depositHeld <= 0}
              onPress={() => router.push({ pathname: "/payment/[id]", params: { id } })}
            />
          </View>
        )}
        {receipts && (
          <View style={{ gap: 2, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 8 }}>
            <KeyValueRow label="Tổng thu (đã duyệt)" valueColor={theme.success} emphasize value={money(receipts.received)} />
            <KeyValueRow label="Tổng chi (đã duyệt)" valueColor={theme.danger} emphasize value={money(receipts.spent)} />
            <KeyValueRow label="Chênh lệch" emphasize value={money(receipts.net)} />
          </View>
        )}
        {query.isError && <InlineError message={(query.error as Error).message} />}
        {query.isPending && !rows.length && <Text style={{ color: theme.muted, fontSize: 13.5 }}>Đang tải lịch sử thu chi…</Text>}
        {!query.isPending && !query.isError && !rows.length && (
          <Text style={{ color: theme.muted, fontSize: 13.5 }}>Chưa có phiếu thu / chi nào cho hợp đồng này.</Text>
        )}
        {rows.map((item) => (
          <View
            key={item.id}
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.border,
              paddingTop: 10,
              gap: 4,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <Text style={{ color: theme.text, fontSize: 14.5, fontWeight: "700", flex: 1 }}>
                Phiếu #{item.id} · {item.type === "income" ? "Thu" : "Chi"} {money(item.amount)}
              </Text>
              <StatusBadge status={item.status_code} label={item.status} />
            </View>
            <KeyValueRow label="Lý do" value={item.reason} />
            <KeyValueRow label="Thời điểm & người tạo" value={`${dateTime(item.at)} · ${item.actor}`} />
            <KeyValueRow label="Hình thức & tài khoản" value={`${item.method} · ${item.account}`} />
            {!!item.note && <KeyValueRow label="Ghi chú" value={item.note} />}
          </View>
        ))}
        <Button
          size="sm"
          secondary
          label="Tìm kiếm & xem đầy đủ lịch sử thu chi"
          onPress={() => router.push({ pathname: "/contract-history/[id]", params: { id, tab: "cashflow" } })}
        />
      </Card>
    </View>
  );
}

function InlineTelegramTab({ id, status }: { id: string; status: string }) {
  const theme = useTheme();
  const { api, session } = useSession();
  const isDraft = status === "draft";
  const query = useQuery({
    queryKey: ["telegram-inline", api?.origin, session?.user.id, id],
    queryFn: ({ signal }) => api!.contractTelegram(id, signal),
    enabled: !isDraft && Boolean(api && typeof api.contractTelegram === "function"),
    staleTime: 15_000,
    retry: false,
  });
  const events = Array.isArray(query.data?.events) ? query.data!.events : [];

  if (isDraft) {
    return (
      <Card style={{ gap: 10 }}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Gửi thông tin và ảnh vào nhóm Telegram</Text>
        <Text style={{ color: theme.muted, fontSize: 13.5, lineHeight: 20 }}>
          Hợp đồng đang lưu nháp. Bấm Tiếp tục hoàn tất hợp đồng, kiểm tra thanh toán rồi Xác nhận lưu chính thức. Sau khi phát hành mới gửi được thông tin và ảnh lên Telegram.
        </Text>
      </Card>
    );
  }

  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Text style={[styles.cardTitle, { color: theme.text, flex: 1 }]}>Gửi thông tin và ảnh vào nhóm Telegram</Text>
        <Button size="sm" secondary label="Làm mới" loading={query.isFetching} onPress={() => void query.refetch()} />
      </View>
      {status === "cancelled" && (
        <Text style={{ color: theme.muted, fontSize: 13.5, lineHeight: 20 }}>
          Hợp đồng đã hủy. Có thể xem lịch sử và thu hồi tin đã gửi.
        </Text>
      )}
      {query.isError && <InlineError message={(query.error as Error).message} />}
      {query.isPending && !events.length && <Text style={{ color: theme.muted, fontSize: 13.5 }}>Đang tải trạng thái Telegram…</Text>}
      {events.map((ev) => (
        <View key={ev.key} style={{ borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 8, gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700", flex: 1 }}>{ev.label}</Text>
            <StatusBadge
              status={ev.status === "sent" ? "completed" : ev.status === "failed" ? "overdue" : "pending"}
              label={ev.status ? TELEGRAM_STATUS_LABELS[ev.status] || ev.status : "Chưa gửi"}
            />
          </View>
          <KeyValueRow label="Tệp đính kèm" value={`${ev.photo_count} ảnh · ${ev.video_count || 0} video`} />
          {!!ev.sent_at && <KeyValueRow label="Thời điểm gửi" value={dateTime(ev.sent_at)} />}
        </View>
      ))}
      <Button
        size="sm"
        label={status === "cancelled" ? "Lịch sử Telegram / Thu hồi tin" : "Gửi Telegram"}
        icon={<MessageCircle size={15} color={theme.primaryText} />}
        onPress={() =>
          router.push({
            pathname: "/contract-telegram/[id]",
            params: {
              id,
              ...(status === "completed" || status === "wait_payment"
                ? { eventKind: "return" }
                : status === "deposit_contract"
                  ? { eventKind: "reservation" }
                  : {}),
            },
          })
        }
      />
    </Card>
  );
}

export function ContractDetailView({
  record,
  isRefetching,
  onRefresh,
}: {
  record: MobileRecord;
  isRefetching: boolean;
  onRefresh: () => void;
}) {
  const theme = useTheme();
  const { api, session } = useSession();
  const cache = useQueryClient();
  // First useState MUST remain activeTab so regression tests targeting 'customer' stay compatible.
  const [activeTab, setActiveTab] = useState<ContractTab>("vehicle");
  const [callError, setCallError] = useState("");
  const [hideConfirm, setHideConfirm] = useState(false);
  const [hideBusy, setHideBusy] = useState(false);

  const id = String(record.id);
  const permissions = session?.user.permissions || [];

  const detailQuery = useQuery({
    queryKey: ["contract-detail", session?.user.id, id],
    queryFn: ({ signal }) => api!.contractDetail(id, signal),
    enabled: !!api && permissions.includes("contracts.read"),
    staleTime: 15_000,
    retry: false,
  });

  const detail = detailQuery.data;
  const displayPhone = detail?.customer.phone || record.phone || "";
  const cleanPhone = displayPhone.replace(/[\s().-]/g, "");
  const canCall = /^\+?[0-9]{8,15}$/.test(cleanPhone);

  const handleCall = async () => {
    if (!canCall) return;
    setCallError("");
    try {
      await Linking.openURL(`tel:${cleanPhone}`);
    } catch {
      setCallError("Thiết bị không hỗ trợ cuộc gọi trực tiếp. Vui lòng bấm sao chép số điện thoại.");
    }
  };

  async function submitHideContract() {
    if (!api || hideBusy) return;
    setHideBusy(true);
    setHideConfirm(false);
    setCallError("");
    try {
      await api.hideContract(id);
      await cache.invalidateQueries({ queryKey: ["catalogue"] });
      router.replace("/(tabs)/contracts");
    } catch (error) {
      setCallError((error as Error).message);
      setHideBusy(false);
    }
  }

  const status = detail?.status || record.status;
  const isRenting = ["renting", "overdue", "wait_payment"].includes(status);
  const isDraft = ["draft", "deposit_contract"].includes(status);
  const isBadDebt = status === "bad_debt";
  const isInstallment = Boolean(detail?.hasBillingPlan);
  const canRecoverVehicle = (isBadDebt || Boolean(detail?.badDebtClosedAt)) && permissions.includes("contracts.return");
  const isOwnership = ["ownership", "ownership_cd"].includes(detail?.rentalType || record.monitoring?.rentalType || "");
  const canEdit = session?.user.role === "admin" || permissions.includes("contracts.draft");
  const canPay = status !== "draft" && status !== "cancelled" && permissions.some((p) => p === "finance.read" || p === "finance.write");
  const canEditRentalTerms = status !== "draft" && !isOwnership && !isInstallment && canEdit;
  const totalAmount = detail?.totalAmount ?? record.totalAmount;
  const paidAmount = detail?.paidAmount ?? record.paidAmount;
  const remaining = totalAmount != null && paidAmount != null ? Math.max(totalAmount - paidAmount, 0) : null;
  const depositHeld = detail?.depositHeld ?? null;

  const vehicles = detail?.vehicles.length
    ? detail.vehicles
    : [
        {
          id: "",
          name: record.vehicleName || "",
          license: record.license || "",
          stockStoreName: record.storeName || "",
          color: "",
          typeText: "",
          brand: "",
          year: "",
          driverName: "",
          driverLicenseNumber: "",
          driverLicenseIssuedOn: "",
          borrowHats: "",
          borrowRaincoats: "",
          rentAt: record.startsAt,
          returnAt: record.endsAt,
          completedAt: "",
        },
      ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Contract Top Header */}
      <View style={styles.headerCard}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: theme.primary, fontSize: 12, fontWeight: "800", letterSpacing: 0.5 }}>
              HỢP ĐỒNG THUÊ XE{detail?.contractTypeName ? ` · ${detail.contractTypeName.toUpperCase()}` : ""}
            </Text>
            <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 21, fontWeight: "800" }}>
              {detail?.code || record.code}
            </Text>
          </View>
          <StatusBadge
            status={status}
            label={contextualStatusLabel("contracts", status)}
          />
        </View>

        <View style={styles.vehicleSummaryRow}>
          <Bike size={15} color={theme.primary} />
          <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: "700" }}>
            {detail?.vehicles.length
              ? detail.vehicles.map((v) => v.license || v.name).filter(Boolean).join(", ")
              : record.license || record.vehicleName || "Chưa có xe bàn giao"}
          </Text>
          <Text style={{ color: theme.muted, fontSize: 12.5 }}>· {detail?.storeName || record.storeName}</Text>
        </View>
      </View>

      {/* 11 Web-Matched Numbered Section Tabs (01 → 11) */}
      <View style={styles.tabContainer}>
        <SectionTabs
          sections={CONTRACT_TABS}
          active={activeTab}
          onChange={(tab) => setActiveTab(tab)}
        />
      </View>

      {/* Main Content Area */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching || detailQuery.isRefetching}
            tintColor={theme.primary}
            onRefresh={() => {
              onRefresh();
              void detailQuery.refetch();
            }}
          />
        }
      >
        {!!callError && <InlineError message={callError} />}

        {!!detail?.holdUntil && (
          <InfoBanner
            tone="info"
            title="Hợp đồng đang bảo lưu"
            message={`Hạn bảo lưu đến ${dateTime(detail.holdUntil)}${detail.heldAt ? ` (bắt đầu ${dateTime(detail.heldAt)})` : ""}.`}
          />
        )}

        {!!detail?.badDebtClosedAt && (
          <InfoBanner
            tone="warning"
            title="Đã đóng hợp đồng nợ xấu"
            message={`Đóng lúc ${dateTime(detail.badDebtClosedAt)}. Công nợ và thu hồi xe vẫn tiếp tục theo dõi.`}
          />
        )}

        {detail?.paymentMismatch && (
          <InfoBanner
            tone="danger"
            title="Lệch số thu giữa phiếu và hợp đồng"
            message={`Tổng thực thu theo phiếu đã duyệt là ${money(detail.receiptsPaid)}, khác số ${money(detail.paidAmount)} trên hợp đồng. Cần đối chiếu trước khi quyết toán.`}
          />
        )}

        {/* Quick Priority Action Bar matching Web ContractDetail footer button labels */}
        {(isRenting || isBadDebt) && (
          <Card style={[styles.priorityCard, { borderColor: theme.primary, backgroundColor: theme.surface }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: "800" }}>
                Thao tác tại quầy
              </Text>
              <StatusBadge
                status={status}
                label={contextualStatusLabel("contracts", status)}
              />
            </View>

            <View style={styles.priorityBtnRow}>
              {permissions.includes("contracts.renew") && !isInstallment && (
                <Button
                  size="sm"
                  equalWidth
                  label="Gia hạn"
                  icon={<CalendarPlus size={15} color={theme.primaryText} />}
                  onPress={() => router.push({ pathname: "/renewal/[id]", params: { id } })}
                />
              )}
              {isRenting && permissions.includes("contracts.return") && (
                <Button
                  size="sm"
                  equalWidth
                  secondary
                  label="Trả xe"
                  icon={<RotateCcw size={15} color={theme.text} />}
                  onPress={() => router.push({ pathname: "/return-editor/[id]", params: { id } })}
                />
              )}
            </View>

            <View style={styles.priorityBtnRow}>
              {isRenting && permissions.includes("contracts.return") && (
                <Button
                  size="sm"
                  equalWidth
                  secondary
                  label="Đổi xe"
                  icon={<ArrowLeftRight size={15} color={theme.text} />}
                  onPress={() => router.push({ pathname: "/swap-editor/[id]", params: { id } })}
                />
              )}
              {permissions.some((p) => p === "finance.read" || p === "finance.write") && (
                <Button
                  size="sm"
                  equalWidth
                  secondary
                  label="Điền sổ quỹ"
                  icon={<Wallet size={15} color={theme.text} />}
                  onPress={() => router.push({ pathname: "/finance/[id]", params: { id } })}
                />
              )}
            </View>

            <View style={styles.priorityBtnRow}>
              <Button
                size="sm"
                equalWidth
                secondary
                label="Gửi Telegram"
                icon={<MessageCircle size={15} color={theme.text} />}
                onPress={() => setActiveTab("telegram")}
              />
              <Button
                size="sm"
                equalWidth
                secondary
                label="In hợp đồng"
                icon={<Printer size={15} color={theme.text} />}
                onPress={() => router.push({ pathname: "/print/[kind]/[id]", params: { kind: "contracts", id } })}
              />
            </View>

            {record.reminderEligible && permissions.some((p) => p === "contracts.draft" || p === "finance.write") && (
              <Button
                size="sm"
                secondary
                label="Nhắc nợ"
                icon={<MessageCircle size={15} color={theme.text} />}
                onPress={() => router.push({ pathname: "/reminder-editor/[id]", params: { id } })}
              />
            )}

            {isBadDebt && permissions.includes("contracts.settle") && (
              <Button
                size="sm"
                label="Đóng hợp đồng nợ xấu"
                icon={<FileCheck size={15} color={theme.primaryText} />}
                onPress={() => router.push({ pathname: "/contract-operation/[action]/[id]", params: { action: "payment_settlement", id, mode: "close_unpaid" } })}
              />
            )}
          </Card>
        )}

        {/* Draft / Deposit Quick Action matching Web ContractDetail footer */}
        {isDraft && (
          <Card style={[styles.priorityCard, { borderColor: theme.primary }]}>
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: "800" }}>
              {status === "draft" ? "Xử lý Hợp đồng nháp" : "Xử lý Hợp đồng đặt cọc"}
            </Text>
            {status === "draft" && permissions.includes("contracts.draft") && (
              <Button
                size="sm"
                label="Tiếp tục hoàn tất hợp đồng"
                onPress={() => router.push({ pathname: "/draft/[id]", params: { id } })}
              />
            )}
            {permissions.includes("contracts.finalize") && (
              <Button
                size="sm"
                secondary={status === "draft"}
                label={status === "draft" ? "Rà soát & Phát hành hợp đồng" : "Giao xe đã đặt cọc"}
                onPress={() => router.push({ pathname: "/contract/[id]", params: { id } })}
              />
            )}
            {status === "deposit_contract" && canEdit && (
              <Button
                size="sm"
                secondary
                label="Bổ sung hồ sơ hợp đồng cọc"
                onPress={() => router.push({ pathname: "/contract-edit/[id]", params: { id, mode: "profile" } })}
              />
            )}
            {status === "deposit_contract" && permissions.includes("contracts.finalize") && (
              <Button
                size="sm"
                secondary
                label="Khách không đến nhận xe"
                onPress={() => router.push({ pathname: "/contract-operation/[action]/[id]", params: { id, action: "no_show" } })}
              />
            )}
            {status === "deposit_contract" && (
              <Button
                size="sm"
                secondary
                label="Gửi Telegram"
                icon={<MessageCircle size={15} color={theme.text} />}
                onPress={() => router.push({ pathname: "/contract-telegram/[id]", params: { id, eventKind: "reservation" } })}
              />
            )}
            {status === "deposit_contract" && permissions.includes("contracts.delete") && (
              <Button
                size="sm"
                danger
                label="Xóa hợp đồng cọc"
                onPress={() => router.push({ pathname: "/contract-operation/[action]/[id]", params: { id, action: "delete_reservation" } })}
              />
            )}
            {status === "draft" && permissions.includes("contracts.draft") && (
              <Button
                size="sm"
                danger
                label="Xóa hẳn bản nháp"
                icon={<Trash2 size={15} color={theme.danger} />}
                onPress={() => router.push({ pathname: "/draft-delete/[id]", params: { id } })}
              />
            )}
          </Card>
        )}

        {/* Bad debt recovery shortcut */}
        {canRecoverVehicle && (
          <Button
            size="sm"
            danger
            label="Thu hồi xe nợ xấu"
            icon={<AlertTriangle size={16} color={theme.danger} />}
            onPress={() => router.push({ pathname: "/recovery-editor/[id]", params: { id } })}
          />
        )}

        {/* TAB 01: THÔNG TIN PHƯƠNG TIỆN */}
        {activeTab === "vehicle" && (
          <View style={{ gap: 12 }}>
            <Card style={{ gap: 4 }}>
              <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 4 }]}>Thời gian thuê</Text>
              <KeyValueRow label="Thuê lúc" value={dateTime(detail?.startDate || record.startsAt)} />
              <KeyValueRow label="Hẹn trả" strong value={dateTime(detail?.endDate || record.endsAt)} />
            </Card>
            {vehicles.map((vehicle, index) => (
              <Card key={`${vehicle.id}:${index}`} style={{ gap: 4 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>
                    Thông tin xe thuê số {index + 1}
                  </Text>
                  {vehicle.completedAt ? <StatusBadge status="completed" label="Đã trả" /> : null}
                </View>
                <KeyValueRow label="Tên xe" strong value={vehicle.name} />
                <KeyValueRow label="Biển số" strong valueColor={theme.primary} selectable value={vehicle.license} />
                <KeyValueRow label="Cơ sở quản lý xe lúc lập hợp đồng" value={vehicle.stockStoreName} />
                {!!vehicle.color && <KeyValueRow label="Màu xe" value={vehicle.color} />}
                {!!vehicle.typeText && <KeyValueRow label="Loại xe" value={vehicle.typeText} />}
                {!!vehicle.brand && <KeyValueRow label="Hãng xe" value={vehicle.brand} />}
                {!!vehicle.year && <KeyValueRow label="Đời xe" value={vehicle.year} />}
                {!!vehicle.driverName && <KeyValueRow label="Tên người lái" value={vehicle.driverName} />}
                {!!vehicle.driverLicenseNumber && <KeyValueRow label="Số GP lái xe" value={vehicle.driverLicenseNumber} />}
                {!!vehicle.driverLicenseIssuedOn && <KeyValueRow label="Ngày cấp GPLX" value={vehicle.driverLicenseIssuedOn} />}
                {!!vehicle.borrowHats && <KeyValueRow label="Số mũ mượn" value={vehicle.borrowHats} />}
                {!!vehicle.borrowRaincoats && <KeyValueRow label="Số áo mưa" value={vehicle.borrowRaincoats} />}
                <KeyValueRow label="Thuê lúc" value={vehicle.rentAt ? dateTime(vehicle.rentAt) : "—"} />
                <KeyValueRow label={vehicle.completedAt ? "Đã trả" : "Hẹn trả"} strong value={vehicle.completedAt ? dateTime(vehicle.completedAt) : vehicle.returnAt ? dateTime(vehicle.returnAt) : "—"} />
                {!!vehicle.rentAt && !!(vehicle.completedAt || vehicle.returnAt) && (
                  <KeyValueRow label="Số ngày thuê" value={`${rentalDayCount(vehicle.rentAt.slice(0, 16), (vehicle.completedAt || vehicle.returnAt).slice(0, 16)) || "—"} ngày`} />
                )}
              </Card>
            ))}
            <Button
              size="sm"
              secondary
              label="Ảnh biển số xe"
              icon={<FileText size={14} color={theme.text} />}
              onPress={() => router.push({ pathname: "/record-media/[entity]/[id]", params: { entity: "contracts", id } })}
            />
          </View>
        )}

        {/* TAB 02: HỢP ĐỒNG */}
        {activeTab === "contract" && (
          <View style={{ gap: 12 }}>
            <Card style={{ gap: 4 }}>
              <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 4 }]}>Thông tin hợp đồng & Pháp lý</Text>
              <KeyValueRow label="Mã hợp đồng / Số HĐ giấy" strong selectable value={detail?.code || record.code} />
              <KeyValueRow label="Trạng thái hợp đồng" value={contextualStatusLabel("contracts", status)} />
              <KeyValueRow label="Loại hợp đồng" value={detail?.contractTypeName || record.monitoring?.contractTypeName || "Thuê ngày / tháng"} />
              {isOwnership && !!detail?.ownershipTermMonths && (
                <KeyValueRow label="Thời hạn sở hữu" value={detail.ownershipTermMonths === "custom" ? "Chưa phân loại" : `${detail.ownershipTermMonths} tháng`} />
              )}
              <KeyValueRow label="Ngày ký hợp đồng" value={detail?.signedOn} />
              <KeyValueRow label="Ngày tạo / nhập hợp đồng" value={detail?.createdOn} />
              {!!detail?.customerSource && <KeyValueRow label="Nguồn khách" value={detail.customerSource} />}
              <KeyValueRow label="Cơ sở nguồn khách / doanh thu" value={detail?.storeName || record.storeName} />
              {!!detail?.vehicleStoreName && detail.vehicleStoreName !== detail.storeName && (
                <KeyValueRow label="Cửa hàng xe" value={detail.vehicleStoreName} />
              )}
              <KeyValueRow label="Nhân viên lập HĐ" value={detail?.staffName} />
              {!!detail?.salesStaffName && <KeyValueRow label="NVKD ghi nhận doanh số" value={detail.salesStaffName} />}
              {!!(detail?.billingNextDueAt || record.monitoring?.nextDueAt) && (
                <KeyValueRow label="Ngày hẹn cần đóng tiếp theo" strong valueColor={theme.primary} value={dateTime(detail?.billingNextDueAt || record.monitoring?.nextDueAt || "")} />
              )}
            </Card>

            <ContractApprovalSummary id={id} />

            <Card style={{ gap: 8 }}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Chỉnh sửa & phát hành</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {status !== "draft" && canEdit && (
                  <Button
                    size="sm"
                    equalWidth
                    secondary
                    label="Sửa hợp đồng"
                    icon={<FilePenLine size={14} color={theme.text} />}
                    onPress={() => router.push({ pathname: "/contract-edit/[id]", params: { id } })}
                  />
                )}
                <Button
                  size="sm"
                  equalWidth
                  label="In hợp đồng"
                  icon={<Printer size={14} color={theme.primaryText} />}
                  onPress={() => router.push({ pathname: "/print/[kind]/[id]", params: { kind: "contracts", id } })}
                />
              </View>
              {status !== "draft" && canEdit && (
                <Button
                  size="sm"
                  secondary
                  label="Bổ sung hồ sơ nhẹ (giữ duyệt & tiền/kho)"
                  onPress={() => router.push({ pathname: "/contract-edit/[id]", params: { id, mode: "profile" } })}
                />
              )}
              {isOwnership && (
                <Button
                  size="sm"
                  secondary
                  label="Sửa loại HĐ / mức đóng ngày"
                  onPress={() => router.push({ pathname: "/ownership-terms/[id]", params: { id } })}
                />
              )}
              {status !== "draft" && permissions.includes("contracts.return") && (
                <Button
                  size="sm"
                  secondary
                  label="Hồ sơ trả xe"
                  onPress={() => router.push({ pathname: "/return-correction/[id]", params: { id } })}
                />
              )}
            </Card>
          </View>
        )}

        {/* TAB 03: NỢ XẤU / BẢO LƯU */}
        {activeTab === "lifecycle" && (
          <View style={{ gap: 12 }}>
            <Card style={{ gap: 10 }}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Nợ xấu / bảo lưu</Text>
              {status === "draft" ? (
                <Text style={{ color: theme.muted, fontSize: 13.5, lineHeight: 20 }}>
                  Hợp đồng này đang Lưu nháp, chưa thể bảo lưu hoặc xử lý nợ xấu. Để bảo lưu, chọn hợp đồng thuê sở hữu đã phát hành ở trạng thái Đang thuê hoặc Quá hạn.
                </Text>
              ) : (
                <>
                  <KeyValueRow label="Trạng thái hiện tại" strong value={contextualStatusLabel("contracts", status)} />
                  {!!detail?.heldAt && <KeyValueRow label="Bắt đầu bảo lưu" value={dateTime(detail.heldAt)} />}
                  {!!detail?.holdUntil && <KeyValueRow label="Hạn bảo lưu" strong value={dateTime(detail.holdUntil)} />}
                  {!!detail?.badDebtClosedAt && <KeyValueRow label="Đóng hợp đồng nợ xấu lúc" value={dateTime(detail.badDebtClosedAt)} />}
                  <Button
                    size="sm"
                    label="Trạng thái & xử lý"
                    onPress={() => router.push({ pathname: "/contract-lifecycle/[id]", params: { id } })}
                  />
                  {permissions.includes("contracts.settle") && ["renting", "overdue", "wait_payment", "bad_debt", "completed"].includes(status) && (
                    <Button
                      size="sm"
                      secondary
                      label="Thanh toán và đóng hợp đồng"
                      onPress={() => router.push({ pathname: "/contract-operation/[action]/[id]", params: { id, action: "payment_settlement" } })}
                    />
                  )}
                  {(record.monitoring?.collectionOverdue || isBadDebt || status === "overdue") && (
                    <Button
                      size="sm"
                      secondary
                      label="Tình trạng khách và ghi chú công nợ"
                      onPress={() => router.push({ pathname: "/collection-followup/[id]", params: { id } })}
                    />
                  )}
                </>
              )}
            </Card>
          </View>
        )}

        {/* TAB 04: KHÁCH HÀNG (BÊN B) */}
        {activeTab === "customer" && (
          <View style={{ gap: 12 }}>
            <Card style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>Thông tin khách hàng (Bên B)</Text>
                <User size={17} color={theme.muted} />
              </View>
              {!!detail?.vehicleStoreName && <KeyValueRow label="Cửa hàng xe" value={detail.vehicleStoreName} />}
              <KeyValueRow label="Cơ sở nguồn khách / doanh thu" value={detail?.storeName || record.storeName} />
              {!!detail?.staffName && <KeyValueRow label="Đại diện ủy quyền Bên A" value={detail.staffName} />}
              <KeyValueRow label="Tên khách hàng" strong value={detail?.customer.name || record.name || "Chưa ghi nhận"} />
              <KeyValueRow label="SĐT" strong selectable valueColor={theme.primary} value={displayPhone} />
              <KeyValueRow label="Số CMTND/CCCD" selectable strong value={detail?.customer.idCard} />
              {!!detail?.customer.idCardIssuedOn && <KeyValueRow label="Ngày cấp CCCD" value={detail.customer.idCardIssuedOn} />}
              {!!detail?.customer.idCardIssuedBy && <KeyValueRow label="Nơi cấp CCCD" value={detail.customer.idCardIssuedBy} />}
              {!!detail?.customer.driverLicenseNumber && <KeyValueRow label="Số giấy phép lái xe" selectable value={detail.customer.driverLicenseNumber} />}
              {!!detail?.customer.driverLicenseIssuedOn && <KeyValueRow label="Ngày cấp GPLX" value={detail.customer.driverLicenseIssuedOn} />}
              <KeyValueRow label="Nơi ở hiện tại" selectable value={detail?.customer.address || record.address} />
              {!!detail?.customer.email && <KeyValueRow label="Email" selectable value={detail.customer.email} />}

              {!!(detail?.customer.customerNote || record.customerNote) && (
                <View style={[styles.noteBox, { backgroundColor: theme.warningBackground, borderColor: theme.warning }]}>
                  <Text style={{ color: theme.warning, fontSize: 12, fontWeight: "700" }}>Cảnh báo:</Text>
                  <Text selectable style={{ color: theme.text, fontSize: 13, lineHeight: 19 }}>
                    {detail?.customer.customerNote || record.customerNote}
                  </Text>
                </View>
              )}

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 8 }}>
                {canCall && (
                  <Button
                    size="sm"
                    label={`Gọi ${cleanPhone}`}
                    icon={<Phone size={14} color={theme.primaryText} />}
                    onPress={handleCall}
                  />
                )}
                {detail?.customer.id && permissions.includes("customers.read") && (
                  <Button
                    size="sm"
                    secondary
                    label="Mở hồ sơ khách"
                    onPress={() => router.push({ pathname: "/record/[kind]/[id]", params: { kind: "customers", id: String(detail.customer.id) } })}
                  />
                )}
                <Button
                  size="sm"
                  secondary
                  label="Giấy tờ và CCCD trong hợp đồng"
                  icon={<FileText size={14} color={theme.text} />}
                  onPress={() =>
                    router.push({
                      pathname: "/record-media/[entity]/[id]",
                      params: { entity: "contracts", id, kind: "rental", referenceId: id },
                    })
                  }
                />
              </View>
            </Card>

            {detail && detail.customer.relatives.length > 0 && (
              <Card style={{ gap: 6 }}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>Người thân ({detail.customer.relatives.length})</Text>
                {detail.customer.relatives.map((rel, idx) => (
                  <KeyValueRow
                    key={idx}
                    label={rel.relationship || `Người thân ${idx + 1}`}
                    selectable
                    value={`${rel.name}${rel.phone ? ` · ${rel.phone}` : ""}`}
                  />
                ))}
              </Card>
            )}
          </View>
        )}

        {/* TAB 05: CHI PHÍ */}
        {activeTab === "payment" && (
          <View style={{ gap: 12 }}>
            <Card style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <Text style={[styles.cardTitle, { color: theme.text, flex: 1 }]}>Phí thuê xe & Tiền cọc</Text>
                {canEditRentalTerms && (
                  <Button
                    size="sm"
                    secondary
                    label="Sửa giá thuê"
                    icon={<FilePenLine size={14} color={theme.text} />}
                    onPress={() => router.push({ pathname: "/rental-terms/[id]", params: { id } })}
                  />
                )}
              </View>

              <View style={styles.grid2}>
                <View style={[styles.gridCol, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>Tổng phí thuê xe</Text>
                  <Text style={{ color: theme.text, fontSize: 16, fontWeight: "800", marginTop: 3 }}>
                    {money(totalAmount)}
                  </Text>
                </View>

                <View style={[styles.gridCol, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>Đã thu tiền thuê</Text>
                  <Text style={{ color: theme.success, fontSize: 16, fontWeight: "800", marginTop: 3 }}>
                    {money(paidAmount)}
                  </Text>
                </View>
              </View>

              <View style={{ gap: 2 }}>
                <KeyValueRow label="Còn thiếu tiền thuê" strong valueColor={remaining && remaining > 0 ? theme.danger : theme.text} value={money(remaining)} />
                {detail?.packageName ? <KeyValueRow label="Gói thuê / Đơn giá áp dụng" value={`${detail.packageName}${detail.unitPrice != null ? ` · ${money(detail.unitPrice)}` : ""}`} /> : null}
                <KeyValueRow label="Số tiền đặt cọc" value={money(detail?.depositAmount ?? null)} />
                <KeyValueRow label="Cọc đã thu" valueColor={theme.success} value={money(detail?.depositPaid ?? null)} />
                <KeyValueRow label="Đã trả cọc" value={money(detail?.depositRefunded ?? null)} />
                <KeyValueRow label="Cọc đang giữ" strong valueColor={theme.primary} value={money(detail?.depositHeld ?? null)} />
                {!!detail?.paymentMethod && <KeyValueRow label="Hình thức thanh toán" value={detail.paymentMethod} />}
                {!!detail?.depositPaymentMethod && <KeyValueRow label="Hình thức đặt cọc" value={detail.depositPaymentMethod} />}
              </View>

              {detail && detail.extraCharges.length > 0 && (
                <View style={{ gap: 2, paddingTop: 6, borderTopWidth: 1, borderTopColor: theme.border }}>
                  <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: "700", marginBottom: 2 }}>Phí khác trong hợp đồng</Text>
                  {detail.extraCharges.map((ch, idx) => (
                    <KeyValueRow key={idx} label={ch.name || `Phí #${idx + 1}`} value={money(Number(ch.amount || 0))} />
                  ))}
                </View>
              )}

              {detail?.receipts && (
                <View style={{ gap: 2, paddingTop: 6, borderTopWidth: 1, borderTopColor: theme.border }}>
                  <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: "700", marginBottom: 2 }}>Tổng hợp phiếu đã duyệt</Text>
                  <KeyValueRow label="Tổng thu (đã duyệt)" valueColor={theme.success} value={money(detail.receipts.received)} />
                  <KeyValueRow label="Tổng chi (đã duyệt)" valueColor={theme.danger} value={money(detail.receipts.spent)} />
                  <KeyValueRow label="Chênh lệch" strong value={money(detail.receipts.net)} />
                </View>
              )}

              {record.monitoring && (
                <View style={{ gap: 2, paddingTop: 6, borderTopWidth: 1, borderTopColor: theme.border }}>
                  {record.monitoring.dueAmount !== null && (
                    <KeyValueRow
                      label="Tiền đến hạn còn thiếu"
                      strong
                      valueColor={record.monitoring.collectionOverdue ? theme.danger : theme.text}
                      value={money(record.monitoring.dueAmount)}
                    />
                  )}
                  {record.monitoring.lateFeeEstimate !== null && (
                    <KeyValueRow label="Phí quá hạn tạm tính" valueColor={theme.warning} value={money(record.monitoring.lateFeeEstimate)} />
                  )}
                  {record.monitoring.companyPaidAmount !== null && (
                    <KeyValueRow label="Đã vào TK công ty (SePay)" value={money(record.monitoring.companyPaidAmount)} />
                  )}
                </View>
              )}

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                {canPay && (
                  <Button
                    size="sm"
                    equalWidth
                    label="Điền sổ quỹ"
                    icon={<Wallet size={15} color={theme.primaryText} />}
                    onPress={() => router.push({ pathname: "/finance/[id]", params: { id } })}
                  />
                )}
                {status !== "cancelled" && (
                  <Button
                    size="sm"
                    equalWidth
                    secondary
                    label="Nhập phiếu chi"
                    icon={<QrCode size={15} color={theme.text} />}
                    onPress={() => router.push({ pathname: "/contract-qr/[id]", params: { id } })}
                  />
                )}
              </View>

              {!["draft", "cancelled"].includes(status) && permissions.some((p) => p === "contracts.draft" || p === "finance.write") && (
                <Button
                  size="sm"
                  secondary
                  label="Sửa tiền cọc / khoản đã thu"
                  onPress={() => router.push({ pathname: "/contract-correction/[kind]/[id]", params: { kind: "receipts", id } })}
                />
              )}
              {!["draft", "cancelled"].includes(status) && permissions.some((p) => p === "contracts.renew" || p === "finance.write") && (
                <Button
                  size="sm"
                  secondary
                  label="Sửa ngày / tiền thực thu gia hạn"
                  onPress={() => router.push({ pathname: "/contract-correction/[kind]/[id]", params: { kind: "renewal", id } })}
                />
              )}
              {permissions.includes("contracts.renew") && (
                <Button
                  size="sm"
                  secondary
                  label="Xem bill gia hạn đã lưu"
                  icon={<FileSpreadsheet size={15} color={theme.text} />}
                  onPress={() => router.push({ pathname: "/renewal-bill/[id]", params: { id } })}
                />
              )}
            </Card>
          </View>
        )}

        {/* TAB 06: PIN / SẠC */}
        {activeTab === "battery" && (
          <Card style={{ gap: 10 }}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Hợp đồng pin / sạc liên kết</Text>
            {status === "draft" ? (
              <Text style={{ color: theme.muted, fontSize: 13.5, lineHeight: 20 }}>
                Phát hành hợp đồng xe trước khi liên kết hợp đồng pin / sạc.
              </Text>
            ) : (
              <>
                <KeyValueRow label="Số hợp đồng pin / sạc liên kết" strong value={String(detail?.batteryCount ?? 0)} />
                <Button
                  size="sm"
                  label={`Thuê pin / sạc${detail?.batteryCount ? ` (${detail.batteryCount})` : ""}`}
                  icon={<BatteryCharging size={15} color={theme.primaryText} />}
                  onPress={() => router.push({ pathname: "/battery-contracts", params: { source: id } })}
                />
                {!isDraft && (
                  <Button
                    size="sm"
                    secondary
                    label="Đổi pin theo hợp đồng xe"
                    onPress={() => router.push({ pathname: "/contract-operation/[action]/[id]", params: { id, action: "battery_swap" } })}
                  />
                )}
              </>
            )}
          </Card>
        )}

        {/* TAB 07: KÝ KẾT & GHI CHÚ */}
        {activeTab === "signing" && (
          <View style={{ gap: 12 }}>
            <Card style={{ gap: 6 }}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Ký kết & Ghi chú</Text>
              <KeyValueRow label="Tài sản thế chấp / Đặt cọc tài sản" value={detail?.collateralDescription} />
              <KeyValueRow label="Người ký Bên A (Himoto)" value={detail?.staffName} />
              <KeyValueRow label="Người ký Bên B (Khách thuê)" value={detail?.customer.name || record.name} />
              <KeyValueRow label="Ghi chú hợp đồng" selectable value={detail?.notes} />
              <KeyValueRow label="Cảnh báo" selectable value={detail?.customer.customerNote || record.customerNote} />
            </Card>

            <Card style={{ gap: 8 }}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Hồ sơ & Chứng từ</Text>
              <Button
                size="sm"
                secondary
                label="Ảnh hợp đồng đã ký & bill chuyển khoản"
                icon={<FileText size={14} color={theme.text} />}
                onPress={() => router.push({ pathname: "/record-media/[entity]/[id]", params: { entity: "contracts", id, kind: "rental", referenceId: id } })}
              />
              <Button
                size="sm"
                label="In hợp đồng"
                icon={<Printer size={15} color={theme.primaryText} />}
                onPress={() => router.push({ pathname: "/print/[kind]/[id]", params: { kind: "contracts", id } })}
              />
              {status !== "draft" && canEdit && (
                <Button
                  size="sm"
                  secondary
                  label="Sửa hợp đồng"
                  icon={<FilePenLine size={15} color={theme.text} />}
                  onPress={() => router.push({ pathname: "/contract-edit/[id]", params: { id } })}
                />
              )}
              {status === "completed" && permissions.includes("contracts.delete") && (
                <Button
                  size="sm"
                  danger
                  disabled={hideBusy}
                  label="Ẩn hợp đồng"
                  icon={<Trash2 size={15} color={theme.danger} />}
                  onPress={() => setHideConfirm(true)}
                />
              )}
            </Card>
          </View>
        )}

        {/* TAB 08: LỊCH SỬ CHỈNH SỬA */}
        {activeTab === "changes" && <InlineChangesTab id={id} />}

        {/* TAB 09: LỊCH SỬ THU CHI */}
        {activeTab === "cashflow" && (
          <InlineCashflowTab
            id={id}
            status={status}
            canPay={canPay}
            remaining={remaining}
            depositHeld={depositHeld}
          />
        )}

        {/* TAB 10: ẢNH THUÊ / TRẢ XE */}
        {activeTab === "photos" && <ContractPhotosTab id={id} />}

        {/* TAB 11: TELEGRAM */}
        {activeTab === "telegram" && <InlineTelegramTab id={id} status={status} />}
      </ScrollView>

      {hideConfirm && (
        <ConfirmEdit
          title="Ẩn hợp đồng đã hoàn thành?"
          message={`Hợp đồng ${detail?.code || record.code} sẽ được ẩn khỏi danh sách đang quản lý. Lịch sử và phiếu thu/chi vẫn được giữ trên hệ thống.`}
          confirmLabel="Xác nhận ẩn hợp đồng"
          busy={hideBusy}
          onCancel={() => setHideConfirm(false)}
          onConfirm={() => { void submitHideContract(); }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerCard: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 6,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  vehicleSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  tabContainer: {
    paddingHorizontal: 16,
    paddingBottom: 6,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  scrollContent: {
    padding: 16,
    gap: 12,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  priorityCard: {
    gap: 10,
    padding: 14,
    borderWidth: 1.5,
    borderRadius: 14,
  },
  priorityBtnRow: {
    flexDirection: "row",
    gap: 8,
  },
  cardTitle: {
    fontSize: 15.5,
    fontWeight: "800",
  },
  noteBox: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    marginTop: 6,
  },
  grid2: {
    flexDirection: "row",
    gap: 8,
  },
  gridCol: {
    flex: 1,
    padding: 11,
    borderRadius: 10,
    borderWidth: 1,
  },
});
