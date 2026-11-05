import { useId } from "react";
import { Text, View } from "react-native";
import { useTheme } from "@/theme";
import type { DateFieldProps } from "./date-field.types";
export function TimeField({
  label,
  value,
  onChange,
  disabled,
  error,
}: DateFieldProps) {
  const theme = useTheme(),
    id = useId();
  const font =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
  return (
    <View style={{ gap: 8 }}>
      <label
        htmlFor={id}
        style={{
          color: theme.text,
          fontFamily: font,
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        {label}
      </label>
      <input
        id={id}
        type="time"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        style={{
          minHeight: 56,
          boxSizing: "border-box",
          width: "100%",
          minWidth: 0,
          padding: 14,
          borderRadius: 12,
          border: `1px solid ${error ? theme.danger : theme.controlBorder}`,
          backgroundColor: theme.surface,
          color: theme.text,
          fontFamily: font,
          fontSize: 16,
          colorScheme: "light dark",
        }}
      />
      {!!error && (
        <Text
          nativeID={`${id}-error`}
          accessibilityRole="alert"
          style={{ color: theme.danger, fontSize: 13 }}
        >
          {error}
        </Text>
      )}
    </View>
  );
}
