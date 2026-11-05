import { useState } from "react";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import type { MobileSalesReport, ReportAction, ReportFormat, ReportRow, ReportSection, ReportValue } from "../../../shared/mobile-reports";
import { useSession } from "@/providers/session";
import { money, useTheme } from "@/theme";
import { Button, Card } from "./ui";

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
  const actionAllowed = !row.action || row.action.kind !== "customer" || session!.user.permissions.includes("customers.read");
  return <Card style={{ gap: 12 }}>
    <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 19, fontWeight: "800" }}>{title}</Text>
    {index >= 0 && <View style={{ gap: 3 }}><Text style={{ color: theme.muted }}>{section.columns[index].label}</Text><Text style={{ color: typeof row.values[index] === "number" && Number(row.values[index]) < 0 ? theme.danger : theme.text, fontSize: 21, fontWeight: "800" }}>{reportValue(row.values[index], section.columns[index].format)}</Text></View>}
    {section.columns.slice(1, expanded ? undefined : 3).map((col, offset) => <View key={col.key} style={{ gap: 3 }}><Text style={{ color: theme.muted }}>{col.label}</Text><Text selectable style={{ color: theme.text, lineHeight: 23 }}>{reportValue(row.values[offset + 1], col.format)}</Text></View>)}
    {section.columns.length > 3 && <Button secondary label={`${expanded ? "Thu gọn" : "Chi tiết"} ${title}`} onPress={() => setExpanded(value => !value)} />}
    {expanded && row.series && <ProgressLine series={row.series} />}
    {row.action && actionAllowed && <Button secondary label={`${row.action.label} · ${title}`} onPress={() => openReportAction(row.action!)} />}
  </Card>;
}
function Section({ section, onPage }: { section: ReportSection; onPage: (page: number, size: number) => void }) {
  const theme = useTheme(), [localPage, setLocalPage] = useState(1), size = section.paging?.size || 20, total = section.paging?.total ?? section.rows.length;
  const pages = Math.max(1, Math.ceil(total / size)), page = section.paging?.page || Math.min(localPage, pages);
  const rows = section.paging ? section.rows : section.rows.slice((page - 1) * size, page * size);
  const choose = (value: number) => { if (section.paging) onPage(value, size); else setLocalPage(value); };
  return <View style={{ gap: 14 }}>
    <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 21, fontWeight: "800" }}>{section.title}</Text>
    {rows.map(row => <RowCard key={row.key} row={row} section={section} />)}
    {!rows.length && <Text style={{ color: theme.muted, lineHeight: 23 }}>Không có dữ liệu phù hợp trong kỳ.</Text>}
    {section.total && <Card style={{ gap: 10 }}><Text style={{ color: theme.text, fontSize: 18, fontWeight: "800" }}>Tổng toàn bộ kết quả</Text>{section.columns.slice(1).map((col, index) => <Text key={col.key} style={{ color: theme.text, lineHeight: 23 }}>{col.label}: {reportValue(section.total![index + 1], col.format)}</Text>)}</Card>}
    {total > 0 && <View style={{ gap: 10 }}><Text style={{ color: theme.muted }}>{total} dòng · Trang {page}/{pages}</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      <Button secondary label={`Đầu · ${section.title}`} disabled={page <= 1} onPress={() => choose(1)} /><Button secondary label={`Trước · ${section.title}`} disabled={page <= 1} onPress={() => choose(page - 1)} />
      <Button secondary label={`Sau · ${section.title}`} disabled={page >= pages} onPress={() => choose(page + 1)} /><Button secondary label={`Cuối · ${section.title}`} disabled={page >= pages} onPress={() => choose(pages)} />
    </View></View>}
  </View>;
}
export function SalesReportView({ report, onPage }: { report: MobileSalesReport; onPage: (page: number, size: number) => void }) {
  const theme = useTheme(), groups = new Map<string, typeof report.metrics>();
  for (const metric of report.metrics) groups.set(metric.group, [...groups.get(metric.group) || [], metric]);
  return <View style={{ gap: 20 }}>
    <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 25, fontWeight: "800" }}>{report.title}</Text>
    {report.notes.map(note => <Text key={note} style={{ color: theme.muted, lineHeight: 23 }}>{note}</Text>)}
    {[...groups].map(([group, metrics]) => <Card key={group} style={{ gap: 14 }}><Text style={{ color: theme.text, fontSize: 19, fontWeight: "800" }}>{group}</Text>{metrics.map((metric, index) => <View key={metric.label} style={{ gap: 8 }}><Text style={{ color: theme.muted }}>{metric.label}</Text><Text style={{ color: theme.text, fontSize: index === 0 ? 25 : 18, fontWeight: "700" }}>{reportValue(metric.value, metric.format)}</Text>{metric.action && <Button secondary label={`${metric.action.label} · ${metric.label}`} disabled={!metric.value} onPress={() => openReportAction(metric.action!)} />}</View>)}</Card>)}
    {report.sections.map(section => <Section key={section.key} section={section} onPage={onPage} />)}
  </View>;
}
