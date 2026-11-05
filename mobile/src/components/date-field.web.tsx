import { useId } from "react";
import { Text, View } from "react-native";
import type { DateFieldProps } from "./date-field.types";
import { useTheme } from "@/theme";
export function DateField({
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
          fontSize: 14,
          fontWeight: 600,
          fontFamily: font,
        }}
      >
        {label}
      </label>
      <input
        id={id}
        type="date"
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
          padding: "14px",
          border: `1px solid ${error ? theme.danger : theme.controlBorder}`,
          borderRadius: 12,
          color: theme.text,
          backgroundColor: theme.surface,
          fontSize: 16,
          fontFamily: font,
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
