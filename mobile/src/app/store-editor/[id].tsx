import { useLocalSearchParams } from "expo-router";
import { StoreEditor } from "@/components/store-editor";
import { StateView } from "@/components/ui";
import { useSession } from "@/providers/session";
export default function StoreEditorRoute() {
  const { id } = useLocalSearchParams<{ id: string }>(), { api, session } = useSession();
  if (!api || !session) return <StateView title="Đăng nhập để quản lý cơ sở" />;
  return <StoreEditor key={`${id}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} id={id === "new" ? null : id} />;
}
