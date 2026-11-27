import { useState } from "react";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import type { MobileSalesReport, ReportAction, ReportFormat, ReportRow, ReportSection, ReportValue, ReportPageChange } from "../../../shared/mobile-reports";
import { useSession } from "@/providers/session";
import { money, useTheme } from "@/theme";
import { Button, Card, KeyValueRow } from "./ui";
import { ChoiceField } from "./form-fields";
import { FileExportButton } from "./file-export-button";

export function reportValue(value: ReportValue, format: ReportFormat) {
  if (value === null) return "—";
  if (format === "money" && typeof value === "number") return money(value);
  if (format === "count" && typeof value === "number") return value.toLocaleString("vi-VN");
  if (format === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split("-").reverse().join("/");
  if (format === "datetime" && typeof value === "string" && Number.isFinite(Date.parse(value))) return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  return String(value) || "—";
}
export function openReportAction(action: ReportAction) {
  const query = new URLSearchParams(action.query);
  if (action.kind === "contract" || action.kind === "customer" || action.kind === "vehicle") {
    const id = query.get("id") || ""; if (!/^[1-9]\d{0,14}$/.test(id)) return;
    router.push({ pathname: "/record/[kind]/[id]", params: { kind: action.kind === "contract" ? "contracts" : action.kind === "customer" ? "customers" : "vehicles", id } });
  } else router.push({ pathname: "/sales-report/[kind]", params: { kind: action.kind, filters: action.query } });
}
function ProgressLine({ series }: { series: NonNullable<ReportRow["series"]> }) {
  const theme = useTheme(), [width, setWidth] = useState(300), [selected, setSelected] = useState(series.values.length - 1);
  if (!series.values.length) return null;
  const low = Math.min(0, ...series.values), high = Math.max(1, ...series.values), span = high - low || 1;
  const points = series.values.map((value, index) => `${4 + index / Math.max(1, series.values.length - 1) * 292},${66 - (value - low) / span * 60}`).join(" ");
  return <View style={{ gap: 8 }}>
    <Text style={{ color: theme.muted }}>Tiền thuê lũy kế theo ngày</Text>
    <Pressable accessibilityRole="adjustable" accessibilityLabel="Chọn ngày trên biểu đồ tiền thuê lũy kế" accessibilityValue={{ text: `${reportValue(series.labels[selected], "date")}: ${money(series.values[selected])}` }} accessibilityActions={[{ name: "increment", label: "Ngày tiếp" }, { name: "decrement", label: "Ngày trước" }]} onAccessibilityAction={event => setSelected(index => Math.max(0, Math.min(series.values.length - 1, index + (event.nativeEvent.actionName === "increment" ? 1 : -1))))} onLayout={event => setWidth(event.nativeEvent.layout.width)} onPress={event => setSelected(Math.max(0, Math.min(series.values.length - 1, Math.round(event.nativeEvent.locationX / Math.max(1, width) * (series.values.length - 1)))))} style={{ minHeight: 80 }}>
      <Svg height={80} width="100%" viewBox="0 0 300 76" accessible={false}><Polyline points={points} fill="none" stroke={theme.primary} strokeWidth={2.5} /></Svg>
    </Pressable>
    <Text accessibilityLiveRegion="polite" style={{ color: theme.text }}>{reportValue(series.labels[selected], "date")}: {money(series.values[selected])}</Text>
  </View>;
}
function RowCard({ row, section }: { row: ReportRow; section: ReportSection }) {
  const theme = useTheme(), { session } = useSession(), [expanded, setExpanded] = useState(false);
  const primary = section.key === "ledger" ? "signedAmount" : section.columns.some(col => col.key === "revenue") ? "revenue" : "rent";
  const index = section.columns.findIndex(col => col.key === primary), title = reportValue(row.values[0], section.columns[0]?.format || "text");
  const detailColumns = section.columns.map((col, colIndex) => ({ col, colIndex })).filter(item => item.colIndex !== 0 && item.colIndex !== index);
  const visibleDetails = expanded ? detailColumns : detailColumns.slice(0, 3);
  const actionAllowed = !row.action || row.action.kind !== "customer" || session!.user.permissions.includes("customers.read");
  return <Card style={{ gap: 10, padding: 14 }}>
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 16, fontWeight: "800", flex: 1 }}>{title}</Text>
      {index >= 0 && (
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ color: theme.muted, fontSize: 11.5 }}>{section.columns[index].label}</Text>
          <Text style={{ color: typeof row.values[index] === "number" && Number(row.values[index]) < 0 ? theme.danger : theme.primary, fontSize: 16, fontWeight: "800" }}>
            {reportValue(row.values[index], section.columns[index].format)}
          </Text>
        </View>
      )}
    </View>
    {visibleDetails.length > 0 && (
      <View style={{ gap: 2, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 6 }}>
        {visibleDetails.map(({ col, colIndex }) => (
          <KeyValueRow key={col.key} label={col.label} value={reportValue(row.values[colIndex], col.format)} selectable />
        ))}
      </View>
    )}
    {expanded && row.series && <ProgressLine series={row.series} />}
    {(detailColumns.length > 3 || Boolean(row.series) || (row.action && actionAllowed)) && (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 2 }}>
        {(detailColumns.length > 3 || Boolean(row.series)) && (
          <Button size="sm" equalWidth secondary label={`${expanded ? "Thu gọn" : "Chi tiết"} ${title}`} onPress={() => setExpanded(value => !value)} />
        )}
        {row.action && actionAllowed && (
          <Button size="sm" equalWidth secondary label={`${row.action.label} · ${title}`} onPress={() => openReportAction(row.action!)} />
        )}
      </View>
    )}
  </Card>;
}
const RACE_COLORS = ["#E11D48", "#2563EB", "#059669", "#D97706", "#7C3AED", "#0D9488"];

function SectionCharts({ section }: { section: ReportSection }) {
  const theme = useTheme();
  const metricIdx = section.columns.findIndex((c) => ["revenue", "rent", "customers"].includes(c.key));
  if (metricIdx < 0 || section.rows.length < 2) return null;
  const col = section.columns[metricIdx];
  const scored = section.rows
    .map((r) => ({
      key: r.key,
      name: reportValue(r.values[0], section.columns[0]?.format || "text"),
      value: typeof r.values[metricIdx] === "number" ? Number(r.values[metricIdx]) : 0,
      series: r.series,
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  if (!scored.length) return null;
  const maxVal = Math.max(1, scored[0].value);
  const totalVal = scored.reduce((s, r) => s + r.value, 0);
  const leader = scored[0];
  const runnerUp = scored[1];
  const sharePct = totalVal > 0 ? Math.round((leader.value / totalVal) * 100) : 0;
  const raceRows = scored.filter((r) => r.series && r.series.values.length > 1).slice(0, 5);
  const raceHigh = Math.max(1, ...raceRows.flatMap((r) => r.series!.values));

  return (
    <Card style={{ gap: 14 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ color: theme.primary, fontSize: 12, fontWeight: "800", textTransform: "uppercase" }}>
          Biểu đồ so sánh · {col.label}
        </Text>
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: "700", lineHeight: 22 }}>
          Dẫn đầu: {leader.name} ({reportValue(leader.value, col.format)} · {sharePct}% tổng)
          {runnerUp ? ` · Hơn vị trí #2 (${runnerUp.name}) ${reportValue(leader.value - runnerUp.value, col.format)}` : ""}
        </Text>
      </View>

      {/* Horizontal Comparison Bars */}
      <View style={{ gap: 8 }}>
        {scored.slice(0, 8).map((item, idx) => {
          const pct = Math.max(4, Math.round((item.value / maxVal) * 100));
          const barColor = RACE_COLORS[idx % RACE_COLORS.length];
          return (
            <View key={item.key} style={{ gap: 3 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <Text numberOfLines={1} style={{ color: theme.text, fontSize: 13, fontWeight: "600", flex: 1 }}>
                  #{idx + 1} {item.name}
                </Text>
                <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>
                  {reportValue(item.value, col.format)}
                </Text>
              </View>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: theme.background, overflow: "hidden" }}>
                <View style={{ width: `${pct}%`, height: "100%", borderRadius: 4, backgroundColor: barColor }} />
              </View>
            </View>
          );
        })}
      </View>

      {/* Multi-line Cumulative Progress Race Chart */}
      {raceRows.length > 1 && (
        <View style={{ gap: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: theme.border }}>
          <Text style={{ color: theme.muted, fontSize: 12.5, fontWeight: "700" }}>
            Đường đua lũy kế theo ngày (Top {raceRows.length})
          </Text>
          <Svg height={96} width="100%" viewBox="0 0 300 90" accessible={false}>
            {raceRows.map((item, rIdx) => {
              const vals = item.series!.values;
              const pts = vals
                .map((v, i) => `${6 + (i / Math.max(1, vals.length - 1)) * 288},${84 - (Math.max(0, v) / raceHigh) * 76}`)
                .join(" ");
              return <Polyline key={item.key} points={pts} fill="none" stroke={RACE_COLORS[rIdx % RACE_COLORS.length]} strokeWidth={2.2} />;
            })}
          </Svg>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {raceRows.map((item, rIdx) => (
              <View key={item.key} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: RACE_COLORS[rIdx % RACE_COLORS.length] }} />
                <Text style={{ color: theme.muted, fontSize: 12 }}>{item.name}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </Card>
  );
}

function Section({ section, onPage, showSectionExport, loadSectionRows }: { section: ReportSection; onPage: ReportPageChange; showSectionExport?: boolean; loadSectionRows?: (section: ReportSection, signal: AbortSignal) => Promise<ReportValue[][]> }) {
  const theme = useTheme(), { api } = useSession(), [localPage, setLocalPage] = useState(1), [selectedStaff, setSelectedStaff] = useState("");
  const isStaffRevenue = section.key === "staff" && !section.paging;
  const filteredSection = isStaffRevenue && selectedStaff
    ? { ...section, rows: section.rows.filter(r => r.key === selectedStaff) }
    : section;
  const size = filteredSection.paging?.size || 20, total = filteredSection.paging?.total ?? filteredSection.rows.length;
  const pages = Math.max(1, Math.ceil(total / size)), page = filteredSection.paging?.page || Math.min(localPage, pages);
  const rows = filteredSection.paging ? filteredSection.rows : filteredSection.rows.slice((page - 1) * size, page * size);
  const choose = (value: number) => { if (filteredSection.paging) onPage(value, size, filteredSection.key); else setLocalPage(value); };
  return <View style={{ gap: 14 }}>
    <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 20, fontWeight: "800" }}>{filteredSection.title}</Text>
    {isStaffRevenue && section.rows.length > 0 && (
      <ChoiceField
        label="Lọc theo nhân viên"
        value={selectedStaff}
        searchable
        choices={[
          { value: "", label: "Tất cả nhân viên" },
          ...section.rows.map(r => ({
            value: r.key,
            label: `${String(r.values[0] || "")}${/^\d+$/.test(r.key) ? ` (#${r.key})` : ""}`,
          })),
        ]}
        onChange={value => { setSelectedStaff(value); setLocalPage(1); }}
      />
    )}
    <SectionCharts section={filteredSection} />
    {(showSectionExport || isStaffRevenue) && !!api && filteredSection.rows.length > 0 && (
      <FileExportButton
        label={isStaffRevenue ? "Xuất Excel doanh thu" : `Tải Excel · ${filteredSection.title}`}
        load={async (signal) =>
          api.exportWorkbook(
            {
              filename: isStaffRevenue ? `doanh-thu-nhan-vien${selectedStaff ? `-${selectedStaff}` : ""}` : `himoto-bao-cao-${filteredSection.key}`,
              headers: filteredSection.columns.map((c) => c.label),
              rows: loadSectionRows && !isStaffRevenue ? await loadSectionRows(filteredSection, signal) : filteredSection.rows.map((r) => r.values),
            },
            signal,
          )
        }
      />
    )}
    {rows.map(row => <RowCard key={row.key} row={row} section={filteredSection} />)}
    {!rows.length && <Text style={{ color: theme.muted, lineHeight: 23 }}>Không có dữ liệu phù hợp trong kỳ.</Text>}
    {filteredSection.total && <Card style={{ gap: 6, padding: 14 }}><Text style={{ color: theme.text, fontSize: 16, fontWeight: "800" }}>Tổng toàn bộ kết quả</Text>{filteredSection.columns.slice(1).map((col, index) => <KeyValueRow key={col.key} label={col.label} value={reportValue(filteredSection.total![index + 1], col.format)} emphasize />)}</Card>}
    {total > 0 && (
      <View style={{ gap: 8 }}>
        <Text style={{ color: theme.muted, fontSize: 13 }}>{total} dòng · Trang {page}/{pages}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button size="sm" equalWidth secondary label={`Đầu · ${filteredSection.title}`} disabled={page <= 1} onPress={() => choose(1)} />
          <Button size="sm" equalWidth secondary label={`Trước · ${filteredSection.title}`} disabled={page <= 1} onPress={() => choose(page - 1)} />
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button size="sm" equalWidth secondary label={`Sau · ${filteredSection.title}`} disabled={page >= pages} onPress={() => choose(page + 1)} />
          <Button size="sm" equalWidth secondary label={`Cuối · ${filteredSection.title}`} disabled={page >= pages} onPress={() => choose(pages)} />
        </View>
      </View>
    )}
  </View>;
}
export function SalesReportView({ report, onPage, loadSectionRows }: { report: MobileSalesReport; onPage: ReportPageChange; loadSectionRows?: (section: ReportSection, signal: AbortSignal) => Promise<ReportValue[][]> }) {
  const theme = useTheme(), groups = new Map<string, typeof report.metrics>();
  for (const metric of report.metrics) groups.set(metric.group, [...groups.get(metric.group) || [], metric]);
  return <View style={{ gap: 16 }}>
    <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 20, fontWeight: "800" }}>{report.title}</Text>
    {report.notes.map(note => <Text key={note} style={{ color: theme.muted, fontSize: 13, lineHeight: 20 }}>{note}</Text>)}
    {[...groups].map(([group, metrics]) => <Card key={group} style={{ gap: 10, padding: 14 }}>
      <Text style={{ color: theme.text, fontSize: 16, fontWeight: "800" }}>{group}</Text>
      {metrics.map((metric, index) => (
        <View key={metric.label} style={{ gap: 4 }}>
          <KeyValueRow label={metric.label} value={reportValue(metric.value, metric.format)} emphasize={index === 0} valueColor={index === 0 ? theme.primary : theme.text} />
          {metric.action && <Button size="sm" secondary label={`${metric.action.label} · ${metric.label}`} disabled={!metric.value} onPress={() => openReportAction(metric.action!)} />}
        </View>
      ))}
    </Card>)}
    {report.sections.map(section => <Section key={section.key} section={section} onPage={onPage} showSectionExport={report.sections.length > 1} loadSectionRows={loadSectionRows} />)}
  </View>;
}
