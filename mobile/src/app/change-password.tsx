import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, usePreventRemove } from "expo-router";
import { uuid } from "expo";
import { Eye, EyeOff, KeyRound } from "lucide-react-native";
import { useSession } from "@/providers/session";
import { pendingWrites } from "@/lib/pending-writes";
import { useTheme } from "@/theme";
import {
  Button,
  Card,
  InfoBanner,
  InlineError,
  StateView,
  StatusBadge,
} from "@/components/ui";
import { ConfirmEdit } from "@/components/editor-sheet";
import { validateNewPassword } from "../../../shared/mobile-managed-accounts";

function PasswordInput({
  label,
  value,
  onChangeText,
  shown,
  onToggleShown,
  maxLength,
  editable,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  shown: boolean;
  onToggleShown: () => void;
  maxLength: number;
  editable: boolean;
  placeholder?: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: "600" }}>
        {label}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 1,
          borderColor: theme.controlBorder,
          borderRadius: 10,
          backgroundColor: theme.surface,
          minHeight: 46,
          paddingLeft: 12,
          paddingRight: 4,
        }}
      >
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!shown}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={maxLength}
          editable={editable}
          placeholder={placeholder}
          placeholderTextColor={theme.muted}
          style={{
            flex: 1,
            color: theme.text,
            fontSize: 15,
            paddingVertical: 10,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={shown ? `Ẩn ${label.toLowerCase()}` : `Hiện ${label.toLowerCase()}`}
          disabled={!editable}
          onPress={onToggleShown}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            alignItems: "center",
            justifyContent: "center",
            opacity: !editable ? 0.45 : pressed ? 0.65 : 1,
          })}
        >
          {shown ? (
            <EyeOff size={18} color={theme.muted} accessible={false} />
          ) : (
            <Eye size={18} color={theme.muted} accessible={false} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

function Form() {
  const { api, session, logout } = useSession();
  const theme = useTheme();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [key, setKey] = useState("");
  const [exit, setExit] = useState<(() => void) | null>(null);
  const [leaving, setLeaving] = useState(false);
  const alive = useRef(true);
  const running = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const prevent = usePreventRemove(
    !leaving && (busy || pending || !!current || !!password || !!confirmation),
    ({ repeat }) => {
      if (!busy) setExit(() => repeat);
    },
  );

  function review() {
    try {
      validateNewPassword(password);
      if (!current) throw Error("Nhập mật khẩu hiện tại.");
      if (password !== confirmation)
        throw Error("Nhập lại mật khẩu mới chưa khớp.");
      if (current === password)
        throw Error("Mật khẩu mới cần khác mật khẩu hiện tại.");
      setError("");
      setConfirm(true);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  async function save() {
    if (!api || !session || running.current) return;
    running.current = true;
    setBusy(true);
    setConfirm(false);
    setError("");
    try {
      const scope = {
        origin: api.origin,
        userId: session.user.id,
        storeId: session.user.allStores ? null : session.user.storeId,
        allStores: session.user.allStores,
      };
      const intent = await pendingWrites.reserveExclusive(
        scope,
        "account.change-password",
        ["account.change-password"],
        () => uuid.v4().toLowerCase(),
      );
      if (!alive.current) return;
      setPending(true);
      if (!intent.created)
        throw Error(
          "Còn lần đổi mật khẩu chưa đối chiếu. Đăng nhập lại và kiểm tra mã gốc trong Tài khoản.",
        );
      setLeaving(true);
      prevent();
      await api.changeOwnPassword({ current, password, confirmation }, intent.key);
      if (!alive.current) return;
      setCurrent("");
      setPassword("");
      setConfirmation("");
      setKey(intent.key);
    } catch (cause) {
      if (alive.current) {
        setLeaving(false);
        setError((cause as Error).message);
      }
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  }

  async function finish() {
    if (!api || !session || !key || busy) return;
    setBusy(true);
    setError("");
    try {
      const scope = {
        origin: api.origin,
        userId: session.user.id,
        storeId: session.user.allStores ? null : session.user.storeId,
        allStores: session.user.allStores,
      };
      const original = await pendingWrites.entryScope(
        scope,
        "account.change-password",
        key,
      );
      if (original)
        await pendingWrites.complete(original, "account.change-password", key);
      if (!alive.current) return;
      setLeaving(true);
      prevent();
      await logout();
    } catch (cause) {
      if (alive.current) setError((cause as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  return (
    <SafeAreaView
      edges={["left", "right", "bottom"]}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 32,
            gap: 12,
            maxWidth: 760,
            width: "100%",
            alignSelf: "center",
          }}
        >
          {key ? (
            <Card style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: theme.successBackground,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <KeyRound size={20} color={theme.success} accessible={false} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    style={{ color: theme.text, fontSize: 17, fontWeight: "700" }}
                  >
                    Đã đổi mật khẩu
                  </Text>
                  <StatusBadge status="completed" label="Thành công" />
                </View>
              </View>
              <InfoBanner
                tone="success"
                message="Phiên đăng nhập cũ sẽ hết hiệu lực. Dùng mật khẩu mới để đăng nhập lại."
              />
              <Button
                label="Xác nhận đổi mật khẩu và đăng nhập lại"
                loading={busy}
                onPress={() => {
                  void finish();
                }}
              />
            </Card>
          ) : (
            <>
              <InfoBanner
                tone="info"
                title="Quy tắc mật khẩu"
                message="Ít nhất 8 ký tự, không quá 72 byte và phải khác mật khẩu hiện tại. Sau khi đổi, mọi phiên cũ sẽ đăng xuất."
              />
              <Card style={{ gap: 12 }}>
                <PasswordInput
                  label="Mật khẩu hiện tại"
                  value={current}
                  onChangeText={setCurrent}
                  shown={showCurrent}
                  onToggleShown={() => setShowCurrent((v) => !v)}
                  maxLength={256}
                  editable={!busy && !pending}
                />
                <PasswordInput
                  label="Mật khẩu mới"
                  value={password}
                  onChangeText={setPassword}
                  shown={showNew}
                  onToggleShown={() => setShowNew((v) => !v)}
                  maxLength={128}
                  editable={!busy && !pending}
                />
                <PasswordInput
                  label="Nhập lại mật khẩu mới"
                  value={confirmation}
                  onChangeText={setConfirmation}
                  shown={showConfirm}
                  onToggleShown={() => setShowConfirm((v) => !v)}
                  maxLength={128}
                  editable={!busy && !pending}
                />
                <Button
                  label="Rà soát đổi mật khẩu"
                  loading={busy}
                  disabled={pending}
                  onPress={review}
                />
              </Card>
            </>
          )}

          {!!error && <InlineError message={error} />}

          {pending && !key && !busy && (
            <InfoBanner
              tone="warning"
              title="Cần đối chiếu yêu cầu đang chờ"
              message="Nếu kết nối bị gián đoạn lúc gửi, hãy đối chiếu mã gốc trong màn hình Tài khoản trước khi gửi lại."
              action={
                <Button
                  size="sm"
                  secondary
                  label="Đối chiếu trong Tài khoản"
                  onPress={() => {
                    setLeaving(true);
                    prevent();
                    router.push("/(tabs)/account");
                  }}
                />
              }
            />
          )}

          {confirm && (
            <ConfirmEdit
              title="Đổi mật khẩu đăng nhập?"
              message="Sau khi đổi, các phiên cũ hết hiệu lực. Bạn cần đăng nhập lại bằng mật khẩu mới."
              confirmLabel="Xác nhận đổi mật khẩu"
              onCancel={() => setConfirm(false)}
              onConfirm={() => {
                void save();
              }}
            />
          )}
          {exit && (
            <ConfirmEdit
              title="Rời phần đổi mật khẩu?"
              message={
                pending
                  ? "Mã gốc vẫn giữ để đối chiếu sau khi đăng nhập lại."
                  : "Thông tin chưa gửi sẽ bị bỏ."
              }
              confirmLabel="Rời phần đổi mật khẩu"
              onCancel={() => setExit(null)}
              onConfirm={() => {
                const repeat = exit;
                setExit(null);
                setLeaving(true);
                prevent();
                repeat();
              }}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function Route() {
  const { api, session } = useSession();
  if (!api || !session) return <StateView title="Chưa mở được đổi mật khẩu" />;
  return (
    <Form
      key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`}
    />
  );
}
