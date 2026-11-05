import { useState } from "react";
import { Keyboard, Platform, Pressable, Text, View } from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { Clock3 } from "lucide-react-native";
import { useTheme } from "@/theme";
import type { DateFieldProps } from "./date-field.types";
import { EditorSheet } from "./editor-sheet";
import { Button } from "./ui";
export function TimeField({
  label,
  value,
  onChange,
  disabled,
  error,
}: DateFieldProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState(new Date()),
    [open, setOpen] = useState(false);
  const clock = (date: Date) =>
    `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  function show() {
    Keyboard.dismiss();
    const selected = new Date();
    const [hour, minute] = /^\d{2}:\d{2}$/.test(value)
      ? value.split(":").map(Number)
      : [8, 0];
    selected.setHours(hour, minute, 0, 0);
    if (Platform.OS === "android")
      DateTimePickerAndroid.open({
        mode: "time",
        value: selected,
        is24Hour: true,
        positiveButton: { label: "Chọn", textColor: theme.primary },
        negativeButton: { label: "Hủy" },
        onValueChange: (_event, date) => onChange(clock(date)),
      });
    else {
      setDraft(selected);
      setOpen(true);
    }
  }
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}>
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: value || "Chọn giờ" }}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={show}
        style={{
          minHeight: 56,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: error ? theme.danger : theme.controlBorder,
          padding: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Clock3 size={21} color={theme.muted} accessible={false} />
        <Text style={{ color: theme.text, fontSize: 16 }}>
          {value || "Chọn giờ"}
        </Text>
      </Pressable>
      {!!error && (
        <Text
          accessibilityRole="alert"
          style={{ color: theme.danger, fontSize: 13 }}
        >
          {error}
        </Text>
      )}
      {open && (
        <EditorSheet title={label} onClose={() => setOpen(false)}>
          <View style={{ padding: 22, gap: 20 }}>
            <DateTimePicker
              mode="time"
              display="spinner"
              locale="vi-VN"
              is24Hour
              value={draft}
              textColor={theme.text}
              accentColor={theme.primary}
              onValueChange={(_event, date) => setDraft(date)}
            />
            <Button
              label="Chọn giờ"
              onPress={() => {
                onChange(clock(draft));
                setOpen(false);
              }}
            />
            <Button secondary label="Hủy" onPress={() => setOpen(false)} />
          </View>
        </EditorSheet>
      )}
    </View>
  );
}
