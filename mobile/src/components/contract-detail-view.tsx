import React, { useState } from "react";
import {
  Linking,
  Pressable,
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

type ContractTab = "overview" | "customer" | "finance" | "photos" | "actions";

const CONTRACT_TABS = [
  { id: "overview" as ContractTab, label: "Hợp đồng & Xe" },
  { id: "customer" as ContractTab, label: "Khách hàng" },
  { id: "finance" as ContractTab, label: "Chi phí & Thu chi" },
  { id: "photos" as ContractTab, label: "Ảnh thuê / trả xe" },
  { id: "actions" as ContractTab, label: "Nghiệp vụ quầy" },
] as const;

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
  const [activeTab, setActiveTab] = useState<ContractTab>("overview");
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

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Contract Top Header */}
      <View style={styles.headerCard}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: theme.primary, fontSize: 12, fontWeight: "800", letterSpacing: 0.5 }}>
              HỢP ĐỒNG THUÊ XE{detail?.contractTypeName ? ` · ${detail.contractTypeName.toUpperCase()}` : ""}
            </Text>
            <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 22, fontWeight: "800" }}>
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

      {/* Tabs */}
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

        {/* Quick Priority Action Bar for Active & Bad-Debt Contracts */}
        {(isRenting || isBadDebt) && (
          <Card style={[styles.priorityCard, { borderColor: theme.primary, backgroundColor: theme.surface }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: theme.text, fontSize: 15.5, fontWeight: "800" }}>
                Thao tác chính tại quầy
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
                  label="Thu / Chi"
                  icon={<Wallet size={15} color={theme.text} />}
                  onPress={() => router.push({ pathname: "/finance/[id]", params: { id } })}
                />
              )}
            </View>

            <Button
              size="sm"
              secondary
              label="Gửi Telegram"
              icon={<MessageCircle size={15} color={theme.text} />}
              onPress={() =>
                router.push({
                  pathname: "/contract-telegram/[id]",
                  params: { id, ...(status === "wait_payment" ? { eventKind: "return" } : {}) },
                })
              }
            />

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

        {/* Draft / Deposit Quick Action */}
        {isDraft && (
          <Card style={[styles.priorityCard, { borderColor: theme.primary }]}>
            <Text style={{ color: theme.text, fontSize: 15.5, fontWeight: "800" }}>
              Xử lý Hợp đồng nháp / Giữ chỗ
            </Text>
            {permissions.includes("contracts.finalize") && (
              <Button
                size="sm"
                label={status === "draft" ? "Rà soát & Phát hành hợp đồng" : "Xác nhận giao xe giữ chỗ"}
                onPress={() => router.push({ pathname: "/contract/[id]", params: { id } })}
              />
            )}
            {status === "draft" && permissions.includes("contracts.draft") && (
              <Button
                size="sm"
                secondary
                label="Tiếp tục soạn hợp đồng"
                onPress={() => router.push({ pathname: "/draft/[id]", params: { id } })}
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
                label="Gửi Telegram hợp đồng cọc"
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
          </Card>
        )}

        {/* Bad debt recovery (active bad_debt OR closed bad_debt_closed_at) */}
        {canRecoverVehicle && (
          <Button
            size="sm"
            danger
            label="Thu hồi xe nợ xấu"
            icon={<AlertTriangle size={16} color={theme.danger} />}
            onPress={() => router.push({ pathname: "/recovery-editor/[id]", params: { id } })}
          />
        )}

        {/* TAB 1: OVERVIEW & VEHICLES */}
        {activeTab === "overview" && (
          <View style={{ gap: 12 }}>
            {(detail?.vehicles.length ? detail.vehicles : [{
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
            }]).map((vehicle, index) => (
              <Card key={`${vehicle.id}:${index}`} style={{ gap: 4 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>
                    Phương tiện #{index + 1} · {vehicle.license || vehicle.name || "Chưa chọn"}
                  </Text>
                  {vehicle.completedAt ? (
                    <StatusBadge status="completed" label="Đã trả" />
                  ) : null}
                </View>
                <KeyValueRow label="Tên xe" strong value={vehicle.name} />
                <KeyValueRow label="Biển số" strong valueColor={theme.primary} selectable value={vehicle.license} />
                <KeyValueRow label="Kho xe lúc lập HĐ" value={vehicle.stockStoreName} />
                {!!(vehicle.brand || vehicle.color || vehicle.year) && (
                  <KeyValueRow label="Hãng / Màu / Đời" value={[vehicle.brand, vehicle.color, vehicle.year].filter(Boolean).join(" · ")} />
                )}
                {!!vehicle.typeText && <KeyValueRow label="Loại xe" value={vehicle.typeText} />}
                {!!vehicle.driverName && <KeyValueRow label="Người lái" value={vehicle.driverName} />}
                {!!vehicle.driverLicenseNumber && (
                  <KeyValueRow label="GPLX người lái" value={`${vehicle.driverLicenseNumber}${vehicle.driverLicenseIssuedOn ? ` (${vehicle.driverLicenseIssuedOn})` : ""}`} />
                )}
                {!!(vehicle.borrowHats || vehicle.borrowRaincoats) && (
                  <KeyValueRow label="Phụ kiện mượn" value={`${vehicle.borrowHats || "0"} mũ · ${vehicle.borrowRaincoats || "0"} áo mưa`} />
                )}
                <KeyValueRow label="Nhận xe" value={vehicle.rentAt ? dateTime(vehicle.rentAt) : "—"} />
                <KeyValueRow label={vehicle.completedAt ? "Đã trả thực tế" : "Hẹn trả"} strong value={vehicle.completedAt ? dateTime(vehicle.completedAt) : vehicle.returnAt ? dateTime(vehicle.returnAt) : "—"} />
                {!!vehicle.rentAt && !!(vehicle.completedAt || vehicle.returnAt) && (
                  <KeyValueRow label="Số ngày thuê" value={`${rentalDayCount(vehicle.rentAt.slice(0, 16), (vehicle.completedAt || vehicle.returnAt).slice(0, 16)) || "—"} ngày`} />
                )}
              </Card>
            ))}

            <Card style={{ gap: 4 }}>
              <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 4 }]}>Thông tin hợp đồng & Pháp lý</Text>
              <KeyValueRow label="Mã / Số HĐ" strong selectable value={detail?.code || record.code} />
              <KeyValueRow label="Hình thức / Loại HĐ" value={detail?.contractTypeName || record.monitoring?.contractTypeName || "Thuê ngày / tháng"} />
              {isOwnership && !!detail?.ownershipTermMonths && (
                <KeyValueRow label="Thời hạn sở hữu" value={detail.ownershipTermMonths === "custom" ? "Chưa phân loại" : `${detail.ownershipTermMonths} tháng`} />
              )}
              <KeyValueRow label="Cơ sở nguồn khách / doanh thu" value={detail?.storeName || record.storeName} />
              {!!detail?.vehicleStoreName && detail.vehicleStoreName !== detail.storeName && (
                <KeyValueRow label="Cửa hàng xuất xe" value={detail.vehicleStoreName} />
              )}
              <KeyValueRow label="Nhân viên lập HĐ" value={detail?.staffName} />
              {!!detail?.salesStaffName && <KeyValueRow label="NVKD ghi nhận" value={detail.salesStaffName} />}
              {!!detail?.customerSource && <KeyValueRow label="Nguồn khách" value={detail.customerSource} />}
              <KeyValueRow label="Ngày ký" value={detail?.signedOn} />
              <KeyValueRow label="Ngày tạo / nhập" value={detail?.createdOn} />
              {!!detail?.collateralDescription && <KeyValueRow label="Tài sản thế chấp" value={detail.collateralDescription} />}
              {!!detail?.notes && <KeyValueRow label="Ghi chú HĐ" selectable value={detail.notes} />}
              {!!(detail?.billingNextDueAt || record.monitoring?.nextDueAt) && (
                <KeyValueRow label="Kỳ thanh toán tiếp theo" strong valueColor={theme.primary} value={dateTime(detail?.billingNextDueAt || record.monitoring?.nextDueAt || "")} />
              )}
            </Card>

            <ContractApprovalSummary id={id} />
          </View>
        )}

        {/* TAB 2: CUSTOMER */}
        {activeTab === "customer" && (
          <View style={{ gap: 12 }}>
            <Card style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>Thông tin Khách thuê (Bên B)</Text>
                <User size={17} color={theme.muted} />
              </View>
              <KeyValueRow label="Họ và tên" strong value={detail?.customer.name || record.name || "Chưa ghi nhận"} />
              <KeyValueRow label="Số điện thoại" strong selectable valueColor={theme.primary} value={displayPhone} />
              <KeyValueRow label="Số CCCD / Hộ chiếu" selectable strong value={detail?.customer.idCard} />
              {!!detail?.customer.idCardIssuedOn && <KeyValueRow label="Ngày cấp CCCD" value={detail.customer.idCardIssuedOn} />}
              {!!detail?.customer.idCardIssuedBy && <KeyValueRow label="Nơi cấp CCCD" value={detail.customer.idCardIssuedBy} />}
              {!!detail?.customer.driverLicenseNumber && <KeyValueRow label="Số GPLX" selectable value={detail.customer.driverLicenseNumber} />}
              {!!detail?.customer.driverLicenseIssuedOn && <KeyValueRow label="Ngày cấp GPLX" value={detail.customer.driverLicenseIssuedOn} />}
              <KeyValueRow label="Địa chỉ" selectable value={detail?.customer.address || record.address} />
              {!!detail?.customer.email && <KeyValueRow label="Email" selectable value={detail.customer.email} />}

              {!!(detail?.customer.customerNote || record.customerNote) && (
                <View style={[styles.noteBox, { backgroundColor: theme.warningBackground, borderColor: theme.warning }]}>
                  <Text style={{ color: theme.warning, fontSize: 12, fontWeight: "700" }}>Lưu ý hồ sơ:</Text>
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

        {/* TAB 3: FINANCE & CASHFLOW */}
        {activeTab === "finance" && (
          <View style={{ gap: 12 }}>
            <Card style={{ gap: 12 }}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Bảng kê Chi phí & Tiền cọc</Text>

              <View style={styles.grid2}>
                <View style={[styles.gridCol, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>Tổng giá trị HĐ</Text>
                  <Text style={{ color: theme.text, fontSize: 16, fontWeight: "800", marginTop: 3 }}>
                    {money(detail?.totalAmount ?? record.totalAmount)}
                  </Text>
                </View>

                <View style={[styles.gridCol, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>Đã thanh toán thuê</Text>
                  <Text style={{ color: theme.success, fontSize: 16, fontWeight: "800", marginTop: 3 }}>
                    {money(detail?.paidAmount ?? record.paidAmount)}
                  </Text>
                </View>
              </View>

              <View style={{ gap: 2 }}>
                {detail?.packageName ? <KeyValueRow label="Gói thuê / Đơn giá" value={`${detail.packageName}${detail.unitPrice != null ? ` · ${money(detail.unitPrice)}` : ""}`} /> : null}
                <KeyValueRow label="Cọc thỏa thuận" value={money(detail?.depositAmount ?? null)} />
                <KeyValueRow label="Cọc đã thu" valueColor={theme.success} value={money(detail?.depositPaid ?? null)} />
                <KeyValueRow label="Cọc đã hoàn" value={money(detail?.depositRefunded ?? null)} />
                <KeyValueRow label="Cọc đang giữ" strong valueColor={theme.primary} value={money(detail?.depositHeld ?? null)} />
                {!!detail?.paymentMethod && <KeyValueRow label="HT thu thuê" value={detail.paymentMethod} />}
                {!!detail?.depositPaymentMethod && <KeyValueRow label="HT thu cọc" value={detail.depositPaymentMethod} />}
              </View>

              {detail && detail.extraCharges.length > 0 && (
                <View style={{ gap: 2, paddingTop: 6, borderTopWidth: 1, borderTopColor: theme.border }}>
                  <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: "700", marginBottom: 2 }}>Phí khác</Text>
                  {detail.extraCharges.map((ch, idx) => (
                    <KeyValueRow key={idx} label={ch.name || `Phí #${idx + 1}`} value={money(Number(ch.amount || 0))} />
                  ))}
                </View>
              )}

              {detail?.receipts && (
                <View style={{ gap: 2, paddingTop: 6, borderTopWidth: 1, borderTopColor: theme.border }}>
                  <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: "700", marginBottom: 2 }}>Tổng hợp phiếu đã duyệt</Text>
                  <KeyValueRow label="Tổng thu thực tế" valueColor={theme.success} value={money(detail.receipts.received)} />
                  <KeyValueRow label="Tổng chi / hoàn" valueColor={theme.danger} value={money(detail.receipts.spent)} />
                  <KeyValueRow label="Thu ròng" strong value={money(detail.receipts.net)} />
                </View>
              )}

              {record.monitoring && (
                <View style={{ gap: 2, paddingTop: 6, borderTopWidth: 1, borderTopColor: theme.border }}>
                  {record.monitoring.dueAmount !== null && (
                    <KeyValueRow
                      label="Khoản phải đóng theo kỳ"
                      strong
                      valueColor={record.monitoring.collectionOverdue ? theme.danger : theme.text}
                      value={money(record.monitoring.dueAmount)}
                    />
                  )}
                  {record.monitoring.rentalDebt !== null && (
                    <KeyValueRow label="Tiền thuê còn thiếu" strong valueColor={theme.danger} value={money(record.monitoring.rentalDebt)} />
                  )}
                  {record.monitoring.lateFeeEstimate !== null && (
                    <KeyValueRow label="Phí quá hạn tạm tính" valueColor={theme.warning} value={money(record.monitoring.lateFeeEstimate)} />
                  )}
                  {record.monitoring.companyPaidAmount !== null && (
                    <KeyValueRow label="Đã vào TK công ty (SePay)" value={money(record.monitoring.companyPaidAmount)} />
                  )}
                </View>
              )}

              {/* Quick links to cashflow and QR */}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                <Button
                  size="sm"
                  equalWidth
                  secondary
                  label="Phiếu thu / chi"
                  icon={<Wallet size={15} color={theme.text} />}
                  onPress={() => router.push({ pathname: "/contract-history/[id]", params: { id, tab: "cashflow" } })}
                />
                {status !== "cancelled" && (
                  <Button
                    size="sm"
                    equalWidth
                    secondary
                    label="Mã QR CK"
                    icon={<QrCode size={15} color={theme.text} />}
                    onPress={() => router.push({ pathname: "/contract-qr/[id]", params: { id } })}
                  />
                )}
              </View>
            </Card>
          </View>
        )}

        {/* TAB 4: PHOTOS (Ảnh thuê / trả xe) */}
        {activeTab === "photos" && <ContractPhotosTab id={id} />}

        {/* TAB 5: ACTIONS & TOOLS (Nghiệp vụ quầy) */}
        {activeTab === "actions" && (
          <View style={{ gap: 12 }}>
            {/* Tiện ích in ấn & truyền thông */}
            <Card style={{ gap: 10 }}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Tiện ích & Tra cứu</Text>

              <View style={styles.actionGrid2}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Xem giấy và in"
                  onPress={() => router.push({ pathname: "/print/[kind]/[id]", params: { kind: "contracts", id } })}
                  style={({ pressed }) => [styles.gridItem, { borderColor: theme.border }, pressed && { opacity: 0.7 }]}
                >
                  <Printer size={18} color={theme.text} />
                  <Text style={[styles.gridItemText, { color: theme.text }]}>Xem giấy / In HĐ</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Mã QR SePay"
                  onPress={() => router.push({ pathname: "/contract-qr/[id]", params: { id } })}
                  style={({ pressed }) => [styles.gridItem, { borderColor: theme.border }, pressed && { opacity: 0.7 }]}
                >
                  <QrCode size={18} color={theme.text} />
                  <Text style={[styles.gridItemText, { color: theme.text }]}>Mã QR CK</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Lịch sử thu chi"
                  onPress={() => router.push({ pathname: "/contract-history/[id]", params: { id, tab: "cashflow" } })}
                  style={({ pressed }) => [styles.gridItem, { borderColor: theme.border }, pressed && { opacity: 0.7 }]}
                >
                  <Wallet size={18} color={theme.text} />
                  <Text style={[styles.gridItemText, { color: theme.text }]}>Lịch sử thu chi</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Lịch sử chỉnh sửa"
                  onPress={() => router.push({ pathname: "/contract-history/[id]", params: { id, tab: "changes" } })}
                  style={({ pressed }) => [styles.gridItem, { borderColor: theme.border }, pressed && { opacity: 0.7 }]}
                >
                  <FilePenLine size={18} color={theme.text} />
                  <Text style={[styles.gridItemText, { color: theme.text }]}>Lịch sử chỉnh sửa</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Thông báo Telegram"
                  onPress={() => router.push({ pathname: "/contract-telegram/[id]", params: { id, ...(status === "completed" || status === "wait_payment" ? { eventKind: "return" } : {}) } })}
                  style={({ pressed }) => [styles.gridItem, { borderColor: theme.border }, pressed && { opacity: 0.7 }]}
                >
                  <MessageCircle size={18} color={theme.text} />
                  <Text style={[styles.gridItemText, { color: theme.text }]}>Telegram</Text>
                </Pressable>
              </View>

              {permissions.includes("contracts.renew") && (
                <Button
                  size="sm"
                  secondary
                  label="Xem bill gia hạn đã lưu"
                  icon={<FileSpreadsheet size={15} color={theme.text} />}
                  onPress={() => router.push({ pathname: "/renewal-bill/[id]", params: { id } })}
                />
              )}

              <Button
                size="sm"
                secondary
                label={`Hợp đồng Pin / sạc kèm theo${detail?.batteryCount ? ` (${detail.batteryCount})` : ""}`}
                icon={<BatteryCharging size={15} color={theme.text} />}
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
              {permissions.includes("contracts.settle") && ["renting", "overdue", "wait_payment", "bad_debt", "completed"].includes(status) && (
                <Button
                  size="sm"
                  secondary
                  label="Thanh toán và đóng hợp đồng"
                  onPress={() => router.push({ pathname: "/contract-operation/[action]/[id]", params: { id, action: "payment_settlement" } })}
                />
              )}

              {record.reminderEligible && permissions.some((p) => p === "contracts.draft" || p === "finance.write") && (
                <Button
                  size="sm"
                  secondary
                  label="Soạn tin nhắc nợ Zalo"
                  icon={<MessageCircle size={15} color={theme.text} />}
                  onPress={() => router.push({ pathname: "/reminder-editor/[id]", params: { id } })}
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

              <Button
                size="sm"
                secondary
                label="Ảnh bàn giao & Trả xe"
                icon={<FileText size={15} color={theme.text} />}
                onPress={() =>
                  router.push({
                    pathname: "/record-media/[entity]/[id]",
                    params: { entity: "contracts", id },
                  })
                }
              />
            </Card>

            {/* Hồ sơ & Điều chỉnh nghiệp vụ */}
            <Card style={{ gap: 9 }}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Hồ sơ & Điều chỉnh</Text>

              {status === "draft" && permissions.includes("contracts.draft") && (
                <Button
                  size="sm"
                  danger
                  label="Xóa hợp đồng nháp trên máy chủ"
                  icon={<Trash2 size={15} color={theme.danger} />}
                  onPress={() => router.push({ pathname: "/draft-delete/[id]", params: { id } })}
                />
              )}

              {status !== "draft" && canEdit && (
                <>
                  <Button
                    size="sm"
                    secondary
                    label="Bổ sung hồ sơ nhẹ (giữ duyệt & tiền/kho)"
                    icon={<FilePenLine size={15} color={theme.text} />}
                    onPress={() => router.push({ pathname: "/contract-edit/[id]", params: { id, mode: "profile" } })}
                  />
                  <Button
                    size="sm"
                    secondary
                    label="Chỉnh sửa toàn bộ hợp đồng"
                    icon={<FilePenLine size={15} color={theme.text} />}
                    onPress={() => router.push({ pathname: "/contract-edit/[id]", params: { id } })}
                  />
                  {status !== "cancelled" && !isOwnership && (
                    <Button
                      size="sm"
                      secondary
                      label="Sửa tiền / ngày thuê"
                      onPress={() => router.push({ pathname: "/rental-terms/[id]", params: { id } })}
                    />
                  )}
                </>
              )}

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

              {isOwnership && (
                <Button
                  size="sm"
                  secondary
                  label="Thời hạn / mức đóng thuê sở hữu"
                  onPress={() => router.push({ pathname: "/ownership-terms/[id]", params: { id } })}
                />
              )}

              {status !== "draft" && (
                <Button
                  size="sm"
                  secondary
                  label="Tình trạng xe / nợ / bảo lưu"
                  onPress={() => router.push({ pathname: "/contract-lifecycle/[id]", params: { id } })}
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

              {status === "completed" && permissions.includes("contracts.delete") && (
                <Button
                  size="sm"
                  danger
                  disabled={hideBusy}
                  label="Ẩn hợp đồng đã hoàn thành"
                  icon={<Trash2 size={15} color={theme.danger} />}
                  onPress={() => setHideConfirm(true)}
                />
              )}
            </Card>
          </View>
        )}
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
  actionGrid2: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  gridItem: {
    width: "48%",
    flexGrow: 1,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 10,
  },
  gridItemText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
