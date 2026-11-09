import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ScrollView, RefreshControl, Text, type ScrollViewInstance } from "react-native";
import { SALES_REPORTS, REPORT_PRESETS, salesReportPeriod, type SalesReportKind } from "../../../shared/mobile-reports";
import { useSession } from "@/providers/session";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useTheme } from "@/theme";
import { Button, Card, InlineError, StateView } from "./ui";
import { DateField } from "./date-field";
import { ChoiceField, FormField } from "./form-fields";
import { SalesReportView } from "./sales-report-view";
const contractKinds: SalesReportKind[] = ["contracts", "by-staff", "by-store", "new-customers", "assigned"];
export function SalesReportScreen() {
  const { api, session } = useSession(), theme = useTheme(), scroll = useRef<ScrollViewInstance>(null);
  const [today, setToday] = useState(() => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10));
  useFocusEffect(useCallback(() => { setToday(new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)); }, []));
  const [kind, setKind] = useState<SalesReportKind>("actual"), [from, setFrom] = useState(`${today.slice(0, 7)}-01`), [to, setTo] = useState(today), [store, setStore] = useState(session!.user.allStores ? "all" : String(session!.user.storeId || "all"));
  const [preset, setPreset] = useState("month"), [input, setInput] = useState(""), search = useDebouncedValue(input);
  const [category, setCategory] = useState(""), [method, setMethod] = useState(""), [side, setSide] = useState("in"), [view, setView] = useState("stores"), [department, setDepartment] = useState(""), [source, setSource] = useState(""), [presence, setPresence] = useState("");
  const [sort, setSort] = useState("revenue"), [direction, setDirection] = useState("desc"), [paging, setPaging] = useState<Record<string, { filter: string; page: number; size: string }>>({});
  const [sectionPaging, setSectionPaging] = useState<Record<string, { filter: string; pages: Record<string, number> }>>({});
  const allowed = session!.user.permissions.includes("contracts.read"), options = useQuery({ queryKey: ["report-options", session!.user.id], queryFn: ({ signal }) => api!.reportOptions(signal), enabled: allowed });
  const query = new URLSearchParams({ from, to, store_id: store });
  if (["ledger", "vehicles", "new-customers"].includes(kind)) query.set("search", search);
  if (kind === "ledger") { query.set("category", category); query.set("method", method); query.set("side", side); }
  if (kind === "overview") query.set("view", view);
  if (kind === "assigned") query.set("department", department);
  if (kind === "new-customers") { query.set("source", source); query.set("sourcePresence", presence); }
  if (kind === "vehicles") { query.set("sort", sort); query.set("direction", direction); }
  const filter = query.toString(), slot = kind === "ledger" ? `ledger:${side}` : kind;
  const config = paging[slot], size = config?.size || (kind === "ledger" ? "20" : "10"), page = config?.filter === filter ? config.page : 1;
  if (kind === "ledger" || kind === "vehicles" || kind === 'fleet') { query.set("page", String(page)); query.set("size", size); }
  query.set('section_pages', JSON.stringify(sectionPaging[slot]?.filter === filter ? sectionPaging[slot].pages : {}));
  const valid = !!from && !!to && from <= to && from <= today && to <= today, params = query.toString();
  const report = useQuery({ queryKey: ["sales-report", session!.user.id, kind, params], queryFn: ({ signal }) => api!.salesReport(kind, params, signal), enabled: allowed && valid, retry: false });
  if (!allowed) return <StateView title="Không có quyền xem báo cáo thuê xe" />;
  function chooseKind(value: SalesReportKind) { setKind(value); setInput(""); setCategory(""); setMethod(""); setSide("in"); setView("stores"); setDepartment(""); setSource(""); setPresence(""); setSort("revenue"); setDirection("desc"); setPaging({}); }
  function changePage(next: number, nextSize: number, section?: string) {
    if (section && kind !== 'ledger' && kind !== 'vehicles' && kind !== 'fleet') setSectionPaging(previous => ({ ...previous,
      [slot]: { filter, pages: { ...(previous[slot]?.filter === filter ? previous[slot].pages : {}), [section]: next } } }));
    else setPaging(previous => ({ ...previous, [slot]: { filter, page: next, size: String(nextSize) } }));
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  const mainChoices = SALES_REPORTS.filter(row => !["by-staff", "by-store", "new-customers", "assigned"].includes(row.value) && (row.value !== "fleet" || options.data?.canViewFleet));
  return <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 18, width: "100%", maxWidth: 760, alignSelf: "center" }} refreshControl={<RefreshControl refreshing={report.isRefetching || options.isRefetching} tintColor={theme.primary} onRefresh={() => { void report.refetch(); void options.refetch(); }} />}>
    <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 27, fontWeight: "800" }}>Báo cáo doanh thu thuê xe</Text>
    <ChoiceField label="Chọn báo cáo" value={contractKinds.includes(kind) ? "contracts" : kind} choices={mainChoices} onChange={value => chooseKind(value as SalesReportKind)} />
    {contractKinds.includes(kind) && <ChoiceField label="Mục thống kê hợp đồng" value={kind} choices={SALES_REPORTS.filter(row => contractKinds.includes(row.value))} onChange={value => chooseKind(value as SalesReportKind)} />}
    <Card style={{ gap: 15 }}>
      <ChoiceField label="Kỳ báo cáo" value={preset} choices={[...REPORT_PRESETS, { value: "custom", label: "Tùy chọn ngày" }]} onChange={value => { setPreset(value); if (value !== "custom") { const [start, end] = salesReportPeriod(value, today); setFrom(start); setTo(end); } }} />
      <DateField label="Từ ngày doanh số" value={from} onChange={value => { setPreset("custom"); setFrom(value); if (value > to) setTo(value); }} error={from > today ? "Ngày không được sau hôm nay." : undefined} />
      <DateField label="Đến ngày doanh số" value={to} onChange={value => { setPreset("custom"); setTo(value); if (value < from) setFrom(value); }} error={to > today ? "Ngày không được sau hôm nay." : undefined} />
      <ChoiceField label={kind === "fleet" ? "Cơ sở chủ quản" : "Cơ sở báo cáo"} value={store} choices={[...(session!.user.allStores ? [{ value: "all", label: "Tất cả cơ sở" }] : []), ...(options.data?.stores || []).filter(row => session!.user.allStores || row.id === session!.user.storeId).map(row => ({ value: String(row.id), label: row.name }))]} onChange={setStore} searchable />
      <Button secondary label="Đặt lại kỳ tháng này" onPress={() => { setPreset("month"); setFrom(`${today.slice(0, 7)}-01`); setTo(today); setDepartment(""); }} />
    </Card>
    {["ledger", "vehicles", "new-customers"].includes(kind) && <FormField label="Tìm trong báo cáo" value={input} onChangeText={setInput} maxLength={kind === "ledger" ? 200 : 255} />}
    {kind === "ledger" && <Card style={{ gap: 14 }}><ChoiceField label="Sổ thu / chi" value={side} choices={[{ value: "in", label: "Phiếu thu" }, { value: "out", label: "Phiếu chi" }]} onChange={setSide} /><ChoiceField label="Nghiệp vụ sổ thu chi" value={category} choices={options.data?.ledgerCategories || [{ value: "", label: "Tất cả nghiệp vụ" }]} onChange={setCategory} /><ChoiceField label="Hình thức thu chi" value={method} choices={options.data?.ledgerMethods || [{ value: "", label: "Tất cả hình thức" }]} onChange={setMethod} /></Card>}
    {kind === "overview" && <ChoiceField label="Xem tổng quan theo" value={view} choices={[{ value: "stores", label: "Theo cơ sở" }, { value: "days", label: "Theo ngày" }]} onChange={setView} />}
    {kind === "assigned" && <ChoiceField label="Bộ phận báo cáo bổ sung" value={department} choices={[{ value: "", label: "Tất cả bộ phận" }, { value: "NVKD", label: "NVKD" }, { value: "TLS", label: "TLS" }]} onChange={setDepartment} />}
    {kind === "new-customers" && <Card style={{ gap: 14 }}><ChoiceField label="Tình trạng nguồn khách" value={presence} choices={[{ value: "", label: "Tất cả khách mới" }, { value: "with", label: "Đã có nguồn" }, { value: "without", label: "Chưa ghi nguồn" }]} onChange={setPresence} /><ChoiceField label="Nguồn khách cụ thể" value={source} choices={[{ value: "", label: "Tất cả nguồn" }, ...report.data?.sources || []]} onChange={setSource} searchable /></Card>}
    {kind === "vehicles" && <Card style={{ gap: 14 }}><ChoiceField label="Sắp xếp doanh thu xe" value={sort} choices={[{ value: "revenue", label: "Doanh thu" }, { value: "rentals", label: "Lượt thuê" }, { value: "license", label: "Biển số" }]} onChange={setSort} /><ChoiceField label="Chiều sắp xếp xe" value={direction} choices={[{ value: "desc", label: "Giảm dần" }, { value: "asc", label: "Tăng dần" }]} onChange={setDirection} /></Card>}
    {(kind === "vehicles" || kind === "ledger") && <ChoiceField label="Số dòng báo cáo mỗi trang" value={size} choices={(kind === "ledger" ? [10, 20, 50, 100] : [10, 20, 50]).map(value => ({ value: String(value), label: String(value) }))} onChange={value => changePage(1, Number(value))} />}
    {options.isError && <InlineError message={options.error.message} />}
    {!valid ? <StateView title="Kiểm tra ngày báo cáo" message="Chọn khoảng ngày hợp lệ, không sau hôm nay." /> : report.isPending ? <StateView title="Đang tính báo cáo" loading /> : report.isError ? <StateView title="Chưa tải được báo cáo" message={report.error.message} retry={() => { void report.refetch(); }} /> : <SalesReportView key={`${kind}:${params}`} report={report.data} onPage={changePage} />}
    <Button secondary label="Tải lại báo cáo" loading={report.isFetching} onPress={() => { void report.refetch(); }} disabled={!valid} />
  </ScrollView>;
}
