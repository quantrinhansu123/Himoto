import React from "react";
import {
  Modal,
  Pressable,
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
  CalendarPlus,
  CarFront,
  Eye,
  FilePenLine,
  Files,
  History,
  MessageCircle,
  Printer,
  QrCode,
  RotateCcw,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react-native";
import type { CatalogueKind, MobileRecord } from "@himoto/mobile-contract";
import { contextualStatusLabel } from "@/lib/catalogue-config";
import { StatusBadge } from "@/components/ui";
import { statuses, useTheme } from "@/theme";

interface RecordActionItem {
  id: string;
  label: string;
  description?: string;
  blockedReason?: string;
  icon: React.ComponentType<{ size: number; color: string }>;
  color?: string;
  onPress?: () => void;
}

export function RecordActionsModal({
  visible,
  onClose,
  kind,
  record,
  permissions,
}: {
  visible: boolean;
  onClose: () => void;
  kind: CatalogueKind;
  record: MobileRecord | null;
  permissions: readonly string[];
}) {
  const theme = useTheme();

  if (!record) return null;

  const handleAction = (callback: () => void) => {
    onClose();
    setTimeout(() => {
      callback();
    }, 100);
  };

  const id = String(record.id);
  const status = record.status || "";
  const has = (permission: string) => permissions.includes(permission);
  const canRead = has(`${kind}.read`);
  if (!canRead) return null;
  const title =
    kind === "vehicles"
      ? record.license || record.code
      : kind === "customers"
        ? record.name
        : record.code;
  const subtitle =
    kind === "contracts"
      ? `${record.name || "Khách hàng"}${record.license ? ` · ${record.license}` : ""}`
      : kind === "vehicles"
        ? `${record.name || "Xe"}${record.brand ? ` · ${record.brand}` : ""}`
        : record.phone || record.contactDetail || "";

  const actions: RecordActionItem[] = [];

  if (kind === "contracts") {
    const statusText = contextualStatusLabel("contracts", status) || statuses[status] || status || "hiện tại";
    const isActiveRental = ["renting", "overdue", "wait_payment"].includes(status);
    const isOwnership =
      record.monitoring?.rentalType === "ownership" ||
      record.monitoring?.rentalType === "ownership_cd";

    // 1. Xem chi tiết
    actions.push({
      id: "view",
      label: "Xem chi tiết",
      icon: Eye,
      onPress: () =>
        router.push({
          pathname: "/record/[kind]/[id]",
          params: { kind: "contracts", id },
        }),
    });

    // 2. Gửi Telegram (khớp Web: ẩn trên bản nháp)
    if (status !== "draft") {
      actions.push({
        id: "telegram",
        label: status === "cancelled" ? "Lịch sử Telegram / Thu hồi tin" : "Gửi Telegram",
        description: "Xem trạng thái gửi và gửi thông báo Telegram",
        icon: MessageCircle,
        color: "#0284C7",
        onPress: () =>
          router.push({
            pathname: "/contract-telegram/[id]",
            params: { id, ...(status === "completed" || status === "wait_payment" ? { eventKind: "return" } : {}) },
          }),
      });
    }

    // 3. Điền và in hợp đồng
    actions.push({
      id: "print",
      label: "Điền và in hợp đồng",
      icon: Printer,
      onPress: () =>
        router.push({
          pathname: "/print/[kind]/[id]",
          params: { kind: "contracts", id },
        }),
    });

    // 4. Nhập phiếu chi (QR SePay — khớp Web DataTable.tsx: ẩn khi đã hủy)
    if (status !== "cancelled") {
      actions.push({
        id: "qr",
        label: "Nhập phiếu chi",
        description: "Tạo mã QR chuyển khoản SePay theo công nợ",
        icon: QrCode,
        color: "#2563EB",
        onPress: () =>
          router.push({
            pathname: "/contract-qr/[id]",
            params: { id },
          }),
      });
    }

    // 5. Nhắc nợ
    if (record.reminderEligible && (has("contracts.draft") || has("finance.write"))) {
      actions.push({
        id: "reminder",
        label: "Nhắc nợ",
        description: "Gửi thông báo công nợ qua Zalo",
        icon: MessageCircle,
        color: "#D97706",
        onPress: () =>
          router.push({
            pathname: "/reminder-editor/[id]",
            params: { id },
          }),
      });
    }

    // 6. Thanh toán (khớp Web DataTable.tsx 0de4d72: hiển thị trên mọi HĐ không phải nháp, kể cả đã hủy)
    if (has("finance.write") && status !== "draft") {
      actions.push({
        id: "payment",
        label: "Thanh toán",
        description: "Ghi nhận phiếu thu / chi sổ quỹ",
        icon: Wallet,
        color: "#9333EA",
        onPress: () =>
          router.push({
            pathname: "/payment/[id]",
            params: { id },
          }),
      });
    }

    // 7. Giao xe & Bổ sung hồ sơ hợp đồng cọc (khớp Web: chỉ hiển thị với deposit_contract)
    if (has("contracts.finalize") && status === "deposit_contract") {
      actions.push({
        id: "finalize_handover",
        label: "Giao xe",
        description: "Bàn giao xe từ hợp đồng đặt cọc",
        icon: ShieldCheck,
        color: "#16A34A",
        onPress: () =>
          router.push({
            pathname: "/contract/[id]",
            params: { id },
          }),
      });
      actions.push({
        id: "profile_edit",
        label: "Bổ sung hồ sơ / Tiếp tục hợp đồng cọc",
        description: "Cập nhật nhanh khách hàng, SĐT, CCCD, ghi chú",
        icon: FilePenLine,
        color: "#0284C7",
        onPress: () =>
          router.push({
            pathname: "/contract-edit/[id]",
            params: { id, mode: "profile" },
          }),
      });
    }

    // 8. Trả xe / Hồ sơ trả xe
    if (has("contracts.return")) {
      if (status === "completed") {
        actions.push({
          id: "return",
          label: "Hồ sơ trả xe",
          icon: RotateCcw,
          color: "#4F46E5",
          onPress: () => router.push({ pathname: "/return-correction/[id]", params: { id } }),
        });
      } else if (isActiveRental) {
        actions.push({
          id: "return",
          label: "Trả xe",
          description: "Ghi nhận trả xe trực tiếp trên hợp đồng này",
          icon: RotateCcw,
          color: "#4F46E5",
          onPress: () =>
            router.push({
              pathname: "/return-editor/[id]",
              params: { id },
            }),
        });
      } else {
        actions.push({
          id: "return",
          label: "Trả xe",
          blockedReason: status === "bad_debt"
            ? "Hợp đồng đang nợ xấu — mở chi tiết để dùng chức năng Thu hồi xe nợ xấu."
            : `Không thể trả xe khi hợp đồng đang ở trạng thái ${statusText}.`,
          icon: RotateCcw,
        });
      }
    }

    // 9. Chuyển sang Nợ xấu (khớp Web DataTable.tsx)
    if (
      isActiveRental &&
      has("contracts.return") &&
      (status === "overdue" || Boolean(record.monitoring?.collectionOverdue))
    ) {
      actions.push({
        id: "mark_bad_debt",
        label: "Chuyển sang Nợ xấu",
        description: "Chuyển hợp đồng quá hạn sang Nợ xấu",
        icon: AlertTriangle,
        color: "#DC2626",
        onPress: () =>
          router.push({
            pathname: "/contract-lifecycle/[id]",
            params: { id, action: "mark_bad_debt" },
          }),
      });
    }

    // 10. Đóng hợp đồng nợ xấu (server-projected settle grant)
    if (status === "bad_debt" && has("contracts.settle")) {
      actions.push({
        id: "close_bad_debt",
        label: "Đóng hợp đồng nợ xấu",
        description: "Rà soát đủ xe đã nhận; công nợ tiếp tục theo dõi",
        icon: ShieldCheck,
        color: "#16A34A",
        onPress: () =>
          router.push({
            pathname: "/contract-lifecycle/[id]",
            params: { id, action: "close_bad_debt" },
          }),
      });
    }

    // 11. Gia hạn
    if (has("contracts.renew")) {
      if (isOwnership) {
        actions.push({
          id: "renew",
          label: "Gia hạn",
          blockedReason: "Hợp đồng thuê sở hữu đóng tiền theo kỳ — không dùng chức năng gia hạn ngày/giờ.",
          icon: CalendarPlus,
        });
      } else if (["renting", "overdue", "wait_payment", "bad_debt"].includes(status)) {
        actions.push({
          id: "renew",
          label: "Gia hạn",
          description: "Gia hạn trực tiếp trên hợp đồng",
          icon: CalendarPlus,
          color: "#059669",
          onPress: () =>
            router.push({
              pathname: "/renewal/[id]",
              params: { id },
            }),
        });
      } else {
        actions.push({
          id: "renew",
          label: "Gia hạn",
          blockedReason: `Chỉ gia hạn hợp đồng đang thuê, quá hạn, chờ thanh toán hoặc nợ xấu (hiện tại: ${statusText}).`,
          icon: CalendarPlus,
        });
      }
    }

    // 12. Đổi xe (khớp Web: chỉ hiển thị khi đang thuê / quá hạn / chờ thanh toán)
    if (isActiveRental && has("contracts.return")) {
      actions.push({
        id: "swap",
        label: "Đổi xe",
        description: "Đổi xe trực tiếp trên hợp đồng",
        icon: CarFront,
        color: "#0284C7",
        onPress: () =>
          router.push({
            pathname: "/swap-editor/[id]",
            params: { id },
          }),
      });
    }

    // 13. Thuê pin / sạc (khớp Web: can('contracts.draft') && !draft/cancelled)
    if (has("contracts.draft") && !["draft", "cancelled"].includes(status)) {
      actions.push({
        id: "battery",
        label: "Thuê pin / sạc",
        description: "Hợp đồng pin / sạc kèm theo",
        icon: BatteryCharging,
        color: "#0D9488",
        onPress: () =>
          router.push({ pathname: "/battery-contracts", params: { source: id } }),
      });
    }

    // 14. Sửa loại HĐ / mức đóng ngày (khớp Web: hợp đồng thuê sở hữu)
    if (
      !["draft", "cancelled"].includes(status) &&
      isOwnership &&
      (has("contracts.draft") || has("contracts.settle"))
    ) {
      actions.push({
        id: "ownership_terms",
        label: "Sửa loại HĐ / mức đóng ngày",
        description: "Cập nhật thời hạn sở hữu và mức đóng mỗi ngày",
        icon: FilePenLine,
        color: "#2563EB",
        onPress: () =>
          router.push({
            pathname: "/ownership-terms/[id]",
            params: { id },
          }),
      });
    }

    // 15. Duyệt hợp đồng (khớp Web: thuê sở hữu chưa duyệt)
    if (
      !["draft", "cancelled"].includes(status) &&
      !record.approvedAt &&
      isOwnership &&
      has("contracts.finalize")
    ) {
      actions.push({
        id: "approve",
        label: "Duyệt hợp đồng",
        description: "Xác nhận duyệt hợp đồng thuê sở hữu",
        icon: ShieldCheck,
        color: "#16A34A",
        onPress: () =>
          router.push({
            pathname: "/contract-approval/[id]",
            params: { id },
          }),
      });
    }

    // 16. Tiếp tục sửa bản nháp / Sửa hợp đồng
    if (has("contracts.draft") && status === "draft") {
      actions.push({
        id: "draft_edit",
        label: "Tiếp tục sửa bản nháp",
        icon: FilePenLine,
        color: "#2563EB",
        onPress: () =>
          router.push({
            pathname: "/draft/[id]",
            params: { id },
          }),
      });
    } else if (has("contracts.draft") && status !== "draft") {
      actions.push({
        id: "contract_edit",
        label: "Sửa hợp đồng",
        description: "Chỉnh sửa thông tin, tiền cọc, giấy tờ hợp đồng",
        icon: FilePenLine,
        color: "#2563EB",
        onPress: () =>
          router.push({
            pathname: "/contract-edit/[id]",
            params: { id },
          }),
      });
      // Khớp Web DataTable.tsx 6a192fe: Sửa giá thuê cho hợp đồng thuê thường đã phát hành
      if (!isOwnership) {
        actions.push({
          id: "rental_terms",
          label: "Sửa giá thuê",
          description: "Điều chỉnh đơn giá, ngày thuê và tổng tiền hợp đồng",
          icon: FilePenLine,
          color: "#0284C7",
          onPress: () =>
            router.push({
              pathname: "/rental-terms/[id]",
              params: { id },
            }),
        });
      }
    }

    // 17. Xóa bản nháp / Xóa hợp đồng cọc / Ẩn hợp đồng
    if ((status === "draft" ? (has("contracts.delete") || has("contracts.draft")) : has("contracts.delete")) && ["draft", "deposit_contract", "completed"].includes(status)) {
      actions.push({
        id: "delete_or_hide",
        label: status === "draft" ? "Xóa hẳn bản nháp" : status === "deposit_contract" ? "Xóa hợp đồng cọc" : "Ẩn hợp đồng",
        description: status === "draft" ? "Xóa bản nháp chưa phát hành" : status === "deposit_contract" ? "Ẩn hợp đồng cọc và giải phóng xe" : "Mở chi tiết hợp đồng để xác nhận ẩn",
        icon: X,
        color: "#DC2626",
        onPress: () =>
          status === "draft"
            ? router.push({ pathname: "/draft-delete/[id]", params: { id } })
            : status === "deposit_contract"
              ? router.push({ pathname: "/contract-operation/[action]/[id]", params: { action: "delete_reservation", id } })
              : router.push({
                  pathname: "/record/[kind]/[id]",
                  params: { kind: "contracts", id },
                }),
      });
    }
  } else if (kind === "vehicles") {
    // Vehicles actions (khớp Web DataTable.tsx)
    actions.push({
      id: "view",
      label: "Xem chi tiết",
      icon: Eye,
      onPress: () =>
        router.push({
          pathname: "/vehicle/[id]",
          params: { id },
        }),
    });

    if (has("vehicles.write")) {
      actions.push({
        id: "edit",
        label: "Chỉnh sửa",
        description: "Biển số, loại xe, giá thuê, số khung / số máy",
        icon: FilePenLine,
        color: "#2563EB",
        onPress: () =>
          router.push({
            pathname: "/vehicle-editor/[id]",
            params: { id },
          }),
      });
      actions.push({
        id: "status",
        label: "Đổi trạng thái",
        description: "Lưu kho, bảo dưỡng, sẵn sàng",
        icon: RotateCcw,
        color: "#059669",
        onPress: () =>
          router.push({
            pathname: "/vehicle-status-editor/[id]",
            params: { id },
          }),
      });
      actions.push({
        id: "media",
        label: "Ảnh & giấy tờ xe",
        description: "Ảnh đại diện xe và đăng ký xe",
        icon: Files,
        color: "#0284C7",
        onPress: () =>
          router.push({
            pathname: "/record-media/[entity]/[id]",
            params: { entity: "vehicles", id, kind: "vehicle", referenceId: id },
          }),
      });
    }

    if (has("vehicles.transfer")) {
      if (record.status === "in_transit" || record.status === "sold") {
        actions.push({
          id: "transfer",
          label: "Chuyển xe",
          blockedReason: record.status === "in_transit"
            ? "Xe đang Chờ luân chuyển — cơ sở đích cần Nhận xe hoặc Từ chối trước khi chuyển tiếp."
            : "Xe đã bán — không điều chuyển cơ sở.",
          icon: ArrowLeftRight,
        });
      } else {
        actions.push({
          id: "transfer",
          label: "Chuyển xe",
          description: "Chuyển xe sang cơ sở khác",
          icon: ArrowLeftRight,
          color: "#4F46E5",
          onPress: () =>
            router.push({
              pathname: "/vehicle-transfer-editor/[id]",
              params: { id },
            }),
        });
      }
    }
    if (record.status === "in_transit" && (has("vehicles.receive") || has("vehicles.transfer"))) {
      actions.push({
        id: "receive_transfer",
        label: "Xử lý xe đang luân chuyển",
        description: "Nhận xe, từ chối hoặc hủy phiếu điều chuyển",
        icon: ShieldCheck,
        color: "#059669",
        onPress: () =>
          router.push({
            pathname: "/vehicle-transfer-editor/[id]",
            params: { id },
          }),
      });
    }

    actions.push({
      id: "history",
      label: "Lịch sử hợp đồng & luân chuyển",
      icon: History,
      onPress: () =>
        router.push({
          pathname: "/vehicle-history/[id]",
          params: { id },
        }),
    });
  } else if (kind === "customers") {
    // Customer actions (khớp Web DataTable.tsx)
    actions.push({
      id: "view",
      label: "Xem chi tiết",
      icon: Eye,
      onPress: () =>
        router.push({
          pathname: "/record/[kind]/[id]",
          params: { kind: "customers", id },
        }),
    });

    if (has("customers.write")) {
      actions.push({
        id: "edit",
        label: "Chỉnh sửa",
        description: "Cập nhật thông tin, cảnh báo hoặc Blacklist",
        icon: FilePenLine,
        color: "#2563EB",
        onPress: () =>
          router.push({
            pathname: "/customer/[id]",
            params: { id },
          }),
      });
      actions.push({
        id: "documents",
        label: "Giấy tờ & CCCD khách hàng",
        description: "Xem hoặc chụp bổ sung CCCD, GPLX",
        icon: Files,
        color: "#0284C7",
        onPress: () =>
          router.push({
            pathname: "/record-media/[entity]/[id]",
            params: { entity: "customers", id, kind: "customer", referenceId: id },
          }),
      });
    }

    if (has("contracts.read")) actions.push({
      id: "history",
      label: "Hợp đồng của khách",
      icon: Files,
      onPress: () =>
        router.push({
          pathname: "/(tabs)/contracts",
          params: { customer_id: id, customer_name: record.name || "", status: "all", store: "all" },
        }),
    });
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          {/* Sheet Header */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text
                  style={{
                    color: theme.text,
                    fontSize: 18,
                    fontWeight: "800",
                  }}
                >
                  {title}
                </Text>
                <StatusBadge
                  status={status}
                  label={contextualStatusLabel(kind, status) || statuses[status]}
                />
              </View>
              {!!subtitle && (
                <Text style={{ color: theme.muted, fontSize: 13 }}>
                  {subtitle}
                </Text>
              )}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Đóng menu thao tác" onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <X size={20} color={theme.muted} />
            </Pressable>
          </View>

          {/* Action List */}
          <ScrollView
            style={{ maxHeight: 420 }}
            contentContainerStyle={styles.actionList}
          >
            {actions.map((action) => {
              const Icon = action.icon;
              if (action.blockedReason || !action.onPress) {
                return (
                  <View
                    key={action.id}
                    accessible
                    accessibilityLabel={`${action.label}. ${action.blockedReason || ""}`}
                    style={[
                      styles.actionItem,
                      {
                        borderBottomColor: theme.border,
                        opacity: 0.62,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.actionIconBox,
                        { backgroundColor: theme.background },
                      ]}
                    >
                      <Icon size={20} color={theme.muted} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text
                        style={{
                          color: theme.muted,
                          fontSize: 15,
                          fontWeight: "600",
                        }}
                      >
                        {action.label}
                      </Text>
                      {!!action.blockedReason && (
                        <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 17 }}>
                          {action.blockedReason}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              }
              const run = action.onPress;
              return (
                <Pressable
                  key={action.id}
                  accessibilityRole="button"
                  onPress={() => handleAction(run)}
                  style={({ pressed }) => [
                    styles.actionItem,
                    {
                      backgroundColor: pressed ? theme.background : "transparent",
                      borderBottomColor: theme.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.actionIconBox,
                      {
                        backgroundColor: action.color
                          ? `${action.color}18`
                          : theme.tint,
                      },
                    ]}
                  >
                    <Icon
                      size={20}
                      color={action.color || theme.primary}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={{
                        color: theme.text,
                        fontSize: 15,
                        fontWeight: "600",
                      }}
                    >
                      {action.label}
                    </Text>
                    {!!action.description && (
                      <Text style={{ color: theme.muted, fontSize: 12 }}>
                        {action.description}
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.48)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    paddingTop: 16,
    paddingBottom: 28,
    maxHeight: "80%",
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  actionList: {
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderBottomWidth: 1,
  },
  actionIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
