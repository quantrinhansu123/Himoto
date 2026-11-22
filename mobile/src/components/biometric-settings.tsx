import { useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";
import { Fingerprint } from "lucide-react-native";
import { useSession } from "@/providers/session";
import { biometricLock } from "@/lib/biometric-lock";
import { useTheme } from "@/theme";
import { Button, Card, InlineError, StatusBadge } from "./ui";

export function BiometricSettings() {
  const { api, session } = useSession();
  const theme = useTheme();
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!api || !session || Platform.OS === "web") return;
    let alive = true;
    void biometricLock
      .enabled(api.origin, session.user.id)
      .then((value) => {
        if (alive) {
          setEnabled(value);
          setReady(true);
        }
      })
      .catch(() => {
        if (alive) {
          setError("Không đọc được cài đặt mở khóa trên thiết bị.");
        }
      });
    return () => {
      alive = false;
    };
  }, [api, session]);

  async function toggle() {
    if (!api || !session || busy) return;
    setBusy(true);
    setError("");
    try {
      await biometricLock.set(
        api.origin,
        session.user.id,
        !enabled,
        session.sessionId || session.token,
      );
      setEnabled(!enabled);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (Platform.OS === "web") return null;

  return (
    <Card style={{ gap: 10, padding: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: theme.tint,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Fingerprint size={20} color={theme.primary} accessible={false} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            accessibilityRole="header"
            style={{ color: theme.text, fontSize: 15, fontWeight: "700" }}
          >
            Khóa Face ID / vân tay
          </Text>
          <Text style={{ color: theme.muted, fontSize: 12.5, lineHeight: 17 }}>
            {enabled
              ? "Xác thực khi mở app hoặc quay lại sau 1 phút."
              : "Bảo vệ phiên đăng nhập mà không cần nhập mật khẩu lại."}
          </Text>
        </View>
        <StatusBadge
          status={enabled ? "active" : "inactive"}
          label={enabled ? "Đang bật" : "Đang tắt"}
        />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
        <Button
          size="sm"
          secondary={enabled}
          label={enabled ? "Tắt khóa sinh trắc học" : "Bật Face ID / vân tay"}
          disabled={!ready}
          loading={busy}
          onPress={() => {
            void toggle();
          }}
        />
      </View>
      {!!error && <InlineError message={error} />}
    </Card>
  );
}
