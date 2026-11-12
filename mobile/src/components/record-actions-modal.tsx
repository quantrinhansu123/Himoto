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
  icon: React.ComponentType<{ size: number; color: string }>;
  color?: string;
  onPress: () => void;
}

export function RecordActionsModal({
  visible,
  onClose,
  kind,
  record,
  isAdmin,
  canSettle,
}: {
  visible: boolean;
  onClose: () => void;
  kind: CatalogueKind;
  record: MobileRecord | null;
  isAdmin?: boolean;
  canSettle?: boolean;
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

    // 2. Trả xe
    if (["renting", "overdue", "wait_payment"].includes(status)) {
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
    }

    // 3. Gia hạn
    if (["renting", "overdue"].includes(status)) {
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
    }

    // 4. Đổi xe
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
    }

    // 5. Thu tiền
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
    if (["overdue", "renting", "wait_payment"].includes(status)) {
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
        label: "Gửi Telegram",
        description: "Bắn tin hợp đồng vào nhóm",
        icon: MessageCircle,
        color: "#0284C7",
        onPress: () =>
          router.push({
            pathname: "/contract-telegram/[id]",
            params: { id },
          }),
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
          router.push("/battery-contracts"),
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

    // 11. Đóng hợp đồng nợ xấu (Admin / Quyền quyết toán)
    if (status === "bad_debt" && (isAdmin || canSettle)) {
      actions.push({
        id: "close_bad_debt",
        label: "Đóng hợp đồng nợ xấu",
        description: "Giải phóng xe & kết thúc theo dõi",
        icon: ShieldCheck,
        color: "#16A34A",
        onPress: () =>
          router.push({
            pathname: "/recovery-editor/[id]",
            params: { id },
          }),
      });
    }

    // 12. Tiếp tục sửa bản nháp
    if (status === "draft") {
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

    actions.push({
      id: "history",
      label: "Hợp đồng của khách",
      icon: Files,
      onPress: () =>
        router.push({
          pathname: "/(tabs)/contracts",
          params: { search: record.name || "" },
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
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
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
              return (
                <Pressable
                  key={action.id}
                  onPress={() => handleAction(action.onPress)}
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
