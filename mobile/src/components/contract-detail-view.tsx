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
import {
  AlertTriangle,
  ArrowLeftRight,
  BatteryCharging,
  Bike,
  CalendarPlus,
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
import { contextualStatusLabel } from "@/lib/catalogue-config";
import { useSession } from "@/providers/session";
import { dateTime, money, useTheme } from "@/theme";
import { Button, Card, InlineError, StatusBadge } from "./ui";
import { SectionTabs } from "./section-tabs";
import { ContractApprovalSummary } from "./contract-approval-summary";

type ContractTab = "overview" | "customer" | "finance" | "actions";

const CONTRACT_TABS = [
  { id: "overview" as ContractTab, label: "Hợp đồng & Xe" },
  { id: "customer" as ContractTab, label: "Khách hàng" },
  { id: "finance" as ContractTab, label: "Chi phí & Thu chi" },
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
  const { session } = useSession();
  const [activeTab, setActiveTab] = useState<ContractTab>("overview");
  const [callError, setCallError] = useState("");

  const id = String(record.id);
  const permissions = session?.user.permissions || [];
  const cleanPhone = (record.phone || "").replace(/[\s().-]/g, "");
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

  const isRenting = ["renting", "overdue", "wait_payment"].includes(record.status);
  const isDraft = ["draft", "deposit_contract"].includes(record.status);
  const isBadDebt = record.status === "bad_debt";

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Contract Top Header */}
      <View style={styles.headerCard}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: theme.primary, fontSize: 13, fontWeight: "800", letterSpacing: 0.5 }}>
              HỢP ĐỒNG THUÊ XE
            </Text>
            <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 24, fontWeight: "800" }}>
              {record.code}
            </Text>
          </View>
          <StatusBadge
            status={record.status}
            label={contextualStatusLabel("contracts", record.status)}
          />
        </View>

        <View style={styles.vehicleSummaryRow}>
          <Bike size={16} color={theme.primary} />
          <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700" }}>
            {record.license || record.vehicleName || "Chưa có xe bàn giao"}
          </Text>
          {!!record.vehicleName && record.license !== record.vehicleName && (
            <Text style={{ color: theme.muted, fontSize: 13 }}>
              ({record.vehicleName})
            </Text>
          )}
          <Text style={{ color: theme.muted, fontSize: 13 }}>· {record.storeName}</Text>
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
            refreshing={isRefetching}
            tintColor={theme.primary}
            onRefresh={onRefresh}
          />
        }
      >
        {!!callError && <InlineError message={callError} />}

        {/* Quick Priority Action Bar for Active Contracts */}
        {isRenting && (
          <Card style={[styles.priorityCard, { borderColor: theme.primary, backgroundColor: theme.surface }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: "800" }}>
                Thao tác chính tại quầy
              </Text>
              <StatusBadge
                status={record.status}
                label={contextualStatusLabel("contracts", record.status)}
              />
            </View>

            <View style={styles.priorityBtnRow}>
              {permissions.includes("contracts.renew") && (
                <View style={{ flex: 1 }}>
                  <Button
                    label="Gia hạn"
                    icon={<CalendarPlus size={16} color={theme.primaryText} />}
                    onPress={() => router.push({ pathname: "/renewal/[id]", params: { id } })}
                  />
                </View>
              )}
              {permissions.includes("contracts.return") && (
                <View style={{ flex: 1 }}>
                  <Button
                    secondary
                    label="Trả xe"
                    icon={<RotateCcw size={16} color={theme.text} />}
                    onPress={() => router.push({ pathname: "/return-editor/[id]", params: { id } })}
                  />
                </View>
              )}
            </View>

            <View style={styles.priorityBtnRow}>
              {permissions.includes("contracts.return") && (
                <View style={{ flex: 1 }}>
                  <Button
                    secondary
                    label="Đổi xe"
                    icon={<ArrowLeftRight size={16} color={theme.text} />}
                    onPress={() => router.push({ pathname: "/swap-editor/[id]", params: { id } })}
                  />
                </View>
              )}
              {permissions.some((p) => p === "finance.read" || p === "finance.write") && (
                <View style={{ flex: 1 }}>
                  <Button
                    secondary
                    label="Thu / Chi"
                    icon={<Wallet size={16} color={theme.text} />}
                    onPress={() => router.push({ pathname: "/finance/[id]", params: { id } })}
                  />
                </View>
              )}
            </View>
          </Card>
        )}

        {/* Draft Quick Action */}
        {isDraft && (
          <Card style={[styles.priorityCard, { borderColor: theme.primary }]}>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: "800" }}>
              Xử lý Hợp đồng nháp / Giữ chỗ
            </Text>
            {permissions.includes("contracts.finalize") && (
              <Button
                label={record.status === "draft" ? "Rà soát & Phát hành hợp đồng" : "Xác nhận giao xe giữ chỗ"}
                onPress={() => router.push({ pathname: "/contract/[id]", params: { id } })}
              />
            )}
            {record.status === "draft" && permissions.includes("contracts.draft") && (
              <Button
                secondary
                label="Tiếp tục soạn hợp đồng"
                onPress={() => router.push({ pathname: "/draft/[id]", params: { id } })}
              />
            )}
          </Card>
        )}

        {/* Bad debt recovery */}
        {isBadDebt && permissions.includes("contracts.return") && (
          <Button
            danger
            label="Thu hồi xe nợ xấu"
            icon={<AlertTriangle size={18} color={theme.danger} />}
            onPress={() => router.push({ pathname: "/recovery-editor/[id]", params: { id } })}
          />
        )}

        {/* TAB 1: OVERVIEW & VEHICLE */}
        {activeTab === "overview" && (
          <View style={{ gap: 14 }}>
            <Card style={{ gap: 12, padding: 16 }}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Phương tiện bàn giao</Text>
              <View style={styles.infoRow}>
                <Text style={{ color: theme.muted, fontSize: 13 }}>Tên xe / Dòng xe</Text>
                <Text selectable style={{ color: theme.text, fontSize: 15, fontWeight: "700" }}>
                  {record.vehicleName || "—"}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={{ color: theme.muted, fontSize: 13 }}>Biển số xe</Text>
                <Text selectable style={{ color: theme.primary, fontSize: 16, fontWeight: "800" }}>
                  {record.license || "—"}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={{ color: theme.muted, fontSize: 13 }}>Cơ sở xuất xe</Text>
                <Text selectable style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}>
                  {record.storeName || "—"}
                </Text>
              </View>
            </Card>

            <Card style={{ gap: 12, padding: 16 }}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Thời hạn & Giao nhận</Text>
              <View style={styles.infoRow}>
                <Text style={{ color: theme.muted, fontSize: 13 }}>Bắt đầu thuê</Text>
                <Text selectable style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}>
                  {record.startsAt ? dateTime(record.startsAt) : "—"}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={{ color: theme.muted, fontSize: 13 }}>Hẹn trả dự kiến</Text>
                <Text selectable style={{ color: theme.text, fontSize: 14, fontWeight: "700" }}>
                  {record.endsAt ? dateTime(record.endsAt) : "—"}
                </Text>
              </View>
              {record.monitoring && (
                <>
                  <View style={styles.infoRow}>
                    <Text style={{ color: theme.muted, fontSize: 13 }}>Hình thức thuê</Text>
                    <Text selectable style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}>
                      {record.monitoring.contractTypeName || "Thuê ngày / tháng"}
                    </Text>
                  </View>
                  {!!record.monitoring.nextDueAt && (
                    <View style={styles.infoRow}>
                      <Text style={{ color: theme.muted, fontSize: 13 }}>Kỳ thanh toán tiếp theo</Text>
                      <Text selectable style={{ color: theme.primary, fontSize: 14, fontWeight: "700" }}>
                        {dateTime(record.monitoring.nextDueAt)}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </Card>

            <ContractApprovalSummary id={id} />
          </View>
        )}

        {/* TAB 2: CUSTOMER */}
        {activeTab === "customer" && (
          <View style={{ gap: 14 }}>
            <Card style={{ gap: 14, padding: 16 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>Thông tin Khách thuê (Bên B)</Text>
                <User size={18} color={theme.muted} />
              </View>

              <View style={styles.infoRow}>
                <Text style={{ color: theme.muted, fontSize: 13 }}>Họ và tên</Text>
                <Text selectable style={{ color: theme.text, fontSize: 17, fontWeight: "800" }}>
                  {record.name || "Chưa ghi nhận"}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={{ color: theme.muted, fontSize: 13 }}>Số điện thoại</Text>
                <Text selectable style={{ color: theme.primary, fontSize: 16, fontWeight: "700" }}>
                  {record.phone || "—"}
                </Text>
              </View>

              {canCall && (
                <Button
                  secondary
                  label={`Gọi khách hàng (${cleanPhone})`}
                  icon={<Phone size={16} color={theme.text} />}
                  onPress={handleCall}
                />
              )}

              {!!record.address && (
                <View style={styles.infoRow}>
                  <Text style={{ color: theme.muted, fontSize: 13 }}>Địa chỉ</Text>
                  <Text selectable style={{ color: theme.text, fontSize: 14, flex: 1, textAlign: "right" }}>
                    {record.address}
                  </Text>
                </View>
              )}

              {!!record.customerNote && (
                <View style={[styles.noteBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <Text style={{ color: theme.muted, fontSize: 12, fontWeight: "700" }}>Lưu ý hồ sơ:</Text>
                  <Text selectable style={{ color: theme.text, fontSize: 13, lineHeight: 20 }}>
                    {record.customerNote}
                  </Text>
                </View>
              )}

              <Button
                secondary
                label="Giấy tờ và CCCD của khách"
                icon={<FileText size={16} color={theme.text} />}
                onPress={() =>
                  router.push({
                    pathname: "/record-media/[entity]/[id]",
                    params: { entity: "customers", id },
                  })
                }
              />
            </Card>
          </View>
        )}

        {/* TAB 3: FINANCE & CASHFLOW */}
        {activeTab === "finance" && (
          <View style={{ gap: 14 }}>
            <Card style={{ gap: 14, padding: 16 }}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Bảng kê Chi phí Hợp đồng</Text>

              <View style={styles.grid2}>
                <View style={[styles.gridCol, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>Tổng giá trị HĐ</Text>
                  <Text style={{ color: theme.text, fontSize: 17, fontWeight: "800", marginTop: 4 }}>
                    {record.totalAmount !== null ? money(record.totalAmount) : "—"}
                  </Text>
                </View>

                <View style={[styles.gridCol, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>Đã thanh toán</Text>
                  <Text style={{ color: theme.success, fontSize: 17, fontWeight: "800", marginTop: 4 }}>
                    {record.paidAmount !== null ? money(record.paidAmount) : "—"}
                  </Text>
                </View>
              </View>

              {record.monitoring && (
                <View style={{ gap: 8 }}>
                  {record.monitoring.dueAmount !== null && (
                    <View style={styles.infoRow}>
                      <Text style={{ color: theme.muted, fontSize: 13 }}>Khoản phải đóng theo kỳ</Text>
                      <Text style={{ color: record.monitoring.collectionOverdue ? theme.danger : theme.text, fontSize: 15, fontWeight: "700" }}>
                        {money(record.monitoring.dueAmount)}
                      </Text>
                    </View>
                  )}

                  {record.monitoring.rentalDebt !== null && (
                    <View style={styles.infoRow}>
                      <Text style={{ color: theme.muted, fontSize: 13 }}>Tiền thuê còn thiếu</Text>
                      <Text style={{ color: theme.danger, fontSize: 15, fontWeight: "700" }}>
                        {money(record.monitoring.rentalDebt)}
                      </Text>
                    </View>
                  )}

                  {record.monitoring.lateFeeEstimate !== null && (
                    <View style={styles.infoRow}>
                      <Text style={{ color: theme.muted, fontSize: 13 }}>Phí quá hạn tạm tính</Text>
                      <Text style={{ color: theme.warning, fontSize: 15, fontWeight: "700" }}>
                        {money(record.monitoring.lateFeeEstimate)}
                      </Text>
                    </View>
                  )}

                  {record.monitoring.companyPaidAmount !== null && (
                    <View style={styles.infoRow}>
                      <Text style={{ color: theme.muted, fontSize: 13 }}>Đã vào TK công ty (SePay)</Text>
                      <Text style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}>
                        {money(record.monitoring.companyPaidAmount)}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Quick links to cashflow and QR */}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    secondary
                    label="Phiếu thu / chi"
                    icon={<Wallet size={16} color={theme.text} />}
                    onPress={() => router.push({ pathname: "/contract-history/[id]", params: { id } })}
                  />
                </View>
                {record.status !== "cancelled" && (
                  <View style={{ flex: 1 }}>
                    <Button
                      secondary
                      label="Mã QR CK"
                      icon={<QrCode size={16} color={theme.text} />}
                      onPress={() => router.push({ pathname: "/contract-qr/[id]", params: { id } })}
                    />
                  </View>
                )}
              </View>
            </Card>
          </View>
        )}

        {/* TAB 4: ACTIONS & TOOLS (Nghiệp vụ quầy) */}
        {activeTab === "actions" && (
          <View style={{ gap: 14 }}>
            {/* Tiện ích in ấn & truyền thông */}
            <Card style={{ gap: 12, padding: 16 }}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Tiện ích & Tra cứu</Text>
              
              <View style={styles.actionGrid2}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Xem giấy và in"
                  onPress={() => router.push({ pathname: "/print/[kind]/[id]", params: { kind: "contracts", id } })}
                  style={({ pressed }) => [styles.gridItem, { borderColor: theme.border }, pressed && { opacity: 0.7 }]}
                >
                  <Printer size={20} color={theme.text} />
                  <Text style={[styles.gridItemText, { color: theme.text }]}>Xem giấy / In HĐ</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Mã QR SePay"
                  onPress={() => router.push({ pathname: "/contract-qr/[id]", params: { id } })}
                  style={({ pressed }) => [styles.gridItem, { borderColor: theme.border }, pressed && { opacity: 0.7 }]}
                >
                  <QrCode size={20} color={theme.text} />
                  <Text style={[styles.gridItemText, { color: theme.text }]}>Mã QR CK</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Lịch sử thu chi"
                  onPress={() => router.push({ pathname: "/contract-history/[id]", params: { id } })}
                  style={({ pressed }) => [styles.gridItem, { borderColor: theme.border }, pressed && { opacity: 0.7 }]}
                >
                  <Wallet size={20} color={theme.text} />
                  <Text style={[styles.gridItemText, { color: theme.text }]}>Sổ quỹ thu/chi</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Thông báo Telegram"
                  onPress={() => router.push({ pathname: "/contract-telegram/[id]", params: { id } })}
                  style={({ pressed }) => [styles.gridItem, { borderColor: theme.border }, pressed && { opacity: 0.7 }]}
                >
                  <MessageCircle size={20} color={theme.text} />
                  <Text style={[styles.gridItemText, { color: theme.text }]}>Telegram</Text>
                </Pressable>
              </View>

              {permissions.includes("contracts.renew") && (
                <Button
                  secondary
                  label="Xem bill gia hạn đã lưu"
                  icon={<FileSpreadsheet size={16} color={theme.text} />}
                  onPress={() => router.push({ pathname: "/renewal-bill/[id]", params: { id } })}
                />
              )}

              <Button
                secondary
                label="Hợp đồng Pin / sạc kèm theo"
                icon={<BatteryCharging size={16} color={theme.text} />}
                onPress={() => router.push({ pathname: "/battery-contracts", params: { source: id } })}
              />

              {record.reminderEligible && permissions.some((p) => p === "contracts.draft" || p === "finance.write") && (
                <Button
                  secondary
                  label="Soạn tin nhắc nợ Zalo"
                  icon={<MessageCircle size={16} color={theme.text} />}
                  onPress={() => router.push({ pathname: "/reminder-editor/[id]", params: { id } })}
                />
              )}

              <Button
                secondary
                label="Ảnh bàn giao & Trả xe"
                icon={<FileText size={16} color={theme.text} />}
                onPress={() =>
                  router.push({
                    pathname: "/record-media/[entity]/[id]",
                    params: { entity: "contracts", id },
                  })
                }
              />
            </Card>

            {/* Hồ sơ & Điều chỉnh nghiệp vụ */}
            <Card style={{ gap: 10, padding: 16 }}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Hồ sơ & Điều chỉnh</Text>

              {record.status === "draft" && permissions.includes("contracts.draft") && (
                <Button
                  danger
                  label="Xóa hợp đồng nháp trên máy chủ"
                  icon={<Trash2 size={16} color={theme.danger} />}
                  onPress={() => router.push({ pathname: "/draft-delete/[id]", params: { id } })}
                />
              )}

              {record.status !== "draft" && (session?.user.role === "admin" || permissions.includes("contracts.draft")) && (
                <>
                  <Button
                    secondary
                    label="Chỉnh sửa toàn bộ hợp đồng"
                    icon={<FilePenLine size={16} color={theme.text} />}
                    onPress={() => router.push({ pathname: "/contract-edit/[id]", params: { id } })}
                  />
                  {record.status !== "cancelled" && !["ownership", "ownership_cd"].includes(record.monitoring?.rentalType || "") && (
                    <Button
                      secondary
                      label="Sửa tiền / ngày thuê"
                      onPress={() => router.push({ pathname: "/rental-terms/[id]", params: { id } })}
                    />
                  )}
                </>
              )}

              {!["draft", "cancelled"].includes(record.status) && permissions.some((p) => p === "contracts.draft" || p === "finance.write") && (
                <Button
                  secondary
                  label="Sửa tiền cọc / khoản đã thu"
                  onPress={() => router.push({ pathname: "/contract-correction/[kind]/[id]", params: { kind: "receipts", id } })}
                />
              )}

              {!["draft", "cancelled"].includes(record.status) && permissions.some((p) => p === "contracts.renew" || p === "finance.write") && (
                <Button
                  secondary
                  label="Sửa ngày / tiền thực thu gia hạn"
                  onPress={() => router.push({ pathname: "/contract-correction/[kind]/[id]", params: { kind: "renewal", id } })}
                />
              )}

              {["ownership", "ownership_cd"].includes(record.monitoring?.rentalType || "") && (
                <Button
                  secondary
                  label="Thời hạn / mức đóng thuê sở hữu"
                  onPress={() => router.push({ pathname: "/ownership-terms/[id]", params: { id } })}
                />
              )}

              {record.status !== "draft" && (
                <Button
                  secondary
                  label="Tình trạng xe / nợ / bảo lưu"
                  onPress={() => router.push({ pathname: "/contract-lifecycle/[id]", params: { id } })}
                />
              )}

              {record.status !== "draft" && permissions.includes("contracts.return") && (
                <Button
                  secondary
                  label="Sửa hồ sơ / quyết toán xe đã trả"
                  onPress={() => router.push({ pathname: "/return-correction/[id]", params: { id } })}
                />
              )}
            </Card>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerCard: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  vehicleSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  tabContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  priorityCard: {
    gap: 12,
    padding: 16,
    borderWidth: 2,
    borderRadius: 16,
  },
  priorityBtnRow: {
    flexDirection: "row",
    gap: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3,
  },
  noteBox: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  grid2: {
    flexDirection: "row",
    gap: 10,
  },
  gridCol: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionGrid2: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  gridItem: {
    width: "48%",
    flexGrow: 1,
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 10,
  },
  gridItemText: {
    fontSize: 13,
    fontWeight: "600",
  },
});

