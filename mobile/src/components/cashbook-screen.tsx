import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { CheckSquare, Square } from "lucide-react-native";
import { CASHBOOK_SORTS, cashbookRentalTotals, type MobileCashbookVoucher, type CashbookBreakdown } from "../../../shared/mobile-cashbook";
import { useSession } from "@/providers/session";
import { useWorkspace } from "@/hooks/use-workspace";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { money, useTheme } from "@/theme";
import { Button, Card, InlineError, StateView } from "./ui";
import { ChoiceField, FormField } from "./form-fields";
import { DateField } from "./date-field";
import { useCsvExport } from "@/hooks/use-csv-export";
import { CashbookDeleteActions } from "./cashbook-delete-actions";
const details: [keyof CashbookBreakdown, string][] = [["rental_income", "Phí thuê"], ["renewal_income", "Tiền gia hạn"], ["late_fee_income", "Tiền trả muộn"], ["deposit_income", "Tổng thu cọc"], ["deposit_refund_expense", "Tiền cọc trả khách"], ["rental_refund_expense", "Tiền hoàn do trả sớm"], ["repair_income", "Phí sửa chữa"], ["extra_income", "Thu thêm hợp đồng"], ["other_income", "Thu khác / chưa phân loại"], ["other_expense", "Chi khác"]];
export function CashbookVoucherCard({ row }: { row: MobileCashbookVoucher }) {
  const { session } = useSession(), theme = useTheme();
  return <Card style={{ gap: 10 }}>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }}><Text style={{ color: theme.text, fontSize: 17, fontWeight: "700" }}>{row.type === "income" ? "Phiếu thu" : "Phiếu chi"} #{row.id}</Text><Text style={{ color: row.type === "income" ? theme.success : theme.danger, fontSize: 19, fontWeight: "800" }}>{money(row.amount)}</Text></View>
    <Text style={{ color: theme.muted }}>{row.date ? row.date.split("-").reverse().join("/") : "Chưa có ngày"} {row.time} · {row.actorName || "Chưa ghi người thực hiện"}</Text>
    {!!row.contractCode && <Text style={{ color: theme.text, fontWeight: "600" }}>Hợp đồng: {row.contractCode}</Text>}
    {!!row.reason && <Text style={{ color: theme.text }}>{row.reason}</Text>}
    {!!row.content && <Text selectable style={{ color: theme.text, lineHeight: 23 }}>{row.content}</Text>}
    <Text style={{ color: theme.muted, lineHeight: 22 }}>{[row.storeName, row.paymentMethod, row.account].filter(Boolean).join(" · ") || "Chưa có thông tin tài khoản"}</Text>
    {!!row.contractId && session!.user.permissions.includes("contracts.read") && <Button secondary label={`Mở hợp đồng ${row.contractCode || `#${row.contractId}`}`} onPress={() => router.push({ pathname: "/record/[kind]/[id]", params: { kind: "contracts", id: row.contractId } })} />}
  </Card>;
}
export function CashbookScreen({ initialStore }: { initialStore?: string }) {
  const { api, session } = useSession(), workspace = useWorkspace(), theme = useTheme();
  const csv = useCsvExport();
  const [selected, setSelected] = useState<Map<string, MobileCashbookVoucher>>(new Map());
  const [store, setStore] = useState(initialStore || (session!.user.allStores ? "all" : String(session!.user.storeId || "all")));
  const [input, setInput] = useState(""), search = useDebouncedValue(input), [actor, setActor] = useState(""), [from, setFrom] = useState(""), [to, setTo] = useState("");
  const [open, setOpen] = useState(false), [expanded, setExpanded] = useState(false), [kind, setKind] = useState<"income" | "expense">("income");
  const [incomeState, setIncome] = useState({ page: 1, limit: "5", sort: "date", direction: "desc", filter: "" }), [expenseState, setExpense] = useState(incomeState);
  const filter = JSON.stringify([store, search, actor, from, to]);
  const income = incomeState.filter === filter ? incomeState : { ...incomeState, page: 1 }, expense = expenseState.filter === filter ? expenseState : { ...expenseState, page: 1 };
  const list = useRef<FlatList<MobileCashbookVoucher>>(null), valid = !from || !to || from <= to, allowed = session!.user.permissions.includes("finance.read");
  useEffect(() => { list.current?.scrollToOffset({ offset: 0, animated: false }); }, [kind, income.page, expense.page]);
  const params = new URLSearchParams({ store_id: store, search, actor, from, to,
    income_page: String(income.page), income_limit: income.limit, income_sort: income.sort, income_direction: income.direction,
    expense_page: String(expense.page), expense_limit: expense.limit, expense_sort: expense.sort, expense_direction: expense.direction });
  const query = useQuery({ queryKey: ["cashbook", session!.user.id, params.toString()], queryFn: ({ signal }) => api!.cashbook(params.toString(), signal), enabled: allowed && valid });
  if (!allowed) return <StateView title="Không có quyền xem sổ quỹ" />;
  const data = valid ? query.data : undefined, current = data?.[kind], totals = data ? cashbookRentalTotals(data.breakdown) : null;
  const stores = (workspace.data?.stores || []).filter(row => session!.user.allStores || row.id === session!.user.storeId), paging = kind === "income" ? income : expense;
  const updatePaging = (values: Partial<typeof income>) => (kind === "income" ? setIncome : setExpense)(current => ({ ...current, page: 1, ...values, filter }));
  const pages = current ? Math.max(1, Math.ceil(current.total / current.pageSize)) : 1;
  return <FlatList ref={list} data={current?.rows || []} keyExtractor={row => row.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 14, width: "100%", maxWidth: 760, alignSelf: "center" }}
    refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }} tintColor={theme.primary} />}
    ListHeaderComponent={<View style={{ gap: 16 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 27, fontWeight: "800" }}>Sổ quỹ / Sổ két</Text>
      <Button secondary label="Tài khoản ngân hàng và két" onPress={() => router.push({ pathname: "/cashbook-accounts", params: { store } })} />
      <Button secondary label={csv.stage === "fetching" ? "Đang lấy toàn bộ phiếu để xuất" : csv.stage === "saving" ? "Đang lưu file Excel" : "Tải Excel theo bộ lọc sổ quỹ"} loading={csv.busy} disabled={!valid || query.isPending || query.isError || !data || data.income.total + data.expense.total === 0} onPress={() => { const filters = new URLSearchParams({ store_id: store, search, actor, from, to }).toString(); void csv.run(signal => api!.cashbookExcel(filters, signal)); }} />
      {!!csv.message && <Text accessibilityLiveRegion="polite" style={{ color: theme.muted, lineHeight: 22 }}>{csv.message}</Text>}
      {!!csv.error && <InlineError message={csv.error} />}
      <Button secondary label={open ? "Ẩn bộ lọc sổ quỹ" : "Bộ lọc sổ quỹ"} onPress={() => setOpen(value => !value)} />
      {open && <Card style={{ gap: 16 }}>
        <FormField label="Tìm phiếu thu chi" value={input} onChangeText={setInput} maxLength={300} />
        <ChoiceField label="Cơ sở sổ quỹ" value={store} choices={[...(session!.user.allStores ? [{ value: "all", label: "Tất cả cơ sở" }] : []), ...stores.map(row => ({ value: String(row.id), label: row.name }))]} searchable onChange={value => { setStore(value); setActor(""); }} />
        <ChoiceField label="Người thực hiện phiếu" value={actor} choices={[{ value: "", label: "Tất cả người thực hiện" }, ...(data?.actors || []).map(([value, label]) => ({ value, label }))]} searchable onChange={setActor} />
        <DateField label="Thu chi từ ngày" value={from} onChange={setFrom} /><DateField label="Thu chi đến ngày" value={to} onChange={setTo} />
        <ChoiceField label="Sắp xếp phiếu" value={paging.sort} choices={CASHBOOK_SORTS} onChange={sort => updatePaging({ sort })} />
        <ChoiceField label="Chiều sắp xếp phiếu" value={paging.direction} choices={[{ value: "desc", label: "Giảm dần" }, { value: "asc", label: "Tăng dần" }]} onChange={direction => updatePaging({ direction })} />
        <ChoiceField label="Số phiếu mỗi trang" value={paging.limit} choices={[5, 10, 25, 50].map(value => ({ value: String(value), label: String(value) }))} onChange={limit => updatePaging({ limit })} />
        {!valid && <InlineError message="Đến ngày phải bằng hoặc sau Từ ngày." />}
        <Button secondary label="Xóa bộ lọc sổ quỹ" onPress={() => { setInput(""); setActor(""); setFrom(""); setTo(""); }} />
      </Card>}
      <Text style={{ color: theme.muted, lineHeight: 22 }}>{stores.find(row => String(row.id) === store)?.name || "Tất cả cơ sở"} · Theo ngày thực thu / thực chi</Text>
      <Card style={{ gap: 14 }}>
        {[["Doanh thu thuê xe", totals?.revenue], ["Tổng thu thực tế", totals?.income], ["Tổng chi thực tế", totals?.expense]].map(([label, amount]) => <View key={String(label)} style={{ gap: 4 }}><Text style={{ color: theme.muted }}>{label}</Text><Text style={{ color: theme.text, fontWeight: "800", fontSize: 23 }}>{typeof amount === "number" ? money(amount) : "—"}</Text></View>)}
        <Button secondary label={expanded ? "Thu gọn đối chiếu thu chi" : "Chi tiết và đối chiếu thu chi"} onPress={() => setExpanded(value => !value)} />
        {expanded && <View style={{ gap: 10 }}><Text style={{ color: theme.muted, lineHeight: 22 }}>Ba số tổng tính theo khoản thuê xe đã thu / hoàn thực tế. Tiền cọc chưa trả và khoản chưa thu chưa tính vào chi. Các khoản khác đối chiếu riêng bên dưới.</Text>
          {details.map(([key, label]) => <Text key={key} style={{ color: theme.text }}>{label}: {data ? money(data.breakdown[key]) : "—"}</Text>)}
          <Text style={{ color: theme.text }}>Tổng tất cả phiếu thu: {data ? money(data.income.amount) : "—"}</Text><Text style={{ color: theme.text }}>Tổng tất cả phiếu chi: {data ? money(data.expense.amount) : "—"}</Text>
        </View>}
      </Card>
      <View style={{ flexDirection: "row", gap: 10 }}><View style={{ flex: 1 }}><Button secondary={kind !== "income"} label={`Phiếu thu${data ? ` (${data.income.total})` : ""}`} onPress={() => setKind("income")} /></View><View style={{ flex: 1 }}><Button secondary={kind !== "expense"} label={`Phiếu chi${data ? ` (${data.expense.total})` : ""}`} onPress={() => setKind("expense")} /></View></View>
      {session!.user.permissions.includes("settings.write") && <View style={{ gap: 12 }}>
        <Button secondary label="Chọn toàn bộ phiếu trang này" disabled={!current?.rows.length} onPress={() => setSelected(previous => { const next = new Map(previous); for (const row of current?.rows || []) next.set(row.id, row); return next; })} />
        {!!selected.size && <Button secondary label={`Bỏ chọn tất cả (${selected.size})`} onPress={() => setSelected(new Map())} />}
        <CashbookDeleteActions key="voucher-delete-actions" selected={[...selected.values()].map(row => ({ id: row.id, amount: row.amount ?? 0 }))} filters={new URLSearchParams({ store_id: store, search, actor, from, to }).toString()} type={kind} disabled={!valid || query.isPending || query.isError} onDeleted={() => setSelected(new Map())} />
      </View>}
      {query.isError && <InlineError message={query.error.message} />}
    </View>}
    extraData={selected}
    renderItem={({ item }) => <View style={{ gap: 8 }}>
      {session!.user.permissions.includes("settings.write") && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected.has(item.id) }} accessibilityLabel={`Chọn ${item.type === "income" ? "phiếu thu" : "phiếu chi"} #${item.id}`} onPress={() => setSelected(previous => { const next = new Map(previous); if (next.has(item.id)) next.delete(item.id); else next.set(item.id, item); return next; })} style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10 }}>
        {selected.has(item.id) ? <CheckSquare size={24} color={theme.primary} /> : <Square size={24} color={theme.muted} />}<Text style={{ color: theme.text }}>Chọn phiếu #{item.id}</Text>
      </Pressable>}
      <CashbookVoucherCard row={item} />
    </View>}
    ListEmptyComponent={!valid ? <StateView title="Kiểm tra khoảng ngày" /> : query.isPending ? <StateView title="Đang tính sổ quỹ" loading /> : query.isError ? <StateView title="Chưa tải được sổ quỹ" message={query.error.message} retry={() => { void query.refetch(); }} /> : <StateView title="Không có phiếu phù hợp" />}
    ListFooterComponent={current ? <View style={{ gap: 12 }}><Text style={{ color: theme.muted }}>Trang {current.page}/{pages} · {current.total} phiếu · Tổng {money(current.amount)}</Text><View style={{ flexDirection: "row", gap: 12 }}><View style={{ flex: 1 }}><Button secondary label="Trang phiếu trước" disabled={current.page <= 1 || query.isFetching} onPress={() => updatePaging({ page: current.page - 1 })} /></View><View style={{ flex: 1 }}><Button secondary label="Trang phiếu tiếp" disabled={current.page >= pages || query.isFetching} onPress={() => updatePaging({ page: current.page + 1 })} /></View></View></View> : undefined}
  />;
}
