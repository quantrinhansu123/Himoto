import { useLocalSearchParams } from "expo-router";
import { CashbookScreen } from "@/components/cashbook-screen";
import { StateView } from "@/components/ui";
import { useSession } from "@/providers/session";
export default function CashbookRoute() {
  const { store } = useLocalSearchParams<{ store?: string }>(), { api, session } = useSession();
  if (!api || !session || store && store !== "all" && !/^[1-9]\d{0,14}$/.test(store)) return <StateView title="Không mở được sổ quỹ" />;
  return <CashbookScreen key={`${store}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} initialStore={store} />;
}
