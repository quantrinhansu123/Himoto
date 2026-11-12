import { Tabs } from "expo-router";
import { useQueryClient } from '@tanstack/react-query';
import { refreshActiveLookups } from '@/lib/query-persistence';
import {
  CarFront,
  Files,
  House,
  UsersRound,
  CircleUserRound,
} from "lucide-react-native";
import { useSession } from "@/providers/session";
import { useTheme } from "@/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWindowDimensions } from "react-native";
export default function TabLayout() {
  const cache = useQueryClient();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const { session } = useSession();
  const permissions = session?.user.permissions || [];
  return (
    <Tabs
      screenListeners={{ tabPress: () => { void refreshActiveLookups(cache); } }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          height: 68 + Math.max(0, fontScale - 1) * 32 + insets.bottom,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
        },
        tabBarLabelStyle: { fontSize: 11.5, lineHeight: 15, fontWeight: "600" },
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: theme.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Thao tác",
          tabBarIcon: ({ color, size }) => (
            <House color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="vehicles"
        options={{
          title: "Danh sách xe",
          href: permissions.includes("vehicles.read") ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <CarFront color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="contracts"
        options={{
          title: "Hợp đồng",
          href: permissions.includes("contracts.read") ? undefined : null,
          tabBarIcon: ({ color, size }) => <Files color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: "Khách hàng",
          href: permissions.includes("customers.read") ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <UsersRound color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Tài khoản",
          tabBarIcon: ({ color, size }) => (
            <CircleUserRound color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
