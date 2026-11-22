import { useState } from "react";
import { Keyboard, Modal, Platform, Pressable, Text, View } from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { CalendarDays, X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "./ui";
import { dateLabel, dateValue, type DateFieldProps } from "./date-field.types";
import { useTheme } from "@/theme";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

export function DateField({
  label,
  value,
  onChange,
  disabled,
  error,
}: DateFieldProps) {
  const theme = useTheme(),
    reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState(new Date());
  function show() {
    Keyboard.dismiss();
    const parsed = value ? new Date(`${value}T12:00:00`) : new Date();
    const selected = Number.isFinite(parsed.getTime()) ? parsed : new Date();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        mode: "date",
        value: selected,
        positiveButton: { label: "Chọn", textColor: theme.primary },
        negativeButton: { label: "Hủy" },
        onValueChange: (_event, date) => onChange(dateValue(date)),
      });
    } else {
      setDraft(selected);
      setOpen(true);
    }
  }
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: "600" }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityValue={{ text: dateLabel(value) }}
          disabled={disabled}
          onPress={show}
          style={{
            flex: 1,
            minHeight: 46,
            paddingHorizontal: 12,
            paddingVertical: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderWidth: 1,
            borderRadius: 10,
            borderColor: error ? theme.danger : theme.controlBorder,
            backgroundColor: theme.surface,
          }}
        >
          <CalendarDays size={18} color={theme.muted} accessible={false} />
          <Text
            numberOfLines={1}
            style={{
              color: value ? theme.text : theme.muted,
              fontSize: 14.5,
              flex: 1,
            }}
          >
            {dateLabel(value)}
          </Text>
        </Pressable>
        {!!value && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Xóa ${label.toLowerCase()}`}
            disabled={disabled}
            onPress={() => onChange("")}
            style={{
              minWidth: 42,
              minHeight: 46,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={18} color={theme.muted} accessible={false} />
          </Pressable>
        )}
      </View>
      {!!error && (
        <Text
          accessibilityRole="alert"
          style={{ color: theme.danger, fontSize: 13 }}
        >
          {error}
        </Text>
      )}
      {open && (
        <Modal
          transparent
          animationType={reducedMotion ? "none" : "fade"}
          onRequestClose={() => setOpen(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: theme.scrim,
              justifyContent: "flex-end",
            }}
          >
            <SafeAreaView
              edges={["bottom", "left", "right"]}
              accessibilityViewIsModal
              style={{
                padding: 20,
                gap: 16,
                backgroundColor: theme.surface,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
              }}
            >
              <Text
                accessibilityRole="header"
                style={{ color: theme.text, fontSize: 22, fontWeight: "700" }}
              >
                {label}
              </Text>
              <DateTimePicker
                mode="date"
                display="spinner"
                locale="vi-VN"
                value={draft}
                textColor={theme.text}
                accentColor={theme.primary}
                onValueChange={(_event, date) => setDraft(date)}
              />
              <Button
                label="Chọn ngày"
                onPress={() => {
                  onChange(dateValue(draft));
                  setOpen(false);
                }}
              />
              <Button secondary label="Hủy" onPress={() => setOpen(false)} />
            </SafeAreaView>
          </View>
        </Modal>
      )}
    </View>
  );
}
