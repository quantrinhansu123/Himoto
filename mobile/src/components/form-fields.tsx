import { createContext, useContext, useId, useState, type Ref } from "react";
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputInstance,
  type TextInputProps,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Check, ChevronDown, X } from "lucide-react-native";
import { useTheme } from "@/theme";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

export const KeyboardScrollContext = createContext<((target: any) => void) | null>(null);

export function FormField({
  label,
  error,
  hint,
  inputRef,
  onFocus,
  ...props
}: TextInputProps & {
  label: string;
  error?: string;
  hint?: string;
  inputRef?: Ref<TextInputInstance>;
}) {
  const theme = useTheme(),
    id = useId();
  const scrollIntoView = useContext(KeyboardScrollContext);

  return (
    <View style={{ gap: 5 }}>
      <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: "600" }}>
        {label}
      </Text>
      <TextInput
        {...props}
        ref={inputRef}
        accessibilityLabel={label}
        aria-describedby={error || hint ? id : undefined}
        placeholderTextColor={theme.muted}
        autoCorrect={false}
        onFocus={(e) => {
          scrollIntoView?.(e.target);
          onFocus?.(e);
        }}
        style={[
          {
            color: theme.text,
            backgroundColor: theme.surface,
            borderColor: error ? theme.danger : theme.controlBorder,
            borderWidth: 1,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            minHeight: 46,
            fontSize: 15,
          },
          props.multiline && { minHeight: 84, textAlignVertical: "top" },
          props.style,
        ]}
      />
      {!!(error || hint) && (
        <Text
          nativeID={id}
          accessibilityRole={error ? "alert" : undefined}
          style={{
            color: error ? theme.danger : theme.muted,
            fontSize: 12.5,
            lineHeight: 18,
          }}
        >
          {error || hint}
        </Text>
      )}
    </View>
  );
}
export function ChoiceField({
  label,
  value,
  choices,
  onChange,
  disabled,
  error,
  searchable = false,
  mode = "auto",
  placeholder = 'Chọn một mục',
}: {
  label: string;
  value: string;
  choices: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  searchable?: boolean;
  mode?: "auto" | "chips" | "modal";
  placeholder?: string;
}) {
  const theme = useTheme(),
    reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState("");
  const useInlineChips =
    mode === "chips" ||
    (mode === "auto" &&
      !searchable &&
      choices.length >= 2 &&
      choices.length <= 3 &&
      choices.every((item) => item.label.length <= 24));
  const selected =
    choices.find((item) => item.value === value)?.label || placeholder;
  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase();
  const filtered = choices.filter((item) =>
    normalize(item.label).includes(normalize(search.trim())),
  );
  if (useInlineChips) {
    return (
      <View style={{ gap: 6 }}>
        <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: "600" }}>
          {label}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
          {choices.map((item) => {
            const active = item.value === value;
            return (
              <Pressable
                key={item.value}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${item.label}`}
                accessibilityState={{ selected: active, disabled: !!disabled }}
                aria-selected={active}
                disabled={disabled}
                onPress={() => {
                  Keyboard.dismiss();
                  onChange(item.value);
                }}
                style={({ pressed }) => ({
                  flexGrow: 1,
                  minHeight: 42,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: active ? theme.primary : theme.controlBorder,
                  backgroundColor: active ? theme.tint : theme.surface,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  opacity: disabled ? 0.55 : pressed ? 0.76 : 1,
                })}
              >
                {active && (
                  <Check size={15} color={theme.primary} accessible={false} />
                )}
                <Text
                  numberOfLines={1}
                  style={{
                    color: active ? theme.primary : theme.text,
                    fontSize: 13.5,
                    fontWeight: active ? "700" : "600",
                    textAlign: "center",
                  }}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {!!error && (
          <Text
            accessibilityRole="alert"
            style={{ color: theme.danger, fontSize: 12.5 }}
          >
            {error}
          </Text>
        )}
      </View>
    );
  }
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: "600" }}>
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: selected }}
        accessibilityState={{ disabled: !!disabled, expanded: open }}
        aria-expanded={open}
        disabled={disabled}
        onPress={() => {
          Keyboard.dismiss();
          setSearch("");
          setOpen(true);
        }}
        style={{
          minHeight: 46,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: error ? theme.danger : theme.controlBorder,
          paddingHorizontal: 12,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          backgroundColor: theme.surface,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <Text numberOfLines={1} style={{ color: theme.text, fontSize: 15, flex: 1 }}>
          {selected}
        </Text>
        <ChevronDown size={18} color={theme.muted} accessible={false} />
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
        <Modal
          transparent
          statusBarTranslucent
          animationType={reducedMotion ? "none" : "fade"}
          onRequestClose={() => setOpen(false)}
        >
          <SafeAreaProvider>
          <KeyboardScrollContext.Provider value={null}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            <View
              style={{
                flex: 1,
                justifyContent: "flex-end",
                backgroundColor: theme.scrim,
              }}
            >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Đóng danh sách ${label.toLowerCase()}`}
              onPress={() => setOpen(false)}
              style={{ position: "absolute", inset: 0 }}
            />
            <SafeAreaView
              edges={["bottom", "left", "right"]}
              accessibilityViewIsModal
              style={{
                maxHeight: "85%",
                flexShrink: 1,
                overflow: 'hidden',
                backgroundColor: theme.surface,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                maxWidth: 760,
                width: "100%",
                alignSelf: "center",
              }}
            >
              <View
                style={{
                  padding: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <Text
                  accessibilityRole="header"
                  style={{
                    color: theme.text,
                    fontSize: 22,
                    fontWeight: "700",
                    flex: 1,
                  }}
                >
                  {label}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Đóng ${label}`}
                  onPress={() => setOpen(false)}
                  style={{
                    minHeight: 48,
                    minWidth: 48,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <X color={theme.text} size={22} accessible={false} />
                </Pressable>
              </View>
              {searchable && (
                <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                  <FormField
                    label={`Tìm ${label.toLowerCase()}`}
                    value={search}
                    onChangeText={setSearch}
                    autoCapitalize="none"
                  />
                </View>
              )}
              <FlatList
                style={{ flexShrink: 1, minHeight: 0 }}
                data={filtered}
                keyExtractor={(item) => item.value}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={{ padding: 16, paddingTop: 0 }}
                renderItem={({ item }) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    accessibilityState={{ selected: item.value === value }}
                    aria-selected={item.value === value}
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                    style={{
                      minHeight: 56,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor:
                        item.value === value
                          ? theme.primary
                          : theme.controlBorder,
                      padding: 14,
                      marginBottom: 8,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      backgroundColor:
                        item.value === value ? theme.tint : theme.surface,
                    }}
                  >
                    <Text style={{ color: theme.text, fontSize: 16, flex: 1 }}>
                      {item.label}
                    </Text>
                    {item.value === value && (
                      <Check
                        color={theme.primary}
                        size={22}
                        accessible={false}
                      />
                    )}
                  </Pressable>
                )}
                ListEmptyComponent={
                  <Text style={{ color: theme.muted, paddingVertical: 20 }}>
                    Không có mục phù hợp.
                  </Text>
                }
              />
            </SafeAreaView>
          </View>
        </KeyboardAvoidingView>
          </KeyboardScrollContext.Provider>
          </SafeAreaProvider>
      </Modal>
      )}
    </View>
  );
}
