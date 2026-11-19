import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from "react";
import { router, usePreventRemove } from "expo-router";
import { uuid } from "expo";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SHIFT_SUMMARY_FIELDS, shiftReportTypeLabel, emptyShiftSummary, parseShiftInput, shiftVehicleTotal, OWNERSHIP_REPORT_GROUPS, blankOwnershipReport, validateOwnershipSubmission, type ShiftInput, type ShiftReport, type ShiftReportType, type MobileShiftOptions, type ShiftAutofillResult, type ShiftAutofillSection, type ShiftTransfer } from "../../../shared/mobile-shift-reports";
import { useSession } from "@/providers/session";
import { pendingWrites } from "@/lib/pending-writes";
import { requireShiftPhotosSaved } from '@/lib/shift-photo-work';
import { useTheme, money } from "@/theme";
import { ChoiceField, FormField } from "./form-fields";
import { DateField } from "./date-field";
import { ShiftNumberField } from "./shift-number-field";
import { Button, Card, InlineError } from "./ui";
import { SHIFT_REPORT_TABS } from "../../../shared/shift-report-workflow";
import { KeyboardFormScrollView } from "./keyboard-form-scroll-view";
import { ConfirmEdit } from "./editor-sheet";

const tabs = SHIFT_REPORT_TABS.map(([value, label]) => ({ value, label }));
const transferTime = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });
const transferResolvedTime = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const transferStatuses: Record<ShiftTransfer["status"], string> = {
  pending: "Đã đi · Chưa nhận",
  received: "Đã nhận",
  rejected: "Đã từ chối",
  cancelled: "Đã hủy",
};

function blank(store: number, reportType: ShiftReportType, staffName: string): ShiftInput {
  return {
    report_type: reportType,
    store_id: store,
    date: new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10),
    staff: staffName,
    vehicles: 0,
    batteries: 0,
    charged: 0,
    rented_batteries: 0,
    transfers: 0,
    cash: 0,
    personal: 0,
    company: 0,
    electricity_off: false,
    notes: "",
    summary: emptyShiftSummary(),
    daily_vehicles: 0,
    monthly_vehicles: 0,
    other_vehicles: 0,
  };
}

export function ShiftEditor({ record, options, initialStore, initialReportType = "end_shift" }: { record: ShiftReport | null; options: MobileShiftOptions; initialStore?: string; initialReportType?: ShiftReportType }) {
  const { api, session } = useSession(), theme = useTheme();
  const [input, setInput] = useState<ShiftInput>(() => {
    if (record) return { ...record.payload, summary: record.payload.summary || emptyShiftSummary(), daily_vehicles: record.payload.daily_vehicles, monthly_vehicles: record.payload.monthly_vehicles, other_vehicles: record.payload.other_vehicles, rented_batteries: record.payload.rented_batteries ?? 0 };
    const selected = Number(initialStore);
    const value = blank(
      options.stores.some(s => s.id === selected) && (session!.user.allStores || selected === session!.user.storeId)
        ? selected
        : session!.user.allStores ? 0 : session!.user.storeId || 0,
      initialReportType,
      session?.user.name?.trim() || "",
    );
    if (options.stores.find(s => s.id === value.store_id)?.kind === "lease_to_own") value.ownership_report = blankOwnershipReport();
    return value;
  });
  const [baseline] = useState(() => JSON.stringify(input)), [tab, setTab] = useState("information"), [busy, setBusy] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState(""), [confirm, setConfirm] = useState<"draft" | "submitted" | null>(null), [exit, setExit] = useState<(() => void) | null>(null), [filled, setFilled] = useState<Record<string, ShiftAutofillResult>>({}), [leaving, setLeaving] = useState(false);
  const [inventoryDetailOpen, setInventoryDetailOpen] = useState(false);
  const [transferPreview, setTransferPreview] = useState<{ key: string; rows?: ShiftTransfer[]; error?: string }>({ key: "" });
  const alive = useRef(true), running = useRef(false), started = useRef(new Set<string>()), loadingTransferRef = useRef("");
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const disablePrevention = usePreventRemove(!leaving && (JSON.stringify(input) !== baseline || busy || pending), ({ repeat }) => { if (!busy) setExit(() => repeat); });
  const update = <K extends keyof ShiftInput>(key: K, value: ShiftInput[K]) => setInput(previous => ({ ...previous, [key]: value, ...(key === "store_id" || key === "date" ? { summary: emptyShiftSummary(), ownership_report: previous.ownership_report || key === "store_id" && options.stores.find(s => s.id === value)?.kind === "lease_to_own" ? blankOwnershipReport() : undefined } : {}) }));

  async function fill(section: ShiftAutofillSection) {
    if (!api || running.current || pending || !input.store_id || !input.date) return;
    running.current = true; setBusy(true); setError("");
    const store = input.store_id, date = input.date;
    try {
      const result = await api.shiftAutofill(store, date, section);
      if (!alive.current) return;
      const inventory = section === "inventory" ? result.inventory : undefined;
      if (section === "inventory" && !inventory) throw Error("DB chưa trả về số liệu kiểm kê xe. Vui lòng thử lại.");
      const values: Partial<ShiftInput> = inventory ? {
        vehicles: inventory.stock_vehicles,
        daily_vehicles: inventory.daily_vehicles,
        monthly_vehicles: inventory.monthly_vehicles,
        other_vehicles: inventory.other_vehicles,
      } : result.values;
      setInput(previous => {
        if (previous.store_id !== store || previous.date !== date) return previous;
        const ownership = result.values.ownership_report;
        if (ownership && previous.ownership_report) {
          for (const key of previous.ownership_report.manual) ownership.values[key] = previous.ownership_report.values[key];
          ownership.manual = [...previous.ownership_report.manual];
        }
        return { ...previous, ...values };
      });
      setFilled(previous => ({ ...previous, [section]: result }));
      if (section === "inventory") setInventoryDetailOpen(false);
    } catch (cause) { if (alive.current) setError((cause as Error).message); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }

  const fillRef = useRef(fill); useEffect(() => { fillRef.current = fill; });
  useEffect(() => {
    if (record || !input.store_id || !input.date || pending) return;
    const stamp = `${input.store_id}:${input.date}`;
    if (started.current.has(stamp)) return;
    started.current.add(stamp);
    void (async () => {
      await fillRef.current("summary");
      if (input.ownership_report) await fillRef.current("ownership");
    })();
  }, [record, input.store_id, input.date, input.ownership_report, pending]);

  const transferStamp = `${input.store_id}:${input.date}`;
  const autofilledTransfers = filled.transfers?.store_id === input.store_id && filled.transfers.date === input.date ? filled.transfers.transfers : undefined;
  useEffect(() => {
    if (!api || tab !== "inventory" || !input.store_id || !input.date || autofilledTransfers) return;
    if (transferPreview.key === transferStamp && transferPreview.rows) return;
    if (loadingTransferRef.current === transferStamp) return;
    const controller = new AbortController();
    loadingTransferRef.current = transferStamp;
    void api.shiftAutofill(input.store_id, input.date, "transfers", controller.signal)
      .then(result => {
        if (!alive.current || controller.signal.aborted) return;
        loadingTransferRef.current = "";
        setTransferPreview({ key: transferStamp, rows: Array.isArray(result.transfers) ? result.transfers : [] });
      })
      .catch(cause => {
        if (!alive.current || controller.signal.aborted) return;
        loadingTransferRef.current = "";
        setTransferPreview({ key: transferStamp, error: cause instanceof Error ? cause.message : "Không tải được danh sách điều chuyển." });
      });
    return () => {
      if (loadingTransferRef.current === transferStamp) loadingTransferRef.current = "";
      controller.abort();
    };
  }, [api, tab, input.store_id, input.date, autofilledTransfers, transferStamp, transferPreview.key, transferPreview.rows]);

  const transfers = autofilledTransfers ?? (transferPreview.key === transferStamp ? transferPreview.rows : undefined);
  const outgoingTransfers = transfers ? transfers.filter(item => item.direction === "out").length : 0;
  const uniqueTransferVehicles = transfers ? new Set(transfers.map(item => item.vehicle_id)).size : 0;

  function review(status: "draft" | "submitted") {
    try {
      parseShiftInput(input);
      if (status === "submitted") {
        if (!input.electricity_off) throw Error("Xác nhận đã tắt thiết bị điện trước khi chốt.");
        if (input.ownership_report) validateOwnershipSubmission(input.ownership_report);
      }
      setError(""); setConfirm(status);
    } catch (cause) { setError((cause as Error).message); }
  }

  async function save() {
    if (!api || !session || running.current || !confirm) return;
    const status = confirm; running.current = true; setBusy(true); setConfirm(null); setError("");
    const scope = { origin: api.origin, userId: session.user.id, storeId: session.user.allStores ? null : session.user.storeId, allStores: session.user.allStores }, operation = record ? `shift.update:${record.id}` : "shift.create";
    try {
      if (record && status === 'submitted') await requireShiftPhotosSaved(scope, record.id, 'pgd');
      const intent = await pendingWrites.reserveExclusive(scope, operation, record ? [operation, `shift.audit:${record.id}`, `shift.media:${record.id}`] : [operation], () => uuid.v4().toLowerCase());
      if (!alive.current) return;
      setPending(true);
      if (!intent.created) throw Error("Còn thao tác báo cáo ca chưa đối chiếu. Mở Tài khoản để kiểm tra mã gốc.");
      await api.saveShift({ payload: parseShiftInput(input), status, ...(record ? { id: record.id, revision: record.revision } : {}) }, intent.key);
      if (!alive.current) return;
      setLeaving(true); disablePrevention();
      router.replace({ pathname: "/shift-result/[key]", params: { key: intent.key } });
    } catch (cause) { if (alive.current) setError((cause as Error).message); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }

  const n = (key: keyof ShiftInput, label: string) => {
    const optional = ["daily_vehicles", "monthly_vehicles", "other_vehicles"].includes(key);
    return <ShiftNumberField key={key} label={label} nullable={optional} value={optional && input[key] === undefined ? null : Number(input[key] ?? 0)} disabled={busy || pending} onChange={value => update(key, (optional && value === null ? undefined : value) as never)} />;
  };

  const sectionFilled = filled[tab];
  const inventoryFilled = filled.inventory?.store_id === input.store_id && filled.inventory.date === input.date ? filled.inventory : undefined;
  const typeLabel = shiftReportTypeLabel(input.report_type);

  return <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1 }}><KeyboardFormScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 18, maxWidth: 760, width: "100%", alignSelf: "center" }}>
    <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 26, fontWeight: "800" }}>{`BÁO CÁO ${typeLabel.toUpperCase()}${input.date ? " - NGÀY " + input.date.split("-").reverse().join("/") : ""}`}</Text>
    <Text style={{ color: theme.muted, lineHeight: 22 }}>Loại báo cáo: {typeLabel} · Bản nháp · Ảnh đính kèm không bắt buộc</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{tabs.map(item => <Pressable key={item.value} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: tab === item.value, disabled: busy || pending }} disabled={busy || pending} onPress={() => setTab(item.value)} style={{ minHeight: 48, paddingHorizontal: 14, justifyContent: "center", borderWidth: 1, borderRadius: 10, borderColor: tab === item.value ? theme.primary : theme.controlBorder, backgroundColor: tab === item.value ? theme.tint : theme.surface }}><Text style={{ color: tab === item.value ? theme.primary : theme.text, fontWeight: "600" }}>{item.label}</Text></Pressable>)}</ScrollView>
    {tab === "information" && <Card style={{ gap: 16 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 20, fontWeight: "700" }}>Thông tin chung</Text>
      <Text style={{ color: theme.muted, lineHeight: 22 }}>PGD, ngày báo cáo và nhân sự trực ca dùng chung cho tất cả các tab báo cáo.</Text>
      <Text style={{ color: theme.primary, fontWeight: "700" }}>Loại báo cáo: {typeLabel}</Text>
      <ChoiceField label="Mẫu báo cáo" value={input.ownership_report ? "ownership" : "pgd"} choices={[{ value: "pgd", label: "Kiểm kê PGD" }, { value: "ownership", label: "Thuê sở hữu · Tự thống kê và gửi Telegram khi chốt" }]} disabled={busy || pending} onChange={v => update("ownership_report", v === "ownership" ? blankOwnershipReport() : undefined)} />
      <ChoiceField label="PGD" placeholder="Chọn PGD" value={String(input.store_id || "")} disabled={busy || pending || !!record} searchable choices={options.stores.filter(s => session!.user.allStores || s.id === session!.user.storeId).map(s => ({ value: String(s.id), label: s.name }))} onChange={v => update("store_id", Number(v))} />
      <DateField label="Ngày báo cáo" value={input.date} disabled={busy || pending || !!record} onChange={v => update("date", v)} />
      <FormField label="Nhân sự trực ca" placeholder="Nhập họ tên các nhân sự trực ca" value={input.staff} onChangeText={v => update("staff", v)} editable={!busy && !pending} multiline maxLength={1000} />
    </Card>}
    {tab === "inventory" && <>
      <Card style={{ gap: 16 }}>
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: "700" }}>Kiểm kê xe</Text>
        <Button secondary label="Lấy số liệu xe" loading={busy} disabled={pending || !input.store_id || !input.date} onPress={() => { void fill("inventory"); }} />
        {inventoryFilled?.inventory && <Text style={{ color: theme.primary, lineHeight: 22 }}>
          {Object.keys(inventoryFilled.values).length ? "Đã điền số xe vào các ô kiểm kê." : "Đã điền theo hiện trạng xe lúc tải. Kiểm tra lại số liệu thực tế của ngày báo cáo trước khi lưu."}
        </Text>}
        {n("daily_vehicles", "Đang thuê ngày")}
        {n("monthly_vehicles", "Đang thuê tháng")}
        {n("vehicles", "Lưu kho thực tế")}
        {n("other_vehicles", "Xe khác / thuê sở hữu")}
        <Text style={{ color: theme.text, fontWeight: "700", fontSize: 16 }}>Tổng số xe: {shiftVehicleTotal(input) ?? "Chưa đủ số liệu"} (gồm cả xe giữ bên ngoài)</Text>
        {inventoryFilled?.inventory && <View style={{ gap: 10 }}>
          <Button secondary label={inventoryDetailOpen ? "Ẩn chi tiết đối chiếu xe" : "Chi tiết đối chiếu xe"} onPress={() => setInventoryDetailOpen(open => !open)} />
          {inventoryDetailOpen && <Card style={{ gap: 8 }}>
            <Text style={{ color: theme.text, fontWeight: "700" }}>Đối chiếu hợp đồng và xe</Text>
            <Text style={{ color: theme.text, lineHeight: 22 }}>Xe đang thuê: {inventoryFilled.inventory.active_vehicles} · HĐ đang thuê: {inventoryFilled.inventory.active_contracts}</Text>
            <Text style={{ color: theme.text, lineHeight: 22 }}>HĐ mở trong ngày: {inventoryFilled.inventory.started_contracts} · Xe trong HĐ mở: {inventoryFilled.inventory.started_vehicles}</Text>
            <Text style={{ color: theme.text, lineHeight: 22 }}>Xe lưu kho gợi ý: {inventoryFilled.inventory.stock_vehicles} · Dòng thiếu xe: {inventoryFilled.inventory.missing_vehicle_lines} · Xe trùng HĐ: {inventoryFilled.inventory.duplicate_vehicles}</Text>
            {[...inventoryFilled.sources, ...inventoryFilled.notices].map((text, index) => <Text key={index} style={{ color: theme.muted, lineHeight: 22 }}>{text}</Text>)}
          </Card>}
        </View>}
        {(input.external_vehicles || []).map((row, index) => <Card key={index} style={{ gap: 10 }}><FormField label={`Biển số xe bên ngoài ${index + 1}`} value={row.plate} editable={!busy && !pending} onChangeText={v => update("external_vehicles", input.external_vehicles!.map((r, i) => i === index ? { ...r, plate: v } : r))} /><FormField label={`Lý do xe bên ngoài ${index + 1}`} value={row.reason} editable={!busy && !pending} onChangeText={v => update("external_vehicles", input.external_vehicles!.map((r, i) => i === index ? { ...r, reason: v } : r))} /><Button secondary label={`Bỏ xe bên ngoài ${index + 1}`} disabled={busy || pending} onPress={() => update("external_vehicles", input.external_vehicles!.filter((_, i) => i !== index))} /></Card>)}
        <Button secondary label="Thêm xe giữ bên ngoài" disabled={busy || pending || (input.external_vehicles?.length || 0) >= 100} onPress={() => update("external_vehicles", [...input.external_vehicles || [], { plate: "", reason: "" }])} />
      </Card>
      <Card style={{ gap: 16 }}>
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: "700" }}>Pin cửa hàng</Text>
        {n("batteries", "Tổng số pin (pin)")}
        {n("charged", "Trong đó pin đầy (pin)")}
        {n("rented_batteries", "Pin đã cho thuê (pin)")}
        <Button secondary label="Tự điền số pin từ DB" loading={busy} disabled={pending || !input.store_id || !input.date} onPress={() => { void fill("batteries"); }} />
      </Card>
      <Card style={{ gap: 14 }}>
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: "700" }}>Xe điều chuyển</Text>
        {n("transfers", "Số xe điều chuyển trong ngày")}
        <Button secondary label="Tự điền điều chuyển từ DB" loading={busy} disabled={pending || !input.store_id || !input.date} onPress={() => { void fill("transfers"); }} />
        <View style={{ gap: 8, paddingTop: 4 }}>
          <Text style={{ color: theme.text, fontWeight: "700", fontSize: 16 }}>Danh sách xe điều chuyển</Text>
          {!input.store_id || !input.date ? <Text style={{ color: theme.muted }}>Chọn PGD và ngày báo cáo để xem danh sách xe điều chuyển.</Text>
            : transferPreview.key === transferStamp && transferPreview.error && !transfers ? <InlineError message={transferPreview.error} />
            : !transfers ? <Text style={{ color: theme.muted }}>Đang tải xe điều chuyển…</Text>
            : <>
              <Text style={{ color: theme.muted }}>{uniqueTransferVehicles} xe · {outgoingTransfers} lượt đi · {transfers.length - outgoingTransfers} lượt đến</Text>
              {transfers.map(item => <Card key={item.id} style={{ gap: 4, padding: 12 }}>
                <Text style={{ color: theme.text, fontWeight: "700" }}>{item.plate || "—"} · {item.direction === "out" ? "Đi" : "Đến"} · {transferTime.format(new Date(item.at))}</Text>
                <Text style={{ color: theme.muted }}>{item.from || "—"} → {item.to || "—"}</Text>
                <Text style={{ color: item.status === "received" ? theme.success : item.status === "pending" ? theme.primary : theme.muted, fontWeight: "600" }}>
                  {transferStatuses[item.status]}{item.resolved_at ? ` · ${transferResolvedTime.format(new Date(item.resolved_at))}` : ""}
                </Text>
              </Card>)}
            </>}
        </View>
      </Card>
    </>}
    {tab === "summary" && <Card style={{ gap: 16 }}>{SHIFT_SUMMARY_FIELDS.map(([key, label, currency]) => <View key={key} style={{ gap: 5 }}><ShiftNumberField label={label} value={input.summary?.[key] ?? 0} disabled={busy || pending} onChange={value => update("summary", { ...input.summary || emptyShiftSummary(), [key]: value as number })} />{currency && <Text style={{ color: theme.muted }}>{money(input.summary?.[key] ?? 0)}</Text>}</View>)}</Card>}
    {tab === "accounts" && <Card style={{ gap: 16 }}>{n("cash", "Tiền mặt thực tế (đồng)")}{n("personal", "TK cá nhân được phân công (đồng)")}{n("company", "TK Công ty (đồng)")}</Card>}
    {tab === "safety" && <Card style={{ gap: 16 }}><FormField label="Thiết bị điện đã tắt gồm" value={input.electrical_devices || ""} onChangeText={v => update("electrical_devices", v)} editable={!busy && !pending} maxLength={1000} multiline /><ChoiceField label="Xác nhận an toàn cuối ca" value={input.electricity_off ? "yes" : "no"} choices={[{ value: "no", label: "Chưa xác nhận đã tắt thiết bị điện" }, { value: "yes", label: "Đã tắt thiết bị điện" }]} disabled={busy || pending} onChange={v => update("electricity_off", v === "yes")} /><FormField label="Bất thường / chênh lệch (nếu có)" value={input.notes} onChangeText={v => update("notes", v)} editable={!busy && !pending} maxLength={5000} multiline /></Card>}
    {tab === "ownership" && <><Text accessibilityRole="header" style={{ color: theme.text, fontSize: 20, fontWeight: "700" }}>Báo cáo cuối ngày thuê sở hữu</Text>{!input.ownership_report && <Text style={{ color: theme.muted, lineHeight: 22 }}>Chọn mẫu Thuê sở hữu trong tab Thông tin để lập báo cáo theo mẫu và gửi Telegram khi chốt.</Text>}{input.ownership_report && OWNERSHIP_REPORT_GROUPS.map(group => <Card key={group.title} style={{ gap: 15 }}><Text style={{ color: theme.text, fontSize: 20, fontWeight: "700" }}>{group.title}</Text>{group.fields.map(([key, label]) => <View key={key} style={{ gap: 5 }}><ShiftNumberField label={label} nullable signed={['rental_day', 'revenue_month', 'battery_rental_day', 'battery_revenue_month'].includes(key)} value={input.ownership_report!.values[key]} disabled={busy || pending} onChange={v => update("ownership_report", { ...input.ownership_report!, values: { ...input.ownership_report!.values, [key]: v }, manual: [...new Set([...input.ownership_report!.manual, key])] })} /><Text style={{ color: theme.muted }}>App: {input.ownership_report!.app[key] === null ? "Chưa có nguồn" : input.ownership_report!.app[key]?.toLocaleString("vi-VN")}</Text></View>)}</Card>)}<Text style={{ color: theme.muted, lineHeight: 24 }}>Khi chốt kèm báo cáo thuê sở hữu, hệ thống lấy lại số liệu app và tạo báo cáo gửi Telegram theo cấu hình server. Giữ nguyên số kiểm kê thực tế đã nhập.</Text></>}
    {tab !== "inventory" && <Button secondary label="Tự điền từ DB" loading={busy} disabled={pending || !input.store_id || !input.date} onPress={() => { void fill(tab as ShiftAutofillSection); }} />}
    {tab !== "inventory" && sectionFilled && sectionFilled.store_id === input.store_id && sectionFilled.date === input.date && <Card style={{ gap: 8 }}>{[...sectionFilled.sources, ...sectionFilled.notices].map((text, index) => <Text key={index} style={{ color: theme.muted, lineHeight: 24 }}>{text}</Text>)}</Card>}
    {!!error && <InlineError message={error} />}
    <Button secondary label="Lưu nháp" loading={busy} disabled={pending} onPress={() => review("draft")} /><Button label="Chốt báo cáo" loading={busy} disabled={pending} onPress={() => review("submitted")} />
    {pending && !busy && <Button secondary label="Mở Tài khoản để đối chiếu báo cáo ca" onPress={() => { setLeaving(true); disablePrevention(); router.push("/(tabs)/account"); }} />}
    {confirm && <ConfirmEdit title={confirm === "submitted" ? `Chốt báo cáo ${typeLabel.toLowerCase()}?` : "Lưu nháp?"} message={`${input.date} · ${options.stores.find(s => s.id === input.store_id)?.name || ""}\nLoại báo cáo: ${typeLabel}\nNhân sự: ${input.staff}\nTổng số xe: ${shiftVehicleTotal(input) ?? "Chưa đủ"}\nTiền mặt: ${money(input.cash)}\n${confirm === "submitted" ? "Sau chốt, số kiểm kê và minh chứng PGD được giữ nguyên để KTNB đối soát." : "Lưu nháp để thêm minh chứng và tiếp tục kiểm kê."}`} confirmLabel={confirm === "submitted" ? "Xác nhận chốt báo cáo ca" : "Xác nhận lưu nháp báo cáo ca"} onCancel={() => setConfirm(null)} onConfirm={() => { void save(); }} />}
    {exit && <ConfirmEdit title={pending ? "Giữ mã và rời báo cáo?" : "Bỏ thay đổi chưa lưu?"} message={pending ? "Mã yêu cầu vẫn được giữ trên thiết bị. Đối chiếu trong Tài khoản trước khi tạo lần lưu mới." : "Các thay đổi trên biểu mẫu chưa được lưu. Lưu nháp trước khi rời nếu cần giữ lại."} confirmLabel="Rời báo cáo ca" onCancel={() => setExit(null)} onConfirm={() => { const repeat = exit; setExit(null); setLeaving(true); disablePrevention(); repeat(); }} />}
  </KeyboardFormScrollView></SafeAreaView>;
}
