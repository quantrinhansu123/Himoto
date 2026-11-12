import type { PropsWithChildren } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { useTheme } from "@/theme";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { Button } from "./ui";

export function EditorSheet({
  title,
  onClose,
  children,
}: PropsWithChildren<{ title: string; onClose: () => void }>) {
  const theme = useTheme(),
    reduced = useReducedMotion();
  return (
    <Modal animationType={reduced ? "none" : "slide"} onRequestClose={onClose}>
      <SafeAreaProvider>
      <SafeAreaView
        accessibilityViewIsModal
        style={{ flex: 1, backgroundColor: theme.surface }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, maxWidth: 760, width: "100%", alignSelf: "center" }}
        >
          <View
            style={{
              paddingHorizontal: 18,
              paddingVertical: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
            }}
          >
            <Text
              accessibilityRole="header"
              style={{
                flex: 1,
                fontSize: 21,
                fontWeight: "700",
                color: theme.text,
              }}
            >
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Đóng ${title.toLowerCase()}`}
              onPress={() => {
                Keyboard.dismiss();
                onClose();
              }}
              style={{
                minWidth: 48,
                minHeight: 48,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={23} color={theme.text} accessible={false} />
            </Pressable>
          </View>
          {children}
        </KeyboardAvoidingView>
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
export function ConfirmEdit({
  title,
  message,
  onCancel,
  onConfirm,
  confirmLabel = "Xác nhận",
  busy = false,
}: {
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  busy?: boolean;
}) {
  const theme = useTheme(),
    reduced = useReducedMotion();
  return (
    <Modal
      transparent
      animationType={reduced ? "none" : "fade"}
      onRequestClose={onCancel}
    >
      <SafeAreaProvider>
      <SafeAreaView
        accessibilityViewIsModal
        style={{
          flex: 1,
          padding: 20,
          backgroundColor: theme.scrim,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={{
            maxHeight: "90%",
            maxWidth: 440,
            width: "100%",
            flexGrow: 0,
            borderRadius: 20,
            backgroundColor: theme.surface,
          }}
          contentContainerStyle={{ padding: 22, gap: 16 }}
        >
          <Text
            accessibilityRole="header"
            style={{ color: theme.text, fontSize: 22, fontWeight: "700" }}
          >
            {title}
          </Text>
          <Text style={{ color: theme.muted, fontSize: 15, lineHeight: 24 }}>
            {message}
          </Text>
          <Button
            secondary
            label={busy ? "Tiếp tục chờ" : "Tiếp tục chỉnh sửa"}
            onPress={onCancel}
          />
          {!busy && onConfirm && (
            <Button label={confirmLabel} onPress={onConfirm} />
          )}
        </ScrollView>
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
