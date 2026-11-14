import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import { AlertCircle } from "lucide-react-native";
import type { PropsWithChildren } from "react";
import { statuses, useTheme } from "@/theme";
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <View style={[styles.brand, small && { padding: 8 }]}>
      <Image
        source={require("../../assets/logo.png")}
        contentFit="contain"
        accessibilityLabel="Himoto"
        style={{ width: small ? 108 : 188, height: small ? 26 : 42 }}
      />
    </View>
  );
}
export function Button({
  label,
  onPress,
  loading = false,
  secondary = false,
  danger = false,
  disabled = false,
  icon,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  const theme = useTheme();
  const bg = danger
    ? theme.dangerBackground
    : secondary
      ? theme.surface
      : theme.primary;
  const border = danger
    ? theme.danger
    : secondary
      ? theme.controlBorder
      : theme.primary;
  const textColor = danger
    ? theme.danger
    : secondary
      ? theme.text
      : theme.primaryText;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      aria-disabled={disabled || loading}
      aria-busy={loading}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderColor: border,
          opacity: disabled ? 0.55 : pressed ? 0.75 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        icon
      )}
      <Text
        style={[
          styles.buttonText,
          { color: textColor },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function Card({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function InlineError({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.error, { backgroundColor: theme.dangerBackground }]}
    >
      <AlertCircle size={20} color={theme.danger} accessible={false} />
      <Text
        style={{ flex: 1, color: theme.danger, fontSize: 15, lineHeight: 23 }}
      >
        {message}
      </Text>
    </View>
  );
}
export function StateView({
  title,
  message,
  loading = false,
  retry,
}: {
  title: string;
  message?: string;
  loading?: boolean;
  retry?: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.state}>
      {loading && (
        <ActivityIndicator
          size="large"
          color={theme.primary}
          accessibilityLabel="Đang tải"
        />
      )}
      <Text
        accessibilityRole="header"
        style={{
          color: theme.text,
          fontSize: 20,
          fontWeight: "700",
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      {!!message && (
        <Text
          style={{
            color: theme.muted,
            fontSize: 16,
            lineHeight: 25,
            textAlign: "center",
          }}
        >
          {message}
        </Text>
      )}
      {retry && <Button label="Thử lại" secondary onPress={retry} />}
    </View>
  );
}
export function StatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  const theme = useTheme();
  const danger = ["overdue", "bad_debt", "blacklist", "broken"].includes(
    status,
  );
  const success = ["ready", "active", "completed"].includes(status);
  const warning = [
    "pending",
    "in_transit",
    "wait_payment",
    "warning",
    "deposit_contract",
  ].includes(status);
  const color = danger
    ? theme.danger
    : success
      ? theme.success
      : warning
        ? theme.warning
        : theme.muted;
  const backgroundColor = danger
    ? theme.dangerBackground
    : success
      ? theme.successBackground
      : warning
        ? theme.warningBackground
        : theme.background;
  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <Text style={{ color, fontSize: 12, fontWeight: "700", lineHeight: 18 }}>
        {label || statuses[status] || status || "Chưa xác định"}
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  brand: {
    alignSelf: "flex-start",
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  button: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  buttonText: { fontSize: 16, fontWeight: "700" },
  card: { padding: 20, borderWidth: 1, borderRadius: 20 },
  error: {
    padding: 16,
    borderRadius: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  state: {
    padding: 28,
    gap: 16,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  badge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
});
