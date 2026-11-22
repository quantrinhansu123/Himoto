import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { CheckSquare, ChevronDown, SlidersHorizontal, Square } from "lucide-react-native";
import { CASHBOOK_SORTS, cashbookRentalTotals, type MobileCashbookVoucher, type CashbookBreakdown } from "../../../shared/mobile-cashbook";
import { useSession } from "@/providers/session";
import { useGlobalBranch } from "@/providers/branch";
import { useWorkspace } from "@/hooks/use-workspace";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { money, useTheme } from "@/theme";
import { Button, Card, Chip, InlineError, KeyValueRow, PaginationBar, SegmentedBar, SkeletonList, StateView, StatusBadge } from "./ui";
import { ChoiceField, FormField } from "./form-fields";
import { DateField } from "./date-field";
import { FileExportButton } from "./file-export-button";
import { CashbookDeleteActions } from "./cashbook-delete-actions";
import { CashbookAccountCard } from "./cashbook-account-card";
import { dutyToday } from "../../../shared/mobile-duty-roster";
const details: [keyof CashbookBreakdown, string][] = [["rental_income", "Phí thuê"], ["renewal_income", "Tiền gia hạn"], ["late_fee_income", "Tiền trả muộn"], ["deposit_income", "Tổng thu cọc"], ["deposit_refund_expense", "Tiền cọc trả khách"], ["rental_refund_expense", "Tiền hoàn do trả sớm"], ["repair_income", "Phí sửa chữa"], ["extra_income", "Thu thêm hợp đồng"], ["other_income", "Thu khác / chưa phân loại"], ["other_expense", "Chi khác"]];
export function CashbookVoucherCard({ row }: { row: MobileCashbookVoucher }) {
  const { session } = useSession(), theme = useTheme();
  return <Card style={{ gap: 8, padding: 13 }}>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flex: 1 }}>
        <StatusBadge status={row.type} label={row.type === "income" ? "Thu" : "Chi"} />
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: "800" }}>#{row.id}</Text>
        {!!row.contractCode && <Text numberOfLines={1} style={{ color: theme.primary, fontSize: 13, fontWeight: "700", flexShrink: 1 }}>{row.contractCode}</Text>}
      </View>
      <Text style={{ color: row.type === "income" ? theme.success : theme.danger, fontSize: 17, fontWeight: "800" }}>
        {row.type === "income" ? "+" : "−"}{money(row.amount)}
      </Text>
    </View>
    {!!row.reason && <Text style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}>{row.reason}</Text>}
    {!!row.content && <Text selectable style={{ color: theme.text, fontSize: 13.5, lineHeight: 20 }}>{row.content}</Text>}
    <View style={{ borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 6, gap: 2 }}>
      <KeyValueRow label="Thời gian" value={`${row.date ? row.date.split("-").reverse().join("/") : "—"}${row.time ? ` ${row.time}` : ""}`} />
      <KeyValueRow label="Tài khoản / PGD" value={[row.storeName, row.paymentMethod, row.account].filter(Boolean).join(" · ")} />
      {!!row.actorName && <KeyValueRow label="Người lập" value={row.actorName} />}
    </View>
    {!!row.contractId && session!.user.permissions.includes("contracts.read") && <Button size="sm" secondary label={`Mở hợp đồng ${row.contractCode || `#${row.contractId}`}`} onPress={() => router.push({ pathname: "/record/[kind]/[id]", params: { kind: "contracts", id: row.contractId } })} />}
  </Card>;
}
export function CashbookScreen({ initialStore }: { initialStore?: string }) {
  const { api, session } = useSession(), workspace = useWorkspace(), theme = useTheme();
  const canReadAll = Boolean(session!.user.allStores || session!.user.allStoresRead);
  const defaultStore = canReadAll ? "all" : String(session!.user.storeId || "all");
  const { selectedStore: globalStore, selectStore: setGlobalStore } = useGlobalBranch(defaultStore);
  const [storeOverride, setStoreOverride] = useState<string | null>(initialStore ?? null);
  const store = !canReadAll ? defaultStore : (storeOverride !== null ? storeOverride : globalStore || defaultStore);
  const setStore = (next: string) => {
    if (!canReadAll) return;
    if (initialStore) setStoreOverride(next);
    else { setStoreOverride(null); setGlobalStore(next); }
  };
  const [selected, setSelected] = useState<Map<string, MobileCashbookVoucher>>(new Map());
  const [input, setInput] = useState(""), search = useDebouncedValue(input), [actor, setActor] = useState(""), [from, setFrom] = useState(""), [to, setTo] = useState("");
  const [open, setOpen] = useState(false), [expanded, setExpanded] = useState(false), [accountsOpen, setAccountsOpen] = useState(false), [kind, setKind] = useState<"income" | "expense">("income");
  const [allAccounts, setAllAccounts] = useState(false);
  const [incomeState, setIncome] = useState({ page: 1, limit: "10", sort: "date", direction: "desc", filter: "" }), [expenseState, setExpense] = useState(incomeState);
  const filter = JSON.stringify([store, search, actor, from, to]);
  const income = incomeState.filter === filter ? incomeState : { ...incomeState, page: 1 }, expense = expenseState.filter === filter ? expenseState : { ...expenseState, page: 1 };
  const list = useRef<FlatList<MobileCashbookVoucher>>(null), valid = !from || !to || from <= to, allowed = session!.user.permissions.includes("finance.read");
  useEffect(() => { list.current?.scrollToOffset({ offset: 0, animated: false }); }, [kind, income.page, expense.page]);
  const params = new URLSearchParams({ store_id: store, search, actor, from, to,
    income_page: String(income.page), income_limit: income.limit, income_sort: income.sort, income_direction: income.direction,
    expense_page: String(expense.page), expense_limit: expense.limit, expense_sort: expense.sort, expense_direction: expense.direction });
  const query = useQuery({ queryKey: ["cashbook", session!.user.id, params.toString()], queryFn: ({ signal }) => api!.cashbook(params.toString(), signal), enabled: allowed && valid });
  const [accountStatus,setAccountStatus] = useState('active');
  const accountParams = new URLSearchParams({store_id:store,status:accountStatus}).toString();
  const accounts = useQuery({queryKey:['cashbook-accounts',session!.user.id,store,accountStatus],
    queryFn:({signal})=>api!.cashbookAccounts(accountParams,signal),enabled:allowed});
  if (!allowed) return <StateView title="Không có quyền xem sổ quỹ" />;
  const data = valid ? query.data : undefined, current = data?.[kind], totals = data ? cashbookRentalTotals(data.breakdown) : null;
  const stores = (workspace.data?.stores || []).filter(row => canReadAll || row.id === session!.user.storeId), paging = kind === "income" ? income : expense;
  const updatePaging = (values: Partial<typeof income>) => (kind === "income" ? setIncome : setExpense)(current => ({ ...current, page: 1, ...values, filter }));
  const pages = current ? Math.max(1, Math.ceil(current.total / current.pageSize)) : 1;
  const balances = accounts.data?.rows ?? [];
  const totalOpening = balances.reduce((sum, row) => sum + row.opening, 0);
  const totalAccountIncome = balances.reduce((sum, row) => sum + row.income, 0);
  const totalAccountExpense = balances.reduce((sum, row) => sum + row.expense, 0);
  const activeFilterCount = Number(Boolean(input.trim())) + Number(Boolean(actor)) + Number(Boolean(from)) + Number(Boolean(to)) + Number(store !== defaultStore);
  return <FlatList ref={list} data={current?.rows || []} keyExtractor={row => row.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 12, width: "100%", maxWidth: 760, alignSelf: "center" }}
    refreshControl={<RefreshControl refreshing={query.isRefetching||accounts.isRefetching} onRefresh={() => { if(valid) void query.refetch(); void accounts.refetch(); }} tintColor={theme.primary} />}
    ListHeaderComponent={<View style={{ gap: 12 }}>
      <View style={{ gap: 3 }}>
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 22, fontWeight: "800" }}>Sổ quỹ / Sổ két</Text>
        <Text style={{ color: theme.muted, fontSize: 13 }}>{stores.find(row => String(row.id) === store)?.name || "Tất cả cơ sở"} · Theo ngày thực thu / thực chi</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label={open ? "Ẩn bộ lọc" : activeFilterCount ? `Bộ lọc (${activeFilterCount})` : "Bộ lọc"} selected={open || activeFilterCount > 0} icon={<SlidersHorizontal size={14} color={open || activeFilterCount > 0 ? theme.primary : theme.text} />} onPress={() => setOpen(value => !value)} />
        {session!.user.permissions.includes('finance.write') && <Chip label="Hoàn cọc chờ duyệt" onPress={() => router.push('/deposit-refund-queue')} />}
        {session!.user.permissions.includes('contracts.read') && <Chip label="Tiền về SePay" onPress={() => router.push('/payment-events')} />}
        <Chip label="Quản lý tài khoản" onPress={() => router.push({ pathname: '/cashbook-accounts', params: { store, status: accountStatus } })} />
        {session!.user.permissions.includes('finance.write') && <Chip label="+ Thêm tài khoản" onPress={() => router.push({ pathname: '/cashbook-account-editor/[kind]/[id]', params: { kind: 'cash', id: 'new', store } })} />}
      </ScrollView>
      {open && <Card style={{ gap: 10 }}>
        <FormField label="Tìm phiếu thu chi" value={input} onChangeText={setInput} maxLength={300} />
        <ChoiceField label="Cơ sở sổ quỹ" value={store} choices={[...(canReadAll ? [{ value: "all", label: "Tất cả cơ sở" }] : []), ...stores.map(row => ({ value: String(row.id), label: row.name }))]} searchable onChange={value => { setStore(value); setActor(""); }} />
        <ChoiceField label="Người thực hiện phiếu" value={actor} choices={[{ value: "", label: "Tất cả người thực hiện" }, ...(data?.actors || []).map(([value, label]) => ({ value, label }))]} searchable onChange={setActor} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><DateField label="Từ ngày" value={from} onChange={setFrom} /></View>
          <View style={{ flex: 1 }}><DateField label="Đến ngày" value={to} onChange={setTo} /></View>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button size="sm" equalWidth secondary label="Hôm nay" onPress={()=>{const today=dutyToday();setFrom(today);setTo(today);}} />
          <Button size="sm" equalWidth secondary label="Xóa bộ lọc" onPress={() => { setInput(""); setActor(""); setFrom(""); setTo(""); setStore(defaultStore); }} />
        </View>
        <ChoiceField label="Sắp xếp phiếu" value={paging.sort} choices={CASHBOOK_SORTS} onChange={sort => updatePaging({ sort })} />
        <ChoiceField label="Chiều sắp xếp phiếu" value={paging.direction} choices={[{ value: "desc", label: "Giảm dần" }, { value: "asc", label: "Tăng dần" }]} onChange={direction => updatePaging({ direction })} />
        <ChoiceField label="Số phiếu mỗi trang" value={paging.limit} choices={[5, 10, 25, 50].map(value => ({ value: String(value), label: String(value) }))} onChange={limit => updatePaging({ limit })} />
        <FileExportButton key={new URLSearchParams({ store_id: store, search, actor, from, to }).toString()} disabled={!valid || query.isFetching || query.isError || !data || input.trim() !== search} load={signal => api!.cashbookExcel(new URLSearchParams({ store_id: store, search, actor, from, to }).toString(), signal)} />
        {!valid && <InlineError message="Đến ngày phải bằng hoặc sau Từ ngày." />}
      </Card>}
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text accessibilityRole="header" style={{color:theme.text,fontSize:16,fontWeight:'800'}}>Tổng hợp thu chi</Text>
          <Pressable accessibilityRole="button" onPress={() => setExpanded(value => !value)}>
            <Text style={{ color: theme.primary, fontSize: 13, fontWeight: "700" }}>{expanded ? "Thu gọn" : "Đối chiếu chi tiết"}</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[
            { label: "Doanh thu thuê xe", amount: totals?.revenue, color: theme.text },
            { label: "Tổng thu thực tế", amount: totals?.income, color: theme.success },
            { label: "Tổng chi thực tế", amount: totals?.expense, color: theme.danger },
          ].map(metric => (
            <View key={metric.label} style={{ flexGrow: 1, flexBasis: "30%", minWidth: 100, padding: 10, borderRadius: 10, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, gap: 3 }}>
              <Text style={{ color: theme.muted, fontSize: 11.5 }}>{metric.label}</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ color: metric.color, fontWeight: "800", fontSize: 15 }}>{typeof metric.amount === "number" ? money(metric.amount) : "—"}</Text>
            </View>
          ))}
        </View>
        {expanded && <View style={{ gap: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: theme.border }}><Text style={{ color: theme.muted, fontSize: 12.5, lineHeight: 18, marginBottom: 4 }}>Ba số tổng tính theo khoản thuê xe đã thu / hoàn thực tế. Tiền cọc chưa trả và khoản chưa thu chưa tính vào chi.</Text>
          {details.map(([key, label]) => <KeyValueRow key={key} label={label} value={data ? money(data.breakdown[key]) : "—"} />)}
          <KeyValueRow label="Tổng tất cả phiếu thu" strong valueColor={theme.success} value={data ? money(data.income.amount) : "—"} />
          <KeyValueRow label="Tổng tất cả phiếu chi" strong valueColor={theme.danger} value={data ? money(data.expense.amount) : "—"} />
        </View>}
      </Card>
      <Card style={{gap:10}}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: accountsOpen }} onPress={() => setAccountsOpen(v => !v)} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text accessibilityRole="header" style={{color:theme.text,fontSize:15.5,fontWeight:'800'}}>Số dư két & tài khoản{accounts.data ? ` (${balances.length})` : ''}</Text>
            <Text style={{color:theme.muted,fontSize:12}}>Chạm để {accountsOpen ? 'thu gọn' : 'xem chi tiết từng tài khoản & xuất Excel'}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {accounts.data && <Text style={{color:theme.text,fontWeight:'800',fontSize:15}}>{money(balances.reduce((sum,row)=>sum+row.balance,0))}</Text>}
            <ChevronDown size={18} color={theme.muted} style={{ transform: [{ rotate: accountsOpen ? '180deg' : '0deg' }] }} accessible={false} />
          </View>
        </Pressable>
        {accountsOpen && <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 }}>
          {accounts.data && balances.length > 0 && (
            <View style={{ gap: 2 }}>
              <KeyValueRow label="Số dư đầu kỳ" value={money(totalOpening)} />
              <KeyValueRow label="Tổng thu toàn bộ" valueColor={theme.success} value={money(totalAccountIncome)} />
              <KeyValueRow label="Tổng chi toàn bộ" valueColor={theme.danger} value={money(totalAccountExpense)} />
            </View>
          )}
          <SegmentedBar value={accountStatus} onChange={setAccountStatus} options={[{value:'active',label:'Đang dùng'},{value:'inactive',label:'Ngừng'},{value:'all',label:'Tất cả'}]} />
          {accounts.isPending && <SkeletonList count={2} lines={2} />}
          {accounts.isError && <InlineError message={accounts.error.message} />}
          <FileExportButton key={accountParams} label="Tải Excel tài khoản theo bộ lọc" disabled={accounts.isFetching||accounts.isError||!balances.length}
            load={signal=>api!.cashbookAccountsExcel(accountParams,signal)} />
          {(allAccounts ? balances : balances.slice(0,3)).map(row=><Pressable key={`${row.kind}:${row.id}`} accessibilityRole="button"
            accessibilityLabel={`Mở tài khoản ${row.label}`} onPress={()=>router.push({pathname:'/cashbook-account/[kind]/[id]',params:{kind:row.kind,id:String(row.id)}})}>
            <CashbookAccountCard row={row} />
          </Pressable>)}
          {balances.length > 3 && <Button size="sm" secondary label={allAccounts ? "Thu gọn danh sách tài khoản" : `Xem đủ ${balances.length} tài khoản`}
            onPress={()=>setAllAccounts(value=>!value)} />}
        </View>}
      </Card>
      <SegmentedBar
        value={kind}
        onChange={setKind}
        options={[
          { value: "income", label: "Phiếu thu", count: data?.income.total },
          { value: "expense", label: "Phiếu chi", count: data?.expense.total },
        ]}
      />
      {session!.user.permissions.includes("settings.write") && <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button size="sm" equalWidth secondary label="Chọn cả trang" disabled={!current?.rows.length} onPress={() => setSelected(previous => { const next = new Map(previous); for (const row of current?.rows || []) next.set(row.id, row); return next; })} />
          {!!selected.size && <Button size="sm" equalWidth secondary label={`Bỏ chọn (${selected.size})`} onPress={() => setSelected(new Map())} />}
        </View>
        <CashbookDeleteActions key="voucher-delete-actions" selected={[...selected.values()].map(row => ({ id: row.id, amount: row.amount ?? 0 }))} filters={new URLSearchParams({ store_id: store, search, actor, from, to }).toString()} type={kind} disabled={!valid || query.isPending || query.isError} onDeleted={() => setSelected(new Map())} />
      </View>}
      {query.isError && <InlineError message={query.error.message} />}
    </View>}
    extraData={selected}
    renderItem={({ item }) => <View style={{ gap: 6 }}>
      {session!.user.permissions.includes("settings.write") && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected.has(item.id) }} accessibilityLabel={`Chọn ${item.type === "income" ? "phiếu thu" : "phiếu chi"} #${item.id}`} onPress={() => setSelected(previous => { const next = new Map(previous); if (next.has(item.id)) next.delete(item.id); else next.set(item.id, item); return next; })} style={{ minHeight: 40, flexDirection: "row", alignItems: "center", gap: 8 }}>
        {selected.has(item.id) ? <CheckSquare size={20} color={theme.primary} /> : <Square size={20} color={theme.muted} />}<Text style={{ color: theme.muted, fontSize: 13, fontWeight: "600" }}>Chọn phiếu #{item.id}</Text>
      </Pressable>}
      <CashbookVoucherCard row={item} />
    </View>}
    ListEmptyComponent={!valid ? <StateView title="Kiểm tra khoảng ngày" /> : query.isPending ? <SkeletonList count={4} lines={3} /> : query.isError ? <StateView title="Chưa tải được sổ quỹ" message={query.error.message} retry={() => { void query.refetch(); }} /> : <StateView title="Không có phiếu phù hợp" />}
    ListFooterComponent={current ? <PaginationBar page={current.page} pages={pages} summary={`Trang ${current.page}/${pages} · ${current.total} phiếu · ${money(current.amount)}`} disabled={query.isFetching} onChange={page => updatePaging({ page })} /> : undefined}
  />;
}
