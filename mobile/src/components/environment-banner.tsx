import { Text, View } from "react-native";
import { useTheme } from "@/theme";
import { SafeAreaView } from "react-native-safe-area-context";

export function EnvironmentBanner() {
  const theme = useTheme();
  const environment = process.env.EXPO_PUBLIC_ENVIRONMENT || (__DEV__ ? "development" : undefined);
  if (!["qa", "staging", "development"].includes(environment || "")) return null;
  return (
    <SafeAreaView edges={["top"]} style={{ backgroundColor: theme.surface }}>
    <View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border }}>
      <Text accessibilityRole="text" style={{ color: theme.warning, fontSize: 13, lineHeight: 19, textAlign: "center" }}>
        {environment === "qa" ? "BẢN KIỂM THỬ · DỮ LIỆU QA, KHÔNG PHẢI DỮ LIỆU THẬT" : environment === "staging" ? "MÔI TRƯỜNG STAGING · DỮ LIỆU KIỂM THỬ" : "BẢN PHÁT TRIỂN · CHƯA XÁC NHẬN DỮ LIỆU THẬT"}
      </Text>
    </View>
    </SafeAreaView>
  );
}
