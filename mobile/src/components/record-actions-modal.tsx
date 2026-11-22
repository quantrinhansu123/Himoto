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
    // 1. Xem chi tiết
    actions.push({
      id: "view",
      label: "Xem chi tiết hợp đồng",
      icon: Eye,
      onPress: () =>
        router.push({
          pathname: "/record/[kind]/[id]",
          params: { kind: "contracts", id },
        }),
    });

    const statusText = contextualStatusLabel("contracts", status) || statuses[status] || status || "hiện tại";

    // 2. Trả xe
    if (has("contracts.return")) {
      if (status === "completed") {
        actions.push({
          id: "return",
          label: "Hồ sơ trả xe",
          icon: RotateCcw,
          color: "#4F46E5",
          onPress: () => router.push({ pathname: "/return-correction/[id]", params: { id } }),
        });
      } else if (["renting", "overdue", "wait_payment"].includes(status)) {
        actions.push({
          id: "return",
          label: "Trả xe tại quầy",
          description: "Kiểm tra xe & kết thúc hợp đồng",
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
          label: "Trả xe tại quầy",
          blockedReason: status === "bad_debt"
            ? "Hợp đồng đang nợ xấu — mở chi tiết để dùng chức năng Thu hồi xe nợ xấu."
            : `Không thể trả xe khi hợp đồng đang ở trạng thái ${statusText}.`,
          icon: RotateCcw,
        });
      }
    }

    // 3. Gia hạn
    if (has("contracts.renew")) {
      if (["renting", "overdue", "wait_payment", "bad_debt"].includes(status)) {
        actions.push({
          id: "renew",
          label: "Gia hạn hợp đồng",
          description: "Cập nhật ngày hẹn trả xe",
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
          label: "Gia hạn hợp đồng",
          blockedReason: `Chỉ gia hạn hợp đồng đang thuê, quá hạn, chờ thanh toán hoặc nợ xấu (hiện tại: ${statusText}).`,
          icon: CalendarPlus,
        });
      }
    }

    // 4. Đổi xe
    if (has("contracts.return")) {
      if (["renting", "overdue", "wait_payment"].includes(status)) {
        actions.push({
          id: "swap",
          label: "Đổi xe cho khách",
          description: "Đổi sang xe khác trong kho",
          icon: CarFront,
          color: "#0284C7",
          onPress: () =>
            router.push({
              pathname: "/swap-editor/[id]",
              params: { id },
            }),
        });
      } else {
        actions.push({
          id: "swap",
          label: "Đổi xe cho khách",
          blockedReason: `Chỉ đổi xe khi hợp đồng đang thuê, quá hạn hoặc chờ thanh toán (hiện tại: ${statusText}).`,
          icon: CarFront,
        });
      }
    }

    // 5. Thu tiền
    if (has("finance.write")) {
      if (!["draft", "cancelled"].includes(status)) {
        actions.push({
          id: "payment",
          label: "Thu tiền hợp đồng",
          description: "Ghi nhận phiếu thu sổ quỹ",
          icon: Wallet,
          color: "#9333EA",
          onPress: () =>
            router.push({
              pathname: "/payment/[id]",
              params: { id },
            }),
        });
      } else {
        actions.push({
          id: "payment",
          label: "Thu tiền hợp đồng",
          blockedReason: status === "draft"
            ? "Hợp đồng đang lưu nháp — phát hành hợp đồng trước khi ghi phiếu thu."
            : "Hợp đồng đã hủy — không ghi thêm phiếu thu.",
          icon: Wallet,
        });
      }
    }

    // 6. Mã QR chuyển khoản
    if (status !== "cancelled") {
      actions.push({
        id: "qr",
        label: "Mã QR chuyển khoản",
        description: "Tạo QR SePay theo công nợ",
        icon: QrCode,
        color: "#2563EB",
        onPress: () =>
          router.push({
            pathname: "/contract-qr/[id]",
            params: { id },
          }),
      });
    }

    // 7. Gửi nhắc nợ
    if (record.reminderEligible && (has("contracts.draft") || has("finance.write"))) {
      actions.push({
        id: "reminder",
        label: "Gửi nhắc nợ qua Zalo",
        description: "Gửi thông báo công nợ tự động",
        icon: MessageCircle,
        color: "#D97706",
        onPress: () =>
          router.push({
            pathname: "/reminder-editor/[id]",
            params: { id },
          }),
      });
    }

    // 8. Gửi Telegram
    if (status !== "draft") {
      actions.push({
        id: "telegram",
        label: "Telegram hợp đồng",
        description: "Xem trạng thái gửi và thao tác theo quyền",
        icon: MessageCircle,
        color: "#0284C7",
        onPress: () =>
          router.push({
            pathname: "/contract-telegram/[id]",
            params: { id, ...(status === "completed" || status === "wait_payment" ? { eventKind: "return" } : {}) },
          }),
      });
    } else {
      actions.push({
        id: "telegram",
        label: "Telegram hợp đồng",
        blockedReason: "Bản nháp chưa phát hành — phát hành hợp đồng trước khi gửi Telegram.",
        icon: MessageCircle,
      });
    }

    // 9. Thuê pin / sạc
    if (!["draft", "cancelled"].includes(status)) {
      actions.push({
        id: "battery",
        label: "Thuê pin / sạc",
        description: "Hợp đồng pin kèm theo",
        icon: BatteryCharging,
        color: "#0D9488",
        onPress: () =>
          router.push({ pathname: "/battery-contracts", params: { source: id } }),
      });
    }

    // 10. In hợp đồng
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

    // Settlement is an individual server-projected grant, never implied by role.
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

    // 12. Tiếp tục sửa bản nháp / Phát hành & giao xe giữ chỗ
    if (has("contracts.finalize") && (status === "draft" || status === "deposit_contract")) {
      actions.push({
        id: "finalize_handover",
        label: status === "draft" ? "Rà soát & Phát hành hợp đồng" : "Xác nhận giao xe giữ chỗ",
        description: status === "draft" ? "Duyệt phát hành hợp đồng nháp" : "Bàn giao xe từ hợp đồng đặt cọc",
        icon: ShieldCheck,
        color: "#16A34A",
        onPress: () =>
          router.push({
            pathname: "/contract/[id]",
            params: { id },
          }),
      });
    }
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
    }
    if (has("contracts.draft") && status !== "draft") {
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
    }
    if (has("contracts.draft") && status === "deposit_contract") {
      actions.push({
        id: "profile_edit",
        label: "Bổ sung hồ sơ HĐ cọc",
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
    if (has("contracts.settle") && ["renting", "overdue", "wait_payment", "completed"].includes(status)) {
      actions.push({
        id: "payment_settlement",
        label: "Thanh toán & Đóng hợp đồng",
        description: "Quyết toán công nợ, hoàn cọc và chốt hợp đồng",
        icon: ShieldCheck,
        color: "#16A34A",
        onPress: () =>
          router.push({
            pathname: "/contract-operation/[action]/[id]",
            params: { action: "payment_settlement", id },
          }),
      });
    }
    if (has("contracts.return") && status === "bad_debt") {
      actions.push({
        id: "bad_debt_recovery",
        label: "Thu hồi xe nợ xấu",
        description: "Nhận lại xe về kho từ hợp đồng nợ xấu",
        icon: RotateCcw,
        color: "#DC2626",
        onPress: () =>
          router.push({
            pathname: "/recovery-editor/[id]",
            params: { id },
          }),
      });
    }
    if (has("contracts.draft") && !["draft", "cancelled"].includes(status)) {
      actions.push({
        id: "battery_swap",
        label: "Đổi pin theo hợp đồng",
        description: "Ghi nhận lượt đổi pin và minh chứng",
        icon: BatteryCharging,
        color: "#0D9488",
        onPress: () =>
          router.push({
            pathname: "/contract-operation/[action]/[id]",
            params: { action: "battery_swap", id },
          }),
      });
    }
    if ((has("contracts.draft") || has("finance.write")) && (status === "overdue" || status === "bad_debt" || Boolean(record.monitoring?.collectionOverdue))) {
      actions.push({
        id: "collection_followup",
        label: "Ghi chú công nợ",
        description: "Cập nhật kết quả liên hệ và hẹn thanh toán",
        icon: MessageCircle,
        color: "#D97706",
        onPress: () =>
          router.push({
            pathname: "/collection-followup/[id]",
            params: { id },
          }),
      });
    }
    if (has("contracts.delete") && ["draft", "deposit_contract", "completed"].includes(status)) {
      actions.push({
        id: "delete_or_hide",
        label: status === "draft" ? "Xóa bản nháp" : status === "deposit_contract" ? "Xóa HĐ đặt cọc" : "Ẩn hợp đồng khỏi danh sách",
        description: "Mở chi tiết hợp đồng để xác nhận thao tác",
        icon: X,
        color: "#DC2626",
        onPress: () =>
          router.push({
            pathname: "/record/[kind]/[id]",
            params: { kind: "contracts", id },
          }),
      });
    }
  } else if (kind === "vehicles") {
    // Vehicles actions
    actions.push({
      id: "view",
      label: "Xem chi tiết xe",
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
        label: "Sửa thông tin xe",
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
        label: "Đổi trạng thái xe",
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
            params: { entity: "vehicles", id },
          }),
      });
    }

    if (has("vehicles.transfer")) {
      if (record.status === "in_transit" || record.status === "sold") {
        actions.push({
          id: "transfer",
          label: "Điều chuyển cơ sở",
          blockedReason: record.status === "in_transit"
            ? "Xe đang Chờ luân chuyển — cơ sở đích cần Nhận xe hoặc Từ chối trước khi chuyển tiếp."
            : "Xe đã bán — không điều chuyển cơ sở.",
          icon: ArrowLeftRight,
        });
      } else {
        actions.push({
          id: "transfer",
          label: "Điều chuyển cơ sở",
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
    // Customer actions
    actions.push({
      id: "view",
      label: "Xem hồ sơ khách hàng",
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
        label: "Sửa hồ sơ / Blacklist khách",
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
            params: { entity: "customers", id },
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
      <Pressable style={styles.backdrop} onPress={onClose}>
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
      </Pressable>
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
