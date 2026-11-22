import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AlarmClock,
  BookOpen,
  CloudOff,
  KeyRound,
  LogOut,
  RefreshCw,
  ShieldCheck,
} from "lucide-react-native";
import * as Updates from "expo-updates";
import Constants from "expo-constants";
import {
  Button,
  Card,
  InfoBanner,
  InlineError,
  KeyValueRow,
  ListActionRow,
  StatusBadge,
} from "@/components/ui";
import { DraftWorkList } from "@/components/draft-work-list";
import { BiometricSettings } from "@/components/biometric-settings";
import { PendingWriteRecovery } from "@/components/pending-write-recovery";
import { useSession } from "@/providers/session";
import { useWorkspace } from "@/hooks/use-workspace";
import { dateTime, roles, useTheme } from "@/theme";

export default function Account() {
  const theme = useTheme();
  const { api, session, logout } = useSession();
  const workspace = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");
  const updateState = Updates.useUpdates();

  async function handleCheckUpdate() {
    if (__DEV__ || !Updates.isEnabled) {
      setUpdateMessage(
        "Bản thử nghiệm không nhận cập nhật tự động. Dùng bản Himoto đã cài chính thức.",
      );
      return;
    }
    setCheckingUpdate(true);
    setUpdateMessage("");
    try {
      if (updateState.isUpdatePending) {
        await Updates.reloadAsync();
        return;
      }
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        setUpdateMessage("Đang tải bản cập nhật mới...");
        await Updates.fetchUpdateAsync();
        setUpdateMessage("Đã tải xong bản mới! Đang khởi động lại ứng dụng...");
        await Updates.reloadAsync();
      } else {
        setUpdateMessage(
          "Ứng dụng đang ở phiên bản mới nhất trên hệ thống.",
        );
      }
    } catch (cause) {
      setUpdateMessage(`Chưa thể kiểm tra: ${(cause as Error).message}`);
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError("");
    try {
      await logout();
    } catch {
      setError("Chưa đăng xuất được trên máy chủ. Kiểm tra mạng và thử lại.");
    } finally {
      setBusy(false);
    }
  }

  const store = session?.user.allStores
    ? "Toàn bộ cơ sở"
    : workspace.data?.stores.find((item) => item.id === session?.user.storeId)
        ?.name || "Cơ sở được phân công";
  const roleLabel = roles[session?.user.role || ""] || "Nhân viên";
  const versionText = `v${Constants.expoConfig?.version || Updates.runtimeVersion || "1.0"}`;
  const initials = (session?.user.name || "HM")
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 36,
          gap: 14,
          maxWidth: 760,
          width: "100%",
          alignSelf: "center",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text
            accessibilityRole="header"
            style={{ color: theme.text, fontSize: 22, fontWeight: "800" }}
          >
            Tài khoản
          </Text>
          <Text style={{ color: theme.muted, fontSize: 12.5, fontWeight: "600" }}>
            Himoto {versionText}
          </Text>
        </View>

        {/* Enterprise Profile Hero Card */}
        <Card style={{ gap: 12, padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 13 }}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: theme.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: theme.primaryText,
                  fontSize: 18,
                  fontWeight: "800",
                }}
              >
                {initials || "HM"}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text
                numberOfLines={1}
                style={{ color: theme.text, fontSize: 18, fontWeight: "800" }}
              >
                {session?.user.name}
              </Text>
              <Text
                selectable
                numberOfLines={1}
                style={{ color: theme.muted, fontSize: 13 }}
              >
                {session?.user.email}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingTop: 2 }}>
                <StatusBadge status="active" label={roleLabel} />
              </View>
            </View>
          </View>
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.border,
              paddingTop: 10,
              gap: 3,
            }}
          >
            <KeyValueRow label="Phạm vi cơ sở" value={store} strong />
            <KeyValueRow
              label={
                session?.refreshExpiresAt
                  ? "Duy trì đăng nhập đến"
                  : "Phiên làm việc đến"
              }
              value={dateTime(
                session?.refreshExpiresAt || session?.expiresAt || "",
              )}
            />
            {Updates.createdAt && (
              <KeyValueRow
                label="Bản cập nhật OTA"
                value={dateTime(Updates.createdAt.toISOString())}
              />
            )}
          </View>
        </Card>

        {/* Grouped Enterprise Settings List */}
        <Card style={{ paddingVertical: 4, paddingHorizontal: 14 }}>
          <ListActionRow
            title="Chấm công vào / ra ca"
            subtitle="Ghi nhận ca trực hôm nay bằng ảnh & GPS"
            icon={<AlarmClock size={18} color={theme.primary} accessible={false} />}
            iconBg={theme.tint}
            onPress={() => router.push("/attendance")}
          />
          <ListActionRow
            title="Đổi mật khẩu tài khoản"
            subtitle="Cập nhật mật khẩu đăng nhập hệ thống"
            icon={<KeyRound size={18} color="#2563EB" accessible={false} />}
            iconBg="#EFF6FF"
            onPress={() => router.push("/change-password")}
          />
          <ListActionRow
            title="Hướng dẫn và hỏi đáp"
            subtitle="Quy trình thao tác, sổ tay 17 chương & FAQ"
            icon={<BookOpen size={18} color="#059669" accessible={false} />}
            iconBg="#ECFDF5"
            onPress={() => router.push("/guide")}
          />
          <ListActionRow
            title="Dữ liệu offline & Đồng bộ"
            subtitle="Theo dõi bản nháp lưu máy và phiên chờ gửi"
            icon={<CloudOff size={18} color="#D97706" accessible={false} />}
            iconBg="#FEF3C7"
            onPress={() => router.navigate("/offline-sync")}
          />
          <ListActionRow
            title={
              updateState.isUpdatePending
                ? "Áp dụng bản cập nhật mới"
                : "Kiểm tra bản cập nhật mới"
            }
            subtitle="Cập nhật tính năng mới trực tiếp (không cần cài lại APK)"
            rightText={versionText}
            icon={<RefreshCw size={18} color="#7C3AED" accessible={false} />}
            iconBg="#F5F3FF"
            loading={checkingUpdate}
            divider={false}
            onPress={() => {
              void handleCheckUpdate();
            }}
          />
        </Card>

        {!!updateMessage && (
          <InfoBanner
            tone="info"
            title="Trạng thái cập nhật"
            message={updateMessage}
          />
        )}

        <BiometricSettings />
        {api && session && (
          <DraftWorkList
            key={`${api.origin}:${session.user.id}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`}
          />
        )}
        {api && session && (
          <PendingWriteRecovery
            key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`}
          />
        )}

        <View
          style={{
            flexDirection: "row",
            gap: 10,
            paddingHorizontal: 4,
            alignItems: "flex-start",
          }}
        >
          <ShieldCheck size={18} color={theme.success} accessible={false} />
          <Text
            style={{
              color: theme.muted,
              fontSize: 12.5,
              lineHeight: 18,
              flex: 1,
            }}
          >
            Quyền truy cập do quản trị viên quản lý. Đăng xuất khi kết thúc ca
            hoặc trước khi bàn giao thiết bị.
          </Text>
        </View>

        {!!error && <InlineError message={error} />}

        <Button
          label="Đăng xuất"
          danger
          loading={busy}
          icon={<LogOut size={16} color={theme.danger} accessible={false} />}
          onPress={() => {
            void signOut();
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
