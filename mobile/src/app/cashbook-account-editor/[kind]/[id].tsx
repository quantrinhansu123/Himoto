import { useLocalSearchParams } from "expo-router";
import { CashbookAccountEditor } from "@/components/cashbook-account-editor";
import { StateView } from "@/components/ui";
import { useSession } from "@/providers/session";
export default function CashbookAccountEditorRoute() {
  const { kind, id, store } = useLocalSearchParams<{ kind: string; id: string; store?: string }>(), { api, session } = useSession();
  if (!api || !session || kind !== "bank" && kind !== "cash" || id !== "new" && !/^[1-9]\d{0,14}$/.test(id)) return <StateView title="Không mở được tài khoản sổ quỹ" />;
  return <CashbookAccountEditor key={`${kind}:${id}:${store}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} kind={kind} id={id === "new" ? null : id} store={store} />;
}
