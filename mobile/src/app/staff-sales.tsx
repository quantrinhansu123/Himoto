import { SalesReportScreen } from "@/components/sales-report-screen";
import { StateView } from "@/components/ui";
import { useSession } from "@/providers/session";
export default function StaffSalesRoute() {
  const { api, session } = useSession();
  if (!api || !session) return <StateView title="Đăng nhập để xem báo cáo" />;
  return <SalesReportScreen key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} />;
}
