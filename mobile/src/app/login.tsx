import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Eye, EyeOff, LockKeyhole } from "lucide-react-native";
import { Brand, Button, InlineError } from "@/components/ui";
import { useSession } from "@/providers/session";
import { useTheme } from "@/theme";

export default function Login() {
  const theme = useTheme();
  const { login } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const passwordInput = useRef<TextInputInstance>(null);
  async function submit() {
    if (busy) return;
    if (!email.trim() || !password) {
      setError("Nhập tài khoản và mật khẩu để tiếp tục.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await login(email.trim(), password);
      setPassword("");
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      backgroundColor: theme.surface,
      borderColor: theme.controlBorder,
    },
  ];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.container}
        >
          <View style={styles.top}>
            <View style={{alignSelf: "center"}}><Brand /></View>
            <Text style={[styles.eyebrow, { color: theme.muted }]}>
              KHÔNG GIAN LÀM VIỆC
            </Text>
          </View>
          <View style={{ gap: 12 }}>
            <Text
              accessibilityRole="header"
              style={[styles.heading, { color: theme.text }]}
            >
              Đăng nhập
            </Text>
            <Text style={[styles.label, { color: theme.text }]}>Tài khoản</Text>
            <TextInput
              nativeID="himoto-account-input"
              accessibilityLabel="Tài khoản"
              value={email}
              onChangeText={setEmail}
              style={inputStyle}
              placeholder="Email hoặc tên đăng nhập"
              placeholderTextColor={theme.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={Platform.OS === "android" ? "visible-password" : "email-address"}
              spellCheck={false}
              autoComplete="username"
              textContentType="username"
              returnKeyType="next"
              onSubmitEditing={() => passwordInput.current?.focus()}
              editable={!busy}
              maxLength={254}
            />
            <Text style={[styles.label, { color: theme.text }]}>Mật khẩu</Text>
            <View style={{ position: "relative" }}>
              <TextInput
                ref={passwordInput}
                accessibilityLabel="Mật khẩu"
                value={password}
                onChangeText={setPassword}
                style={[inputStyle, { paddingRight: 60 }]}
                secureTextEntry={!visible}
                placeholder="Nhập mật khẩu"
                placeholderTextColor={theme.muted}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={() => {
                  void submit();
                }}
                editable={!busy}
                maxLength={256}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                onPress={() => setVisible((value) => !value)}
                style={styles.eye}
              >
                {visible ? (
                  <EyeOff color={theme.muted} size={21} />
                ) : (
                  <Eye color={theme.muted} size={21} />
                )}
              </Pressable>
            </View>
            {!!error && <InlineError message={error} />}
            <View style={{ height: 4 }} />
            <Button
              label="Đăng nhập"
              loading={busy}
              onPress={() => {
                void submit();
              }}
            />
            <View style={styles.note}>
              <LockKeyhole size={15} color={theme.muted} accessible={false} />
              <Text
                style={{
                  color: theme.muted,
                  fontSize: 13,
                  lineHeight: 20,
                  flex: 1,
                }}
              >
                Dùng tài khoản Himoto đã được cấp quyền.
              </Text>
            </View>
          </View>
          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            <Text
              style={{ color: theme.muted, fontSize: 12, letterSpacing: 2 }}
            >
              HIMOTO
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 40,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    justifyContent: "center",
    gap: 32,
  },
  top: { gap: 18, alignItems: "center", paddingBottom: 12 },
  eyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 2, textAlign: "center" },
  heading: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  label: { fontSize: 14, fontWeight: "600" },
  input: {
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  eye: {
    position: "absolute",
    right: 4,
    top: 4,
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  note: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 4 },
  footer: {
    paddingTop: 20,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
});
