import { DutyRosterScreen } from "@/components/duty-roster-screen";
import { StateView } from "@/components/ui";
import { useSession } from "@/providers/session";
import { useLocalSearchParams } from 'expo-router';
export default function DutyRoster() {
  const { api, session } = useSession();
  const { store } = useLocalSearchParams<{store?:string}>();
  if (!session || !api) return <StateView title="Đăng nhập để xem lịch trực" />;
  return <DutyRosterScreen initialStore={store} key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}:${store||''}`} />;
}
