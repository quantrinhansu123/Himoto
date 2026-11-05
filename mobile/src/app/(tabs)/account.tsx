import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ShieldCheck, CircleUserRound } from "lucide-react-native";
import { Button, Card, InlineError } from "@/components/ui";
import {DraftWorkList} from "@/components/draft-work-list";
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
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <ScrollView
        contentContainerStyle={{
          padding: 24,
          gap: 24,
          maxWidth: 760,
          width: "100%",
          alignSelf: "center",
        }}
      >
        <Text
          accessibilityRole="header"
          style={{ color: theme.text, fontSize: 32, fontWeight: "800" }}
        >
          Tài khoản
        </Text>
        <Card style={{ gap: 12 }}>
          <CircleUserRound size={44} color={theme.primary} accessible={false} />
          <Text style={{ color: theme.text, fontSize: 24, fontWeight: "700" }}>
            {session?.user.name}
          </Text>
          <Text selectable style={{ color: theme.muted, fontSize: 15 }}>
            {session?.user.email}
          </Text>
        </Card>
        <Card style={{ gap: 20 }}>
          <View style={{ gap: 6 }}>
            <Text style={{ color: theme.muted, fontSize: 13 }}>Vai trò</Text>
            <Text style={{ color: theme.text, fontSize: 17 }}>
              {roles[session?.user.role || ""] || "Nhân viên"}
            </Text>
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ color: theme.muted, fontSize: 13 }}>
              Phạm vi truy cập
            </Text>
            <Text style={{ color: theme.text, fontSize: 17 }}>{store}</Text>
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ color: theme.muted, fontSize: 13 }}>
              Phiên làm việc đến
            </Text>
            <Text style={{ color: theme.text, fontSize: 17 }}>
              {dateTime(session?.expiresAt || "")}
            </Text>
          </View>
        </Card>
        <Button secondary label="Đổi mật khẩu của mình" onPress={()=>router.push("/change-password")} />
        {api&&session&&<DraftWorkList key={`${api.origin}:${session.user.id}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(',')}`}/>}
        {api && session && <PendingWriteRecovery key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} />}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <ShieldCheck size={20} color={theme.success} accessible={false} />
          <Text
            style={{
              color: theme.muted,
              fontSize: 14,
              lineHeight: 23,
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
          secondary
          loading={busy}
          onPress={() => {
            void signOut();
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
