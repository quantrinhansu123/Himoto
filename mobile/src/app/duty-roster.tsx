import { DutyRosterScreen } from "@/components/duty-roster-screen";
import { StateView } from "@/components/ui";
import { useSession } from "@/providers/session";
export default function DutyRoster() {
  const { api, session } = useSession();
  if (!session || !api) return <StateView title="Đăng nhập để xem lịch trực" />;
  return <DutyRosterScreen key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} />;
}
