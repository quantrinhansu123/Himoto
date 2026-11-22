import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ScrollView, RefreshControl, Text, View, type ScrollViewInstance } from "react-native";
import { SlidersHorizontal } from "lucide-react-native";
import { SALES_REPORTS, REPORT_PRESETS, salesReportPeriod, type SalesReportKind } from "../../../shared/mobile-reports";
import { useGlobalBranch } from "@/providers/branch";
import { useSession } from "@/providers/session";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useTheme } from "@/theme";
import { Button, Card, Chip, InlineError, SkeletonList, StateView } from "./ui";
import { DateField } from "./date-field";
import { ChoiceField, FormField } from "./form-fields";
import { FileExportButton } from "./file-export-button";
import { SalesReportView } from "./sales-report-view";
const contractKinds: SalesReportKind[] = ["contracts", "by-staff", "by-store", "new-customers", "assigned"];
export function SalesReportScreen() {
  const { api, session } = useSession(), theme = useTheme(), scroll = useRef<ScrollViewInstance>(null);
  const canReadAll = Boolean(session!.user.allStores || session!.user.allStoresRead);
  const defaultStore = canReadAll ? "all" : String(session!.user.storeId || "all");
  const { selectedStore: globalStore, selectStore: setGlobalStore } = useGlobalBranch(defaultStore);
  const store = canReadAll ? (globalStore || "all") : defaultStore;
  const setStore = (next: string) => { if (canReadAll) setGlobalStore(next); };
  const [today, setToday] = useState(() => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10));
  useFocusEffect(useCallback(() => { setToday(new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)); }, []));
  const [kind, setKind] = useState<SalesReportKind>("actual"), [from, setFrom] = useState(`${today.slice(0, 7)}-01`), [to, setTo] = useState(today);
  const [preset, setPreset] = useState("month"), [input, setInput] = useState(""), search = useDebouncedValue(input);
  const [filtersOpen, setFiltersOpen] = useState(false);
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
  const storeName = store === "all" ? "Tất cả cơ sở" : (options.data?.stores || []).find(r => String(r.id) === store)?.name || "Cơ sở đã chọn";
  return <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 11, width: "100%", maxWidth: 760, alignSelf: "center" }} refreshControl={<RefreshControl refreshing={report.isRefetching || options.isRefetching} tintColor={theme.primary} onRefresh={() => { void report.refetch(); void options.refetch(); }} />}>
    <View style={{ gap: 2 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 22, fontWeight: "800" }}>Báo cáo doanh thu</Text>
      <Text style={{ color: theme.muted, fontSize: 12.5 }}>{storeName} · {from.split("-").reverse().join("/")} → {to.split("-").reverse().join("/")}</Text>
    </View>
    {/* Horizontal Report Kind Chips */}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
      {mainChoices.map(opt => {
        const active = contractKinds.includes(kind) ? opt.value === "contracts" : kind === opt.value;
        return <Chip key={opt.value} label={opt.label} selected={active} onPress={() => chooseKind(opt.value as SalesReportKind)} />;
      })}
    </ScrollView>
    {contractKinds.includes(kind) && (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
        {SALES_REPORTS.filter(row => contractKinds.includes(row.value)).map(opt => (
          <Chip key={opt.value} label={opt.label} selected={kind === opt.value} onPress={() => chooseKind(opt.value as SalesReportKind)} />
        ))}
      </ScrollView>
    )}
    {/* Horizontal Period Preset Chips + Filter Toggle */}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
      {REPORT_PRESETS.map(p => (
        <Chip key={p.value} label={p.label} selected={preset === p.value} onPress={() => { setPreset(p.value); const [start, end] = salesReportPeriod(p.value, today); setFrom(start); setTo(end); }} />
      ))}
      <Chip label={filtersOpen ? "Ẩn bộ lọc" : "Ngày & Cơ sở"} selected={filtersOpen || preset === "custom"} icon={<SlidersHorizontal size={14} color={filtersOpen || preset === "custom" ? theme.primary : theme.text} />} onPress={() => setFiltersOpen(v => !v)} />
    </ScrollView>
    {filtersOpen && (
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><DateField label="Từ ngày" value={from} onChange={value => { setPreset("custom"); setFrom(value); if (value && to && value > to) setTo(value); }} error={from > today ? "Không sau hôm nay." : undefined} /></View>
          <View style={{ flex: 1 }}><DateField label="Đến ngày" value={to} onChange={value => { setPreset("custom"); setTo(value); if (value && from && value < from) setFrom(value); }} error={to > today ? "Không sau hôm nay." : undefined} /></View>
        </View>
        <ChoiceField label={kind === "fleet" ? "Cơ sở chủ quản" : "Cơ sở báo cáo"} value={store} choices={[...(canReadAll ? [{ value: "all", label: "Tất cả cơ sở" }] : []), ...(options.data?.stores || []).filter(row => canReadAll || row.id === session!.user.storeId).map(row => ({ value: String(row.id), label: row.name }))]} onChange={setStore} searchable />
        {report.data?.canExport && <FileExportButton key={`${kind}:${params}`} disabled={!valid || report.isFetching || report.isError} load={signal => api!.salesReportExport(kind, params, signal)} />}
        <Button size="sm" secondary label="Đặt lại kỳ tháng này" onPress={() => { setPreset("month"); setFrom(`${today.slice(0, 7)}-01`); setTo(today); setDepartment(""); }} />
      </Card>
    )}
    {["ledger", "vehicles", "new-customers"].includes(kind) && <FormField label="Tìm trong báo cáo" value={input} onChangeText={setInput} maxLength={kind === "ledger" ? 200 : 255} />}
    {kind === "ledger" && <Card style={{ gap: 10 }}><ChoiceField label="Sổ thu / chi" value={side} choices={[{ value: "in", label: "Phiếu thu" }, { value: "out", label: "Phiếu chi" }]} onChange={setSide} /><ChoiceField label="Nghiệp vụ" value={category} choices={options.data?.ledgerCategories || [{ value: "", label: "Tất cả nghiệp vụ" }]} onChange={setCategory} /><ChoiceField label="Hình thức" value={method} choices={options.data?.ledgerMethods || [{ value: "", label: "Tất cả hình thức" }]} onChange={setMethod} /></Card>}
    {kind === "overview" && <ChoiceField label="Xem tổng quan theo" value={view} choices={[{ value: "stores", label: "Theo cơ sở" }, { value: "days", label: "Theo ngày" }]} onChange={setView} />}
    {kind === "assigned" && <ChoiceField label="Bộ phận" value={department} choices={[{ value: "", label: "Tất cả" }, { value: "NVKD", label: "NVKD" }, { value: "TLS", label: "TLS" }]} onChange={setDepartment} />}
    {kind === "new-customers" && <Card style={{ gap: 10 }}><ChoiceField label="Tình trạng nguồn khách" value={presence} choices={[{ value: "", label: "Tất cả" }, { value: "with", label: "Đã có nguồn" }, { value: "without", label: "Chưa ghi nguồn" }]} onChange={v => { setPresence(v); if (v === "without") setSource(""); }} /><ChoiceField label="Nguồn khách cụ thể" value={source} choices={[{ value: "", label: "Tất cả nguồn" }, ...report.data?.sources || []]} disabled={presence === "without"} onChange={v => { setSource(v); if (v && presence === "without") setPresence("with"); }} searchable /></Card>}
    {kind === "vehicles" && <Card style={{ gap: 10 }}><ChoiceField label="Sắp xếp theo" value={sort} choices={[{ value: "revenue", label: "Doanh thu" }, { value: "rentals", label: "Lượt thuê" }, { value: "license", label: "Biển số" }]} onChange={setSort} /><ChoiceField label="Chiều sắp xếp" value={direction} choices={[{ value: "desc", label: "Giảm dần" }, { value: "asc", label: "Tăng dần" }]} onChange={setDirection} /></Card>}
    {(kind === "vehicles" || kind === "ledger") && <ChoiceField label="Số dòng mỗi trang" value={size} choices={(kind === "ledger" ? [10, 20, 50, 100] : [10, 20, 50]).map(value => ({ value: String(value), label: String(value) }))} onChange={value => changePage(1, Number(value))} />}
    {options.isError && <InlineError message={options.error.message} />}
    {!valid ? <StateView title="Kiểm tra ngày báo cáo" message="Chọn khoảng ngày hợp lệ, không sau hôm nay." /> : report.isPending ? <SkeletonList count={4} lines={3} /> : report.isError ? <StateView title="Chưa tải được báo cáo" message={report.error.message} retry={() => { void report.refetch(); }} /> : <SalesReportView key={`${kind}:${params}`} report={report.data} onPage={changePage} />}
  </ScrollView>;
}
