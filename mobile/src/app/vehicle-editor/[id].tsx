import { Stack, useLocalSearchParams } from "expo-router";
import { VehicleEditor } from "@/components/vehicle-editor";
import { StateView } from "@/components/ui";
import { useSession } from "@/providers/session";
export default function VehicleEditorRoute() {
  const { id, store } = useLocalSearchParams<{ id: string; store?: string }>(), { api, session } = useSession();
  if (!api || !session) return <StateView title="Đăng nhập để mở hồ sơ xe" />;
  return <><Stack.Screen options={{ title: id === "new" ? "Thêm xe" : "Sửa hồ sơ xe" }} /><VehicleEditor key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}:${id}`} id={id === "new" ? null : id} store={typeof store === "string" && /^[1-9]\d{0,14}$/.test(store) ? store : "all"} /></>;
}
