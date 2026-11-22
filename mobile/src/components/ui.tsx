import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import { AlertCircle, Check, Info } from "lucide-react-native";
import type { PropsWithChildren, ReactNode } from "react";
import { cardShadow, statuses, useTheme } from "@/theme";

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <View style={[styles.brand, small && { padding: 6, borderRadius: 10 }]}>
      <Image
        source={require("../../assets/logo.png")}
        contentFit="contain"
        accessibilityLabel="Himoto"
        style={{ width: small ? 104 : 184, height: small ? 24 : 40 }}
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
  equalWidth = false,
  size = "md",
  icon,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  equalWidth?: boolean;
  size?: "sm" | "md";
  icon?: ReactNode;
}) {
  const theme = useTheme();
  const compact = size === "sm";
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
        compact && styles.buttonSmall,
        equalWidth && styles.equalWidthButton,
        {
          backgroundColor: bg,
          borderColor: border,
          opacity: disabled ? 0.52 : pressed ? 0.78 : 1,
        },
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={textColor} /> : icon}
      <Text
        numberOfLines={2}
        style={[
          styles.buttonText,
          compact && styles.buttonTextSmall,
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
        cardShadow,
        { backgroundColor: theme.surface, borderColor: theme.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function KeyValueRow({
  label,
  value,
  valueColor,
  strong = false,
  selectable = false,
}: {
  label: string;
  value: string | number | null | undefined;
  valueColor?: string;
  strong?: boolean;
  selectable?: boolean;
}) {
  const theme = useTheme();
  const display =
    value === null || value === undefined || value === "" ? "—" : String(value);
  return (
    <View style={styles.kvRow}>
      <Text style={[styles.kvLabel, { color: theme.muted }]}>{label}</Text>
      <Text
        selectable={selectable}
        style={[
          styles.kvValue,
          {
            color: valueColor || theme.text,
            fontWeight: strong ? "700" : "600",
          },
        ]}
      >
        {display}
      </Text>
    </View>
  );
}

export function Chip({
  label,
  selected = false,
  disabled = false,
  count,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  count?: number;
  onPress: () => void;
  icon?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count !== undefined ? `${label} (${count})` : label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: selected ? theme.primary : theme.border,
          backgroundColor: selected ? theme.tint : theme.surface,
          opacity: disabled ? 0.5 : pressed ? 0.76 : 1,
        },
      ]}
    >
      {icon}
      {selected && !icon && (
        <Check size={14} color={theme.primary} accessible={false} />
      )}
      <Text
        numberOfLines={1}
        style={{
          color: selected ? theme.primary : theme.text,
          fontSize: 13,
          fontWeight: selected ? "700" : "600",
        }}
      >
        {label}
        {count !== undefined ? ` (${count.toLocaleString("vi-VN")})` : ""}
      </Text>
    </Pressable>
  );
}

export function SegmentedBar<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  scrollable = false,
}: {
  options: readonly { value: T; label: string; count?: number }[];
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
  scrollable?: boolean;
}) {
  const theme = useTheme();
  const content = options.map((opt) => {
    const active = opt.value === value;
    return (
      <Pressable
        key={opt.value}
        accessibilityRole="tab"
        accessibilityState={{ selected: active, disabled }}
        disabled={disabled}
        onPress={() => onChange(opt.value)}
        style={({ pressed }) => [
          styles.segmentItem,
          !scrollable && { flex: 1 },
          {
            backgroundColor: active ? theme.surface : "transparent",
            borderColor: active ? theme.border : "transparent",
            opacity: disabled ? 0.55 : pressed ? 0.78 : 1,
          },
          active && cardShadow,
        ]}
      >
        <Text
          numberOfLines={1}
          style={{
            color: active ? theme.primary : theme.muted,
            fontSize: 13,
            fontWeight: active ? "700" : "600",
            textAlign: "center",
          }}
        >
          {opt.label}
          {opt.count !== undefined
            ? ` (${opt.count.toLocaleString("vi-VN")})`
            : ""}
        </Text>
      </Pressable>
    );
  });

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[
          styles.segmentTrack,
          { backgroundColor: theme.background, borderColor: theme.border },
        ]}
        contentContainerStyle={{ gap: 4, padding: 3 }}
      >
        {content}
      </ScrollView>
    );
  }
  return (
    <View
      style={[
        styles.segmentTrack,
        {
          backgroundColor: theme.background,
          borderColor: theme.border,
          flexDirection: "row",
          padding: 3,
          gap: 4,
        },
      ]}
    >
      {content}
    </View>
  );
}

export function InfoBanner({
  tone = "info",
  title,
  message,
  action,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  message: string;
  action?: ReactNode;
}) {
  const theme = useTheme();
  const palette = {
    info: { bg: theme.infoBackground, fg: theme.info, border: theme.info },
    warning: {
      bg: theme.warningBackground,
      fg: theme.warning,
      border: theme.warning,
    },
    danger: {
      bg: theme.dangerBackground,
      fg: theme.danger,
      border: theme.danger,
    },
    success: {
      bg: theme.successBackground,
      fg: theme.success,
      border: theme.success,
    },
  }[tone];
  return (
    <View
      accessibilityRole={tone === "danger" ? "alert" : undefined}
      style={[
        styles.banner,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
        {tone === "danger" || tone === "warning" ? (
          <AlertCircle size={18} color={palette.fg} accessible={false} />
        ) : (
          <Info size={18} color={palette.fg} accessible={false} />
        )}
        <View style={{ flex: 1, gap: 3 }}>
          {!!title && (
            <Text style={{ color: palette.fg, fontSize: 14, fontWeight: "700" }}>
              {title}
            </Text>
          )}
          <Text style={{ color: palette.fg, fontSize: 13.5, lineHeight: 20 }}>
            {message}
          </Text>
        </View>
      </View>
      {action}
    </View>
  );
}

export function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          accessibilityRole="header"
          style={{ color: theme.text, fontSize: 18, fontWeight: "800" }}
        >
          {title}
        </Text>
        {!!subtitle && (
          <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18 }}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
    </View>
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  const theme = useTheme();
  return (
    <Card style={{ gap: 10, padding: 14 }}>
      <View
        style={{
          height: 16,
          width: "55%",
          borderRadius: 6,
          backgroundColor: theme.border,
          opacity: 0.65,
        }}
      />
      {Array.from({ length: Math.max(1, lines - 1) }).map((_, index) => (
        <View
          key={index}
          style={{
            height: 12,
            width: index % 2 === 0 ? "85%" : "68%",
            borderRadius: 6,
            backgroundColor: theme.border,
            opacity: 0.45,
          }}
        />
      ))}
    </Card>
  );
}

export function InlineError({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.error,
        { backgroundColor: theme.dangerBackground, borderColor: theme.danger },
      ]}
    >
      <AlertCircle size={18} color={theme.danger} accessible={false} />
      <Text
        style={{ flex: 1, color: theme.danger, fontSize: 14, lineHeight: 21 }}
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
          fontSize: 18,
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
            fontSize: 14.5,
            lineHeight: 22,
            textAlign: "center",
          }}
        >
          {message}
        </Text>
      )}
      {retry && <Button size="sm" label="Thử lại" secondary onPress={retry} />}
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
  const danger = ["overdue", "bad_debt", "blacklist", "broken", "cancelled"].includes(
    status,
  );
  const success = ["ready", "active", "completed", "opening", "matched", "confirmed"].includes(
    status,
  );
  const warning = [
    "pending",
    "in_transit",
    "wait_payment",
    "warning",
    "deposit_contract",
    "repairing",
    "cancel_pending_settlement",
  ].includes(status);
  const info = ["renting", "using", "reserved"].includes(status);

  const color = danger
    ? theme.danger
    : success
      ? theme.success
      : warning
        ? theme.warning
        : info
          ? theme.info
          : theme.muted;
  const backgroundColor = danger
    ? theme.dangerBackground
    : success
      ? theme.successBackground
      : warning
        ? theme.warningBackground
        : info
          ? theme.infoBackground
          : theme.background;
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor, borderColor: `${color}33`, borderWidth: 1 },
      ]}
    >
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <Text style={{ color, fontSize: 12, fontWeight: "700", lineHeight: 16 }}>
        {label || statuses[status] || status || "Chưa xác định"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  brand: {
    alignSelf: "flex-start",
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  button: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 11,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  buttonSmall: {
    minHeight: 38,
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
  },
  equalWidthButton: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
    paddingHorizontal: 10,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
    flexShrink: 1,
  },
  buttonTextSmall: {
    fontSize: 13.5,
  },
  card: { padding: 15, borderWidth: 1, borderRadius: 14 },
  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 3,
  },
  kvLabel: { fontSize: 13, lineHeight: 19, flexShrink: 1 },
  kvValue: { fontSize: 13.5, lineHeight: 19, textAlign: "right", flexShrink: 1 },
  chip: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  segmentTrack: {
    borderWidth: 1,
    borderRadius: 11,
  },
  segmentItem: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  banner: {
    padding: 12,
    borderRadius: 11,
    borderWidth: 1,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  error: {
    padding: 13,
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  state: {
    padding: 24,
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 999,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
