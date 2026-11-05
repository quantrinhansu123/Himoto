import { Stack, useLocalSearchParams } from "expo-router";
import { DirectoryScreen } from "@/components/directory-screen";
import { StateView } from "@/components/ui";
import { useSession } from "@/providers/session";
export default function DirectoryRoute() {
  const { kind } = useLocalSearchParams<{ kind: string }>(), { api, session } = useSession();
  if (!api || !session || kind !== "staff" && kind !== "stores") return <StateView title="Không tìm thấy danh bạ" />;
  return <><Stack.Screen options={{ title: kind === "staff" ? "Nhân sự" : "Cơ sở" }} /><DirectoryScreen key={`${kind}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} kind={kind} /></>;
}
