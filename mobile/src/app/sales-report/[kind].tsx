import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { isSalesReportKind, type ReportSection, type ReportValue, type SalesReportKind } from "../../../../shared/mobile-reports";
import { useSession } from "@/providers/session";
import { StateView } from "@/components/ui";
import { FileExportButton } from "@/components/file-export-button";
import { SalesReportView } from "@/components/sales-report-view";
import { useTheme } from "@/theme";
function ReportDetail({ kind, filters }: { kind: SalesReportKind; filters: string }) {
  const { api, session } = useSession(), theme = useTheme(), [paging, setPaging] = useState<{ page: number; size: number } | null>(null), query = new URLSearchParams(filters);
  const [sectionPages, setSectionPages] = useState<Record<string, number>>({});
  if (paging) { query.set("page", String(paging.page)); query.set("size", String(paging.size)); }
  query.set('section_pages', JSON.stringify(sectionPages));
  const params = query.toString(), allowed = session!.user.permissions.includes("contracts.read");
  const report = useQuery({ queryKey: ["sales-report", session!.user.id, kind, params], queryFn: ({ signal }) => api!.salesReport(kind, params, signal), enabled: allowed, retry: false });
  if (!allowed) return <StateView title="Không có quyền xem báo cáo" />;
  if (report.isPending) return <StateView title="Đang mở chi tiết báo cáo" loading />;
  if (report.isError) return <StateView title="Chưa mở được chi tiết báo cáo" message={report.error.message} retry={() => { void report.refetch(); }} />;
  async function loadAllSectionRows(section: ReportSection, signal: AbortSignal): Promise<ReportValue[][]> {
    if (!section.paging || section.paging.total <= section.rows.length) return section.rows.map(r => r.values);
    const pageSize = 50, totalPages = Math.ceil(section.paging.total / pageSize), allRows: ReportValue[][] = [];
    for (let p = 1; p <= totalPages; p++) {
      const q = new URLSearchParams(filters);
      if (kind === "ledger" || kind === "vehicles" || kind === "fleet") {
        q.set("page", String(p)); q.set("size", String(pageSize));
      } else {
        q.set("section_pages", JSON.stringify({ ...sectionPages, [section.key]: p }));
      }
      const res = await api!.salesReport(kind, q.toString(), signal);
      const sec = res.sections.find(s => s.key === section.key) ?? res.sections[0];
      if (!sec?.rows.length) break;
      allRows.push(...sec.rows.map(r => r.values));
      if (allRows.length >= section.paging.total) break;
    }
    return allRows;
  }
  const firstSection = report.data.sections[0];
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}><ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16, maxWidth: 760, width: "100%", alignSelf: "center" }} refreshControl={<RefreshControl refreshing={report.isRefetching} tintColor={theme.primary} onRefresh={() => { void report.refetch(); }} />}>
    {report.data.canExport ? (
      <FileExportButton key={params} disabled={report.isFetching||report.isError} load={signal => api!.salesReportExport(kind, params, signal)} />
    ) : firstSection?.rows.length ? (
      <FileExportButton
        key={`${params}:section0`}
        label={`Tải Excel · ${firstSection.title}`}
        disabled={report.isFetching || report.isError}
        load={async (signal) =>
          api!.exportWorkbook(
            {
              filename: `himoto-bao-cao-${kind}`,
              headers: firstSection.columns.map((c) => c.label),
              rows: await loadAllSectionRows(firstSection, signal),
            },
            signal,
          )
        }
      />
    ) : null}
    <SalesReportView key={params} report={report.data} loadSectionRows={loadAllSectionRows} onPage={(page, size, section) => {
      if (section && kind !== 'ledger' && kind !== 'vehicles' && kind !== 'fleet') setSectionPages(previous => ({ ...previous, [section]: page }));
      else setPaging({ page, size });
    }} />
  </ScrollView></SafeAreaView>;
}
export default function ReportDetailRoute() {
  const { kind, filters = "" } = useLocalSearchParams<{ kind: string; filters?: string }>(), { api, session } = useSession();
  if (!api || !session || !isSalesReportKind(kind)) return <StateView title="Không mở được báo cáo" />;
  return <ReportDetail key={`${kind}:${filters}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} kind={kind} filters={filters} />;
}
