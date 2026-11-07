import { useQueries } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CarFront,
  ChevronRight,
  Clock3,
  Files,
  FilePenLine,
  MapPin,
  UsersRound,
  Bell,
} from "lucide-react-native";
import type { CatalogueKind } from "@himoto/mobile-contract";
import { Brand, Card, InlineError, Button } from "@/components/ui";
import { useSession } from "@/providers/session";
import { useWorkspace } from "@/hooks/use-workspace";
import { useTheme, roles } from "@/theme";
import { WorkspaceLinks } from "@/components/workspace-links";

const modules = [
  {
    kind: "vehicles" as CatalogueKind,
    title: "Đội xe",
    description: "Biển số, tình trạng và cơ sở",
    icon: CarFront,
    href: "/(tabs)/vehicles" as const,
  },
  {
    kind: "contracts" as CatalogueKind,
    title: "Hợp đồng",
    description: "Khách thuê, thời hạn và số tiền",
    icon: Files,
    href: "/(tabs)/contracts" as const,
  },
  {
    kind: "customers" as CatalogueKind,
    title: "Khách hàng",
    description: "Hồ sơ và thông tin liên hệ",
    icon: UsersRound,
    href: "/(tabs)/customers" as const,
  },
];
export default function Overview() {
  const theme = useTheme();
  const { session, api, restore } = useSession();
  const workspace = useWorkspace();
  const available = modules.filter((item) =>
    session?.user.permissions.includes(`${item.kind}.read`),
  );
  const storeScope = (kind: CatalogueKind) => {
    if (kind === "vehicles" || session?.user.allStores) return "all";
    return session?.user.storeId ? String(session.user.storeId) : "all";
  };
  const queries = useQueries({
    queries: available.map((item) => ({
      queryKey: ["overview", session?.user.id, session?.user.storeId, session?.user.allStores, item.kind],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api!.catalogue(item.kind, `size=1&store=${storeScope(item.kind)}`, signal),
      enabled: !!api,
    })),
  });
  const refresh = () => {
    void restore(true);
    void workspace.refetch();
    queries.forEach((query) => {
      void query.refetch();
    });
  };
  const store = session?.user.allStores
    ? "Toàn bộ cơ sở"
    : workspace.data?.stores.find((item) => item.id === session?.user.storeId)
        ?.name || "Cơ sở được phân công";
  const shortcuts = [
    {
      label: "Xe lưu kho",
      description: "Xem xe sẵn sàng",
      icon: CarFront,
      permission: "vehicles.read",
      href: "/(tabs)/vehicles" as const,
      status: "ready",
    },
    {
      label: "Hợp đồng quá hạn",
      description: "Theo dõi cần xử lý",
      icon: Clock3,
      permission: "contracts.read",
      href: "/(tabs)/contracts" as const,
      status: "overdue",
    },
    {
      label: "Hợp đồng nháp",
      description: "Hồ sơ đang chuẩn bị",
      icon: FilePenLine,
      permission: "contracts.read",
      href: "/(tabs)/contracts" as const,
      status: "draft",
    },
  ].filter((item) => session?.user.permissions.includes(item.permission));
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={
              queries.some((query) => query.isRefetching) ||
              workspace.isRefetching
            }
            onRefresh={refresh}
            tintColor={theme.primary}
          />
        }
      >
        <View style={styles.row}>
          <Brand small />
          <View style={{flexDirection:'row',alignItems:'center',gap:12}}><Text style={{ color: theme.muted, fontSize: 14 }}>
            {new Intl.DateTimeFormat("vi-VN", {
              weekday: "short",
              day: "2-digit",
              month: "2-digit",
              timeZone: "Asia/Ho_Chi_Minh",
            }).format(new Date())}
          </Text><Pressable accessibilityRole="button" accessibilityLabel="Mở thông báo công việc" onPress={()=>router.push('/notifications')}
            style={({pressed})=>({width:44,height:44,alignItems:'center',justifyContent:'center',borderRadius:14,borderWidth:1,borderColor:theme.border,backgroundColor:theme.surface,opacity:pressed ? 0.65 : 1})}>
            <Bell size={22} color={theme.text} accessible={false}/>
          </Pressable></View>
        </View>
        <View style={{ gap: 6 }}>
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: theme.text }]}
          >
            Tổng quan
          </Text>
          <Text style={{ color: theme.muted, fontSize: 16, lineHeight: 24 }}>
            {session?.user.name}
          </Text>
          <Text style={{ color: theme.muted, fontSize: 13 }}>
            {roles[session?.user.role || ""] || "Nhân viên"}
          </Text>
        </View>
        <View style={{ gap: 10 }}>
          {session?.user.permissions.includes("contracts.read") && session.user.permissions.includes("contracts.draft") && <Button label="Lập hợp đồng" onPress={() => router.push("/draft/new")} />}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {session?.user.permissions.includes("customers.read") && session.user.permissions.includes("customers.write") && <View style={{ flex: 1, minWidth: 140 }}><Button label="Thêm khách hàng" secondary onPress={() => router.push("/customer/new")} /></View>}
            {session?.user.permissions.includes("vehicles.read") && <View style={{ flex: 1, minWidth: 140 }}><Button label="Định vị GPS" secondary onPress={() => router.push("/gps")} /></View>}
          </View>
        </View>
        <View
          style={[
            styles.store,
            { borderColor: theme.border, backgroundColor: theme.surface },
          ]}
        >
          <MapPin size={20} color={theme.primary} accessible={false} />
          <Text
            style={{
              color: theme.text,
              flex: 1,
              fontWeight: "600",
              fontSize: 15,
              lineHeight: 23,
            }}
          >
            {store}
          </Text>
        </View>
        <View style={{ gap: 10 }}>
          {available.map((item, index) => {
            const Icon = item.icon;
            const query = queries[index];
            return (
              <Pressable
                key={item.kind}
                accessibilityRole="button"
                accessibilityLabel={`Mở ${item.title}`}
                onPress={() => router.push(item.href)}
                style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
              >
                <Card style={{ padding: 16 }}>
                  <View style={styles.row}>
                    <View
                      style={[styles.icon, { backgroundColor: theme.tint }]}
                    >
                      <Icon
                        size={23}
                        color={theme.primary}
                        accessible={false}
                      />
                    </View>
                    <View style={{ gap: 5, flex: 1 }}>
                      <Text
                        style={{
                          color: theme.text,
                          fontSize: 17,
                          fontWeight: "700",
                        }}
                      >
                        {item.title}
                      </Text>
                      <Text
                        style={{
                          color: theme.muted,
                          fontSize: 13,
                          lineHeight: 20,
                        }}
                      >
                        {item.description}
                      </Text>
                    </View>
                    {query.isPending ? (
                      <ActivityIndicator
                        color={theme.primary}
                        accessibilityLabel={`Đang tải ${item.title}`}
                      />
                    ) : (
                      <Text
                        accessibilityLabel={
                          query.data
                            ? `${query.data.total} ${item.title.toLowerCase()}`
                            : "Chưa tải được số lượng"
                        }
                        style={{
                          color: theme.text,
                          fontSize: 24,
                          fontWeight: "800",
                        }}
                      >
                        {query.data
                          ? query.data.total.toLocaleString("vi-VN")
                          : "—"}
                      </Text>
                    )}
                    <ChevronRight
                      size={18}
                      color={theme.muted}
                      accessible={false}
                    />
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </View>
        {(queries.some((query) => query.isError) || workspace.isError) && (
          <InlineError message="Một số dữ liệu chưa tải được. Kéo xuống để thử lại." />
        )}
        <View style={{ gap: 12 }}>
          <Text
            accessibilityRole="header"
            style={{ color: theme.text, fontSize: 19, fontWeight: "700" }}
          >
            Việc thường dùng
          </Text>
          {shortcuts.map((item) => {
            const Icon = item.icon;
            return (
              <Pressable
                key={item.status}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                onPress={() =>
                  item.status === "overdue" || item.status === "draft" ? router.push({ pathname: "/contracts-workspace/[scope]", params: { scope: item.status === "draft" ? "drafts" : "overdue" } }) : router.push({
                    pathname: item.href,
                    params: { status: item.status },
                  })
                }
                style={({ pressed }) => [
                  styles.shortcut,
                  {
                    backgroundColor: pressed ? theme.tint : theme.surface,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Icon
                  size={21}
                  color={
                    item.status === "overdue" ? theme.warning : theme.primary
                  }
                  accessible={false}
                />
                <View style={{ gap: 4, flex: 1 }}>
                  <Text
                    style={{
                      color: theme.text,
                      fontSize: 15,
                      fontWeight: "600",
                    }}
                  >
                    {item.label}
                  </Text>
                  <Text style={{ color: theme.muted, fontSize: 13 }}>
                    {item.description}
                  </Text>
                </View>
                <ChevronRight
                  size={18}
                  color={theme.muted}
                  accessible={false}
                />
              </Pressable>
            );
          })}
        </View>
        <WorkspaceLinks />
        <Text
          style={{
            color: theme.muted,
            fontSize: 12,
            textAlign: "center",
            lineHeight: 20,
          }}
        >
          Kéo xuống để cập nhật dữ liệu.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 20,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  title: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  store: {
    borderWidth: 1,
    padding: 14,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  icon: { padding: 10, borderRadius: 12 },
  shortcut: {
    minHeight: 76,
    borderWidth: 1,
    padding: 14,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
