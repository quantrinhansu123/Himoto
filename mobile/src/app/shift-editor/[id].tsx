import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { shiftReportTypeLabel, type ShiftReportType } from "../../../../shared/mobile-shift-reports";
import { useSession } from "@/providers/session";
import { StateView } from "@/components/ui";
import { ShiftEditor } from "@/components/shift-editor";

function Editor({ id, initialStore, initialReportType }: { id: string; initialStore?: string; initialReportType: ShiftReportType }) {
  const { api, session } = useSession(), allowed = session!.user.permissions.includes("contracts.read") && session!.user.permissions.some(p => p === "contracts.draft" || p === "finance.write");
  const options = useQuery({ queryKey: ["shift-options", session!.user.id], queryFn: ({ signal }) => api!.shiftOptions(signal), enabled: allowed });
  const record = useQuery({ queryKey: ["shift", session!.user.id, id], queryFn: ({ signal }) => api!.shift(id, signal), enabled: allowed && id !== "new", retry: false });
  const effectiveType: ShiftReportType = record.data?.payload.report_type ?? initialReportType;
  const title = effectiveType === "mid_shift" ? "Báo cáo giữa ca" : "Báo cáo Hết ca";
  if (!allowed) return <StateView title="Không có quyền lập báo cáo ca" />;
  if (options.isError || id !== "new" && record.isError) return <StateView title="Chưa mở được báo cáo ca" message={options.error?.message || record.error?.message} retry={() => { void options.refetch(); if (id !== "new") void record.refetch(); }} />;
  if (options.isPending || id !== "new" && record.isPending) return <StateView title="Đang mở biểu mẫu báo cáo ca" loading />;
  if (record.data?.status === "submitted") return <StateView title="Báo cáo PGD đã chốt" message="Số kiểm kê và minh chứng PGD được giữ nguyên. Mở phần đối soát KTNB để tiếp tục kiểm tra." />;
  return <>
    <Stack.Screen options={{ title: `${title} (${shiftReportTypeLabel(effectiveType)})` }} />
    <ShiftEditor key={`${id}:${initialReportType}`} initialStore={initialStore} initialReportType={initialReportType} options={options.data} record={id === "new" ? null : record.data!} />
  </>;
}

export default function Route() {
  const { id, store_id, report_type } = useLocalSearchParams<{ id: string; store_id?: string; report_type?: string }>(), { api, session } = useSession();
  const initialReportType: ShiftReportType = report_type === "mid_shift" ? "mid_shift" : "end_shift";
  if (!api || !session || id !== "new" && !/^[1-9]\d{0,14}$/.test(id)) return <StateView title="Không mở được báo cáo ca" />;
  return <Editor key={`${id}:${initialReportType}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} id={id} initialStore={store_id} initialReportType={initialReportType} />;
}
