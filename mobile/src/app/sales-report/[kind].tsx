import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, RefreshControl, Text } from "react-native";
import { isSalesReportKind, type SalesReportKind } from "../../../../shared/mobile-reports";
import { useSession } from "@/providers/session";
import { StateView, Button, InlineError } from "@/components/ui";
import { SalesReportView } from "@/components/sales-report-view";
import { useCsvExport } from "@/hooks/use-csv-export";
import { useTheme } from "@/theme";
function ReportDetail({ kind, filters }: { kind: SalesReportKind; filters: string }) {
  const { api, session } = useSession(), theme = useTheme(), csv = useCsvExport(), [paging, setPaging] = useState<{ page: number; size: number } | null>(null), query = new URLSearchParams(filters);
  if (paging) { query.set("page", String(paging.page)); query.set("size", String(paging.size)); }
  const params = query.toString(), allowed = session!.user.permissions.includes("contracts.read");
  const report = useQuery({ queryKey: ["sales-report", session!.user.id, kind, params], queryFn: ({ signal }) => api!.salesReport(kind, params, signal), enabled: allowed, retry: false });
  if (!allowed) return <StateView title="Không có quyền xem báo cáo" />;
  if (report.isPending) return <StateView title="Đang mở chi tiết báo cáo" loading />;
  if (report.isError) return <StateView title="Chưa mở được chi tiết báo cáo" message={report.error.message} retry={() => { void report.refetch(); }} />;
  return <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16, maxWidth: 760, width: "100%", alignSelf: "center" }} refreshControl={<RefreshControl refreshing={report.isRefetching} tintColor={theme.primary} onRefresh={() => { void report.refetch(); }} />}>
    {report.data.canExport && <Button secondary label={kind === "ledger" ? "Xuất Excel sổ thu / chi" : "Xuất CSV báo cáo chi tiết"} loading={csv.busy} onPress={() => { const snapshot = params; void csv.run(signal => api!.salesReportExport(kind, snapshot, signal)); }} />}
    {!!csv.error && <InlineError message={csv.error} />}{!!csv.message && <Text accessibilityLiveRegion="polite" style={{ color: theme.muted }}>{csv.message}</Text>}
    <SalesReportView key={params} report={report.data} onPage={(page, size) => setPaging({ page, size })} />
  </ScrollView>;
}
export default function ReportDetailRoute() {
  const { kind, filters = "" } = useLocalSearchParams<{ kind: string; filters?: string }>(), { api, session } = useSession();
  if (!api || !session || !isSalesReportKind(kind)) return <StateView title="Không mở được báo cáo" />;
  return <ReportDetail key={`${kind}:${filters}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} kind={kind} filters={filters} />;
}
