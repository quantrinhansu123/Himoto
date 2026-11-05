import { Text, View } from "react-native";
import { DateField } from "./date-field";
import { TimeField } from "./time-field";
import { useTheme } from "@/theme";
export function RentalDateTime({
  label,
  value,
  onChange,
  disabled,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  const theme = useTheme();
  const [date = "", time = ""] = value.split("T");
  return (
    <View style={{ gap: 14 }}>
      <DateField
        label={`Ngày ${label}`}
        value={date}
        onChange={(day) => onChange(day ? `${day}T${time || "08:00"}` : "")}
        disabled={disabled}
      />
      <TimeField
        label={`Giờ ${label}`}
        value={time}
        onChange={(clock) => onChange(date ? `${date}T${clock}` : "")}
        disabled={disabled || !date}
      />
      {!!error && (
        <Text
          accessibilityRole="alert"
          style={{ color: theme.danger, fontSize: 13 }}
        >
          {error}
        </Text>
      )}
    </View>
  );
}
