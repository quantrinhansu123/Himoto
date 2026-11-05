import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, View, type ScrollViewInstance } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MobileCollectionMethod } from "@himoto/mobile-contract";
import type { MobileRenewalInput } from "../../../shared/mobile-renewal-write";
import { renewalLocalTime, reviewRenewal } from "@/lib/renewal-form";
import { addRentalDuration } from "../../../shared/rental-time";
import { DEFAULT_RENEWAL_HOURLY_RATE,renewalDurationUnits,renewalRateSuggestion } from "../../../shared/renewal-duration";
import { useRenewalWrite } from "@/hooks/use-renewal-write";
import { useSession } from "@/providers/session";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { money, useTheme } from "@/theme";
import { Button, Card, InlineError, StateView } from "./ui";
import { FormField, ChoiceField } from "./form-fields";
import { RentalDateTime } from "./rental-date-time";
import { ConfirmEdit } from "./editor-sheet";
import { BillPhoto } from "./bill-photo";

const methods = [{ value: "cash", label: "Tiền mặt" }, { value: "transfer", label: "CK tài khoản cá nhân" }, { value: "company_transfer", label: "CK tài khoản công ty" }];
export function RenewalEditor({ id,backfill=false }: { id: string;backfill?:boolean }) {
  const { session } = useSession();
  if (!/^[1-9]\d{0,14}$/.test(id) || !session?.user.permissions.includes("contracts.read") || !session.user.permissions.includes("contracts.renew"))
    return <StateView title="Không mở được bước gia hạn" message="Tài khoản cần quyền gia hạn hợp đồng." />;
  return <RenewalForm key={`${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}:${id}:${backfill}`} id={id} backfill={backfill} />;
}
function RenewalForm({ id,backfill }: { id: string;backfill:boolean }) {
  const { api, session } = useSession(), theme = useTheme(), cache = useQueryClient(), reducedMotion = useReducedMotion();
  const [page, setPage] = useState(1), [search, setSearch] = useState(""), [searchDraft, setSearchDraft] = useState("");
  const [itemId, setItemId] = useState(""), [customReturnAt, setReturnAt] = useState<string | null>(null), [customAmount, setAmount] = useState<string | null>(null);
  const [extraAmount,setExtraAmount]=useState(""),[extraName,setExtraName]=useState("Phí VAT");
  const [outsideAmount, setOutsideAmount] = useState(""), [outsideName, setOutsideName] = useState("Phí thu thêm"), [note, setNote] = useState("");
  const [collected, setCollected] = useState(false),[collectionChosen,setCollectionChosen]=useState(false), [customMethod, setMethod] = useState<MobileCollectionMethod|null>(null), [account, setAccount] = useState("");
  const [initialOccurredAt] = useState("");
  const [unit,setUnit]=useState<"day"|"hour">("day"),[count,setCount]=useState("1"),[customRate,setRate]=useState<string|null>(null);
  const [readyBill, setReadyBill] = useState(""), [reviewedBill, setReviewedBill] = useState(""), [localError, setLocalError] = useState("");
  const [occurredAt,setOccurredAt]=useState(initialOccurredAt);
  const [confirm, setConfirm] = useState<MobileRenewalInput | null>(null), [resolving, setResolving] = useState(false);
  const dirty = !!itemId || customReturnAt !== null || customAmount !== null || !!outsideAmount || outsideName !== "Phí thu thêm" || !!extraAmount || extraName!=="Phí VAT" || !!note || collected || collectionChosen || customMethod !== null || !!account || occurredAt !== initialOccurredAt || unit!=="day" || count!=="1" || customRate!==null;
  const action = useRenewalWrite(id, dirty), scroll = useRef<ScrollViewInstance>(null);
  const query = useQuery({ queryKey: ["renewal-preparation", session?.user.id, session?.user.storeId, session?.user.allStores, id, "editor", backfill, page, search],
    queryFn: ({ signal }) => api!.renewalPreparation(id, page, search, signal,backfill), enabled: !!api, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const data = query.data;
  const method=customMethod??((["cash","transfer","company_transfer"] as const).find(m=>data?.accounts.some(a=>a.method===m))||"cash");
  const availableAccounts=data?.accounts.filter(a=>a.method===method)||[],effectiveAccount=account||(availableAccounts.length===1?`${method}:${availableAccounts[0].id}`:"");
  const bill = useQuery({ queryKey: ["renewal-bill", session?.user.id, session?.user.storeId, session?.user.allStores, id, data?.nextVersion],
    queryFn: ({ signal }) => api!.renewalBill(id, data!.nextVersion, signal), enabled: !!api && !!data && collected,
    staleTime: 0, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false });
  useFocusEffect(useCallback(() => {
    void cache.invalidateQueries({ queryKey: ["renewal-preparation"] });
    void cache.invalidateQueries({ queryKey: ["renewal-bill"] });
    // Require a fresh visible bill review after returning from its upload step.
    setReviewedBill("");
  }, [cache]));
  useEffect(() => {
    if (!localError && !action.error && !action.key) return;
    const frame = requestAnimationFrame(() => scroll.current?.scrollTo({ y: 0, animated: !reducedMotion }));
    return () => cancelAnimationFrame(frame);
  }, [localError, action.error, action.key, reducedMotion]);
  const item = data?.items.rows.find(row => String(row.id) === itemId) ?? (!itemId && data?.items.total === 1 ? data.items.rows[0] : null);
  const maxCount=unit==="day"?365:720,validCount=/^[0-9]+$/.test(count)&&Number(count)>=1&&Number(count)<=maxCount;
  const returnAt=customReturnAt??(item?.returnAt&&validCount?addRentalDuration(item.returnAt,Number(count),unit):"");
  const rate=customRate??(unit==="hour"?DEFAULT_RENEWAL_HOURLY_RATE:item?.dailyPrice?String(item.dailyPrice):"");
  const units=item?.returnAt?renewalDurationUnits(item.returnAt,returnAt,unit):null,countValue=customReturnAt!==null?String(units||""):count;
  const suggested=renewalRateSuggestion(item?.returnAt||null,returnAt,rate,unit),amount=customAmount??(suggested===null?"":String(suggested));
  const locked = !action.checked || action.busy || action.checking || !!action.key || !!action.receipt;
  const billKey = bill.data?.photoRevision ? `${bill.data.version}:${bill.data.photoRevision}` : "";
  const source = billKey && api && session ? { uri: `${api.origin}/api/mobile/v1/contracts/${encodeURIComponent(id)}/renewals/${bill.data!.version}/bill?revision=${encodeURIComponent(bill.data!.photoRevision!)}`, headers: { Authorization: `Bearer ${session.token}` } } : null;
  function review() {
    Keyboard.dismiss(); setLocalError("");
    if (!data || locked || query.isFetching || query.isError || (collected && (bill.isFetching || bill.isError))) return;
    try {
      if(Number(amount||0)+Number(extraAmount||0)+Number(outsideAmount||0)>0&&!collectionChosen)throw Error("Chọn đã nhận tiền hoặc chưa nhận tiền gia hạn.");
      setConfirm(reviewRenewal(data, item ?? null, { returnAt, amount, outsideAmount, outsideName, note, collected, method, account:effectiveAccount, paidAt:occurredAt,occurredAt,extraAmount,extraName,unit,rate,
        reviewedBill: billKey && readyBill === billKey && reviewedBill === billKey ? { version: bill.data!.version, revision: bill.data!.photoRevision! } : null }, Date.now()));
    } catch (cause) { setLocalError((cause as Error).message); }
  }
  if (action.receipt) {
    const result = action.receipt;
    return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18, maxWidth: 760, width: "100%", alignSelf: "center" }}>
        <Card style={{ gap: 16 }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 25, fontWeight: "800" }}>Gia hạn đã được ghi nhận</Text>
          <Text style={{ color: theme.text, fontSize: 18 }}>Phiên bản gia hạn #{result.version}</Text>
          <Text style={{ color: theme.text, fontSize: 16 }}>Hẹn trả đã lưu: {renewalLocalTime(Date.parse(result.returnAt)).replace("T", " ")}</Text>
          <Text style={{ color: theme.text, fontSize: 16 }}>Phí gia hạn: {money(result.amount)} · Tổng hợp đồng: {money(result.totalAmount)}</Text>
          <Text style={{ color: theme.text, fontSize: 16 }}>{result.collected ? `Đã thu ${money(result.amount + result.outsideAmount)}` : "Chưa ghi khoản thu tiền"}</Text>
          {result.transactionId !== null && <Text selectable style={{ color: theme.text, fontSize: 17 }}>Phiếu tiền thuê #{result.transactionId}</Text>}
          {result.outsideTransactionId !== null && <Text selectable style={{ color: theme.text, fontSize: 17 }}>Phiếu thu ngoài #{result.outsideTransactionId} · {money(result.outsideAmount)}</Text>}
          {result.collection && <Text style={{ color: theme.muted, fontSize: 15, lineHeight: 23 }}>{methods.find(row => row.value === result.collection!.method)?.label} · tài khoản #{result.collection.accountId} · {renewalLocalTime(Date.parse(result.collection.paidAt)).replace("T", " ")}</Text>}
          {!!result.warning && <Text style={{ color: theme.warning, fontSize: 15, lineHeight: 24 }}>{result.warning}</Text>}
          {!result.current && <InlineError message="Hồ sơ hoặc phiếu thu đã được chỉnh sau lần gia hạn này. Đây là kết quả gốc đã lưu; kiểm tra hồ sơ hiện tại trước khi thao tác tiếp." />}
          {!!action.error && <InlineError message={action.error} />}
          <Button label="Xác nhận đã kiểm tra gia hạn" loading={action.checking} onPress={() => { void action.acknowledge(); }} />
        </Card>
      </ScrollView>
    </SafeAreaView>;
  }
  if (!data && query.isPending) return <StateView title="Đang tải số liệu gia hạn" loading />;
  if (!data) return <StateView title="Chưa tải được số liệu gia hạn" message={query.error?.message || action.error} retry={() => { void query.refetch(); }} />;
  const changePage = (value: number) => { setPage(value); setItemId(""); setLocalError(""); };
  const accountLabel = confirm?.receipt && data.accounts.find(row => row.method === confirm.receipt!.method && row.id === confirm.receipt!.account_id)?.label;
  const outside = confirm ? Number(confirm.outside_amount ?? 0) : 0;
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 18, maxWidth: 760, width: "100%", alignSelf: "center" }}>
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 25, fontWeight: "800" }}>{data.code}</Text>
          {backfill&&<Text style={{color:theme.warning,lineHeight:24}}>Nhập bổ sung gia hạn bị quên. Xe đã trả chỉ bổ sung lịch sử và phí, giữ kho hiện tại. Kiểm tra lịch sử để tránh nhập trùng.</Text>}
          <Text style={{ color: theme.muted, fontSize: 16 }}>Gia hạn #{data.nextVersion} · Tiền thuê còn thiếu {money(data.rentalRemaining)}</Text>
        </View>
        {!!(localError || action.error) && <InlineError message={localError || action.error} />}
        {!!action.notice && <Text accessibilityLiveRegion="polite" style={{ color: theme.text, fontSize: 15, lineHeight: 24 }}>{action.notice}</Text>}
        {!!action.key && <Card><Text style={{ color: theme.warning, fontSize: 15, lineHeight: 24 }}>Lần gửi đang chờ đối chiếu. Giữ nguyên nội dung và mã để tránh gia hạn hoặc thu trùng.</Text></Card>}
        {query.isError && <InlineError message="Chưa cập nhật được hợp đồng. Nội dung đang nhập được giữ; tải lại trước khi xác nhận." />}
        {!data.available && <InlineError message={data.blockedReason || "Hợp đồng chưa thể gia hạn."} />}
        <Card style={{ gap: 16 }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 19, fontWeight: "700" }}>1. Xe và hẹn trả mới</Text>
          {data.items.total > 1 && <>
            <FormField label="Tìm xe đang thuê" value={searchDraft} editable={!locked} maxLength={80} onChangeText={setSearchDraft} />
            <Button secondary label="Tìm xe gia hạn" disabled={locked || query.isFetching} onPress={() => { Keyboard.dismiss(); setSearch(searchDraft.trim()); changePage(1); }} />
          </>}
          <ChoiceField label="Xe gia hạn" value={item ? String(item.id) : ""} disabled={locked || query.isFetching}
            choices={data.items.rows.map(row => ({ value: String(row.id), label: `${row.license} · ${row.name}` }))}
            onChange={value => { setItemId(value);setUnit("day");setCount("1");setRate(null); setReturnAt(null); setAmount(null); setLocalError(""); }} />
          {data.items.pages > 1 && <View style={{ gap: 10 }}>
            <Text style={{ color: theme.muted }}>Trang {data.items.page}/{data.items.pages}</Text>
            <Button secondary label="Trang xe trước" disabled={locked || query.isFetching || data.items.page === 1} onPress={() => changePage(data.items.page - 1)} />
            <Button secondary label="Trang xe sau" disabled={locked || query.isFetching || data.items.page === data.items.pages} onPress={() => changePage(data.items.page + 1)} />
          </View>}
          {item && <Text style={{ color: theme.muted, fontSize: 15, lineHeight: 24 }}>Hẹn trả hiện tại: {item.returnAt ? renewalLocalTime(Date.parse(item.returnAt)).replace("T", " ") : "Chưa có"} · Giá ngày: {money(item.dailyPrice)}</Text>}
          <RentalDateTime label="bắt đầu gia hạn" value={occurredAt} onChange={setOccurredAt} disabled={locked} />
          <Text style={{color:theme.muted,lineHeight:24}}>Nếu đã nhận tiền, phiếu thu ghi nhận cùng ngày giờ bắt đầu gia hạn. Hẹn trả mới tính từ hẹn trả hiện tại của xe.</Text>
          <ChoiceField label="Gia hạn theo" value={unit} choices={[{value:"day",label:"Ngày"},{value:"hour",label:"Giờ"}]} disabled={locked||!item} onChange={value=>{setUnit(value as "day"|"hour");setCount("1");setReturnAt(null);setRate(null);setAmount(null);}} />
          <FormField label={unit==="day"?"Số ngày gia hạn":"Số giờ gia hạn"} value={countValue} editable={!locked&&!!item} keyboardType="number-pad" maxLength={3} onChangeText={value=>{setCount(value);setReturnAt(null);}} hint={`Từ 1 đến ${maxCount} ${unit==="day"?"ngày":"giờ"}.`} />
          <FormField label={unit==="day"?"Đơn giá gia hạn mỗi ngày (VND)":"Đơn giá gia hạn mỗi giờ (VND)"} value={rate} onChangeText={setRate} keyboardType="number-pad" maxLength={9} editable={!locked&&!!item} />
          <RentalDateTime label="hẹn trả mới" value={returnAt} onChange={setReturnAt} disabled={locked || !item} />
          <FormField label="Phí gia hạn thỏa thuận (VND)" value={amount} onChangeText={setAmount} editable={!locked && !!item} keyboardType="number-pad" maxLength={20}
            hint={suggested === null ? "Chưa đủ dữ liệu để gợi ý; nhập đúng thỏa thuận với khách." : `Gợi ý theo ${unit==='day'?'ngày':'giờ'}: ${money(suggested)}. Phí được cộng vào tiền hợp đồng.`} />
          {suggested !== null && /^(0|[1-9]\d{0,12})$/.test(amount) && Number(amount) !== suggested && <Text style={{ color: theme.warning, fontSize: 15, lineHeight: 24 }}>Phí đang nhập khác gợi ý {money(suggested)}. Rà soát thời hạn và thỏa thuận trước khi lưu.</Text>}
          <FormField label="Phí khác cộng vào tiền thuê (VND)" value={extraAmount} onChangeText={setExtraAmount} editable={!locked} keyboardType="number-pad" maxLength={13} hint="Tùy chọn, ví dụ phí VAT. Khoản này cộng vào tổng hợp đồng." />
          {!!extraAmount&&extraAmount!=="0"&&<FormField label="Tên khoản phí khác" value={extraName} onChangeText={setExtraName} editable={!locked} maxLength={100} />}
          <FormField label="Phí thu ngoài (VND)" value={outsideAmount} onChangeText={setOutsideAmount} editable={!locked} keyboardType="number-pad" maxLength={20} hint="Tùy chọn. Không cộng vào tiền thuê hoặc tổng hợp đồng." />
          {!!outsideAmount && outsideAmount !== "0" && <FormField label="Tên phí thu ngoài" value={outsideName} onChangeText={setOutsideName} editable={!locked} maxLength={100} />}

          <FormField label={backfill?"Lý do nhập bổ sung gia hạn":"Ghi chú gia hạn"} value={note} onChangeText={setNote} editable={!locked} multiline maxLength={2000} />
        </Card>
        <Card style={{ gap: 16 }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 19, fontWeight: "700" }}>2. Kiểm tra khoản thu</Text>
          <ChoiceField label="Trạng thái thu tiền gia hạn" value={!collectionChosen?"":collected ? "paid" : "unpaid"} disabled={locked}
            choices={[{ value: "unpaid", label: "Chưa thu tiền" }, { value: "paid", label: "Đã thực nhận đủ phí ở trên" }]} onChange={value => { setCollected(value === "paid");setCollectionChosen(true); setReviewedBill(""); }} />
          {collected ? <>
            <Text style={{ color: theme.muted, fontSize: 15, lineHeight: 24 }}>Chỉ xác nhận khoản đã thực nhận. Thu một phần sau gia hạn được thực hiện bằng phiếu liên kết phiên bản.</Text>
            <ChoiceField label="Hình thức thu gia hạn" value={method} choices={methods} disabled={locked} onChange={value => { setMethod(value as MobileCollectionMethod); setAccount(""); }} />
            <ChoiceField label="Tài khoản nhận gia hạn" value={effectiveAccount} disabled={locked} searchable choices={data.accounts.filter(row => row.method === method).map(row => ({ value: `${row.method}:${row.id}`, label: row.label }))} onChange={setAccount} />
            <Text style={{color:theme.muted,lineHeight:24}}>Ngày giờ thực thu: {occurredAt.replace("T"," ")||"Chọn ngày bắt đầu gia hạn ở trên."}</Text>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>Bill cho phiên bản #{data.nextVersion}</Text>
            {bill.isError && <InlineError message={bill.error.message} />}
            {source ? <BillPhoto key={billKey} source={source} label="Bill gia hạn đã lưu" onReady={ready => setReadyBill(ready ? billKey : "")} /> : <Text style={{ color: theme.muted, fontSize: 15 }}>{bill.isPending ? "Đang kiểm tra bill…" : "Chưa có bill chính cho phiên bản này."}</Text>}
            <Button secondary label="Chọn hoặc thay bill gia hạn" disabled={locked} onPress={() => { Keyboard.dismiss(); router.push({ pathname: "/renewal-bill/[id]", params: { id, returnTo: "renewal",...(backfill?{backfill:"1"}:{}) } }); }} />
            <Button secondary label={billKey && reviewedBill === billKey ? "Đã rà soát bill đúng giao dịch" : "Xác nhận bill đúng giao dịch"} disabled={locked || !billKey || readyBill !== billKey || bill.isError || bill.isFetching} onPress={() => setReviewedBill(billKey)} />
          </> : <Text style={{ color: theme.muted, fontSize: 15, lineHeight: 24 }}>Lưu ngày hẹn trả và phí thỏa thuận. Khoản chưa nhận không được ghi thành phiếu thu.</Text>}
        </Card>
        <Button secondary label="Ẩn bàn phím" onPress={Keyboard.dismiss} />
        <Button secondary label="Tải lại số liệu gia hạn" loading={query.isFetching || (collected && bill.isFetching)} disabled={action.busy || action.checking} onPress={() => { setReviewedBill(""); void query.refetch(); if (collected) void bill.refetch(); }} />
      </ScrollView>
      <View style={{ padding: 16, borderTopWidth: 1, borderColor: theme.border, backgroundColor: theme.surface }}>
        <View style={{ maxWidth: 724, width: "100%", alignSelf: "center" }}>
          {action.key ? <Button label={action.busy ? "Đang lưu gia hạn" : "Đối chiếu yêu cầu gia hạn"} loading={action.busy || action.checking} onPress={() => setResolving(true)} /> :
            <Button label="Rà soát gia hạn" disabled={locked || query.isError || query.isFetching || !data.available} onPress={review} />}
        </View>
      </View>
    </KeyboardAvoidingView>
    {confirm && <ConfirmEdit title="Xác nhận gia hạn?" message={`${`Giao dịch gia hạn thực tế ${confirm.occurred_at?.replace("T"," ")}. `}${data.code} · ${item?.license || ""} · phiên bản #${confirm.expected_version}. Hẹn trả mới ${confirm.return_at.replace("T", " ")}. Phí gia hạn ${money(Number(confirm.amount))}; tổng hợp đồng sau lưu ${money(data.totalAmount===null?null:data.totalAmount + Number(confirm.amount))}.${outside ? ` Phí thu ngoài ${money(outside)} (${confirm.outside_name}), không cộng tổng hợp đồng.` : ""}${confirm.receipt ? ` Đã thực nhận ${money(Number(confirm.amount) + outside)} · ${accountLabel || ""} · ${confirm.receipt.paid_at.replace("T", " ")}. Bill đã rà soát cho đúng phiên bản.` : " Chưa thu tiền; lưu phí thỏa thuận và hẹn trả, không tạo phiếu thu."}${confirm.expected_amount !== undefined && confirm.expected_amount !== confirm.amount ? ` Phí khác gợi ý ${money(Number(confirm.expected_amount))}; xác nhận đúng thỏa thuận.` : ""}`}
      confirmLabel="Xác nhận lưu gia hạn" onCancel={() => setConfirm(null)} onConfirm={() => { const input = confirm; setConfirm(null); void action.submit(input); }} />}
    {resolving && <ConfirmEdit title="Đối chiếu yêu cầu gia hạn?" message="Nếu đã ghi, ứng dụng trả lại đúng phiên bản và phiếu thu đã lưu. Nếu chưa ghi, máy chủ khóa mã cũ trước khi cho rà soát lại. Gia hạn hoặc khoản tiền đã ghi không bị hủy."
      confirmLabel="Đối chiếu gia hạn với máy chủ" onCancel={() => setResolving(false)} onConfirm={() => { setResolving(false); void action.resolve(); }} />}
    {action.exit && <ConfirmEdit title={action.busy ? "Đang lưu gia hạn" : "Rời bước gia hạn?"} busy={action.busy} message={action.busy ? "Chờ máy chủ xác nhận kết quả." : "Nội dung chưa gửi sẽ mất. Mã yêu cầu đã gửi được giữ trên thiết bị để đối chiếu khi mở lại."}
      confirmLabel="Rời bước gia hạn" onCancel={action.dismissExit} onConfirm={action.leave} />}
  </SafeAreaView>;
}
