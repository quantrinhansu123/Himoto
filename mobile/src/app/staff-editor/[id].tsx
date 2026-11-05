import { useLocalSearchParams } from "expo-router";
import { StaffEditor } from "@/components/staff-editor";
import { StateView } from "@/components/ui";
import { useSession } from "@/providers/session";
export default function StaffEditorRoute() {
  const { id, store } = useLocalSearchParams<{ id: string; store?: string }>(), { api, session } = useSession();
  if (!api || !session) return <StateView title="Đăng nhập để quản lý nhân sự" />;
  return <StaffEditor key={`${id}:${store}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} id={id === "new" ? null : id} store={store} />;
}
