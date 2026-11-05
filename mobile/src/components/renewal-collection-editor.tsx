import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, View, type ScrollViewInstance } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import type { MobileCollectionMethod } from "@himoto/mobile-contract";
import type { MobileRenewalCollectionInput } from "../../../shared/mobile-renewal-collection";
import { useSession } from "@/providers/session";
import { useRenewalCollectionWrite } from "@/hooks/use-renewal-collection-write";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { renewalLocalTime } from "@/lib/renewal-form";
import { reviewRenewalCollection } from "@/lib/renewal-collection-form";
import { pendingWrites } from "@/lib/pending-writes";
import { dateTime, money, useTheme } from "@/theme";
import { Button, Card, InlineError, StateView } from "./ui";
import { FormField, ChoiceField } from "./form-fields";
import { RentalDateTime } from "./rental-date-time";
import { ConfirmEdit } from "./editor-sheet";
import { BillPhoto } from "./bill-photo";

const methods = [{ value: "cash", label: "Tiền mặt" }, { value: "transfer", label: "CK tài khoản cá nhân" }, { value: "company_transfer", label: "CK tài khoản công ty" }];
export function RenewalCollectionEditor({ id, version }: { id: string; version?: string }) {
  const { session } = useSession();
  if (!/^[1-9]\d{0,14}$/.test(id) || !session?.user.permissions.includes("contracts.read") || !session.user.permissions.includes("finance.write"))
    return <StateView title="Không mở được thu theo kỳ" message="Tài khoản cần quyền ghi thu/chi hợp đồng." />;
  return <CollectionForm key={`${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}:${id}:${version ?? "recover"}`} id={id} version={version} />;
}
function CollectionForm({ id, version }: { id: string; version?: string }) {
  const theme = useTheme(), { api, session } = useSession(), cache = useQueryClient(), reducedMotion = useReducedMotion();
  const targetVersion = version && /^[1-9]\d{0,14}$/.test(version) && Number(version) >= 2 ? Number(version) : null;
  const [customAmount, setAmount] = useState<string | null>(null), [method, setMethod] = useState<MobileCollectionMethod>("transfer"), [account, setAccount] = useState("");
  const [initialPaidAt] = useState(() => renewalLocalTime(Date.now())), [paidAt, setPaidAt] = useState(initialPaidAt), [customNote, setNote] = useState<string | null>(null);
  const [readyBill, setReadyBill] = useState(""), [reviewedBill, setReviewedBill] = useState(""), [imageEpoch, setImageEpoch] = useState(0);
  const [localError, setLocalError] = useState(""), [confirm, setConfirm] = useState<MobileRenewalCollectionInput | null>(null), [resolving, setResolving] = useState(false);
  const [billLedger, setBillLedger] = useState<{checked:boolean;pending:boolean;error:string}>({checked:false,pending:false,error:""});
  const action = useRenewalCollectionWrite(id, customAmount !== null || method !== "transfer" || !!account || paidAt !== initialPaidAt || customNote !== null);
  const scroll = useRef<ScrollViewInstance>(null);
  const query = useQuery({ queryKey: ["renewal-collection", session?.user.id, session?.user.storeId, session?.user.allStores, id, targetVersion],
    queryFn: ({ signal }) => api!.renewalCollection(id, targetVersion!, signal), enabled: !!api && targetVersion !== null && !action.receipt,
    staleTime: 0, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const data = query.data;
  const bill = useQuery({ queryKey: ["renewal-collection-bill", session?.user.id, session?.user.storeId, session?.user.allStores, id, targetVersion],
    queryFn: ({ signal }) => api!.collectionBill(id, targetVersion!, signal), enabled: !!api && !!data && !action.receipt,
    staleTime: 0, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false });
  useFocusEffect(useCallback(() => {
    let cancelled=false;
    void cache.invalidateQueries({ queryKey: ["renewal-collection"] }); void cache.invalidateQueries({ queryKey: ["renewal-collection-bill"] });
    setReviewedBill(""); setImageEpoch(value => value + 1);
    setBillLedger({checked:false,pending:false,error:""});
    if(api&&session)void pendingWrites.lookup({origin:api.origin,userId:session.user.id,storeId:session.user.allStores?null:session.user.storeId,allStores:session.user.allStores},`payment.bill:${id}`)
      .then(key=>{if(!cancelled)setBillLedger({checked:true,pending:!!key,error:""});})
      .catch(cause=>{if(!cancelled)setBillLedger({checked:true,pending:false,error:(cause as Error).message});});
    return()=>{cancelled=true;};
  }, [cache,api,session,id]));
  useEffect(() => {
    if (!localError && !action.error && !action.key) return;
    const frame = requestAnimationFrame(() => scroll.current?.scrollTo({ y: 0, animated: !reducedMotion }));
    return () => cancelAnimationFrame(frame);
  }, [localError, action.error, action.key, reducedMotion]);
  const locked = !action.checked || action.busy || action.checking || !!action.key || !!action.receipt;
  const amount = customAmount ?? (data ? String(data.period.remaining) : ""), note = customNote ?? (data ? `Thu gia hạn #${data.period.version} · ${data.code}` : "");
  const billKey = bill.data?.photoRevision ? `${bill.data.version}:${bill.data.photoRevision}:${imageEpoch}` : "";
  function review() {
    Keyboard.dismiss(); setLocalError("");
    if (!data || locked || !billLedger.checked || billLedger.pending || billLedger.error || query.isFetching || query.isError || bill.isFetching || bill.isError) return;
    try {
      setConfirm(reviewRenewalCollection(data, { amount, method, account, paidAt, note,
        reviewedBill: billKey && readyBill === billKey && reviewedBill === billKey ? { version: bill.data!.version, revision: bill.data!.photoRevision! } : null }, Date.now()));
    } catch (cause) { setLocalError((cause as Error).message); }
  }
  const overlays = <>
    {resolving && <ConfirmEdit title="Đối chiếu khoản thu theo kỳ?" message="Nếu đã thu, ứng dụng trả lại đúng phiên bản và phiếu đã lưu. Nếu chưa ghi, máy chủ khóa mã cũ rồi giữ nội dung để rà soát lại. Không hủy khoản tiền đã ghi."
      confirmLabel="Đối chiếu khoản thu với máy chủ" onCancel={() => setResolving(false)} onConfirm={() => { setResolving(false); void action.resolve(); }} />}
    {action.exit && <ConfirmEdit title={action.busy ? "Đang ghi khoản thu" : "Rời bước thu theo kỳ?"} busy={action.busy}
      message={action.busy ? "Chờ máy chủ xác nhận kết quả." : "Nội dung chưa gửi sẽ mất. Mã yêu cầu đã gửi được giữ để đối chiếu sau khi mở lại."}
      confirmLabel="Rời bước thu theo kỳ" onCancel={action.dismissExit} onConfirm={action.leave} />}
  </>;
  if (action.receipt) {
    const saved = action.receipt;
    return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18, maxWidth: 760, width: "100%", alignSelf: "center" }}><Card style={{ gap: 16 }}>
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 25, fontWeight: "800" }}>Khoản thu theo kỳ đã được ghi nhận</Text>
        <Text style={{ color: theme.text, fontSize: 18 }}>Kỳ gia hạn #{saved.version}</Text>
        <Text selectable style={{ color: theme.text, fontSize: 18 }}>Phiếu thu #{saved.transactionId} · {money(saved.amount)}</Text>
        <Text style={{ color: theme.text, fontSize: 16, lineHeight: 25 }}>Thời hạn của kỳ: {dateTime(saved.beforeReturnAt ?? saved.periodCreatedAt ?? "")} → {dateTime(saved.returnAt)}</Text>
        <Text style={{ color: theme.text, fontSize: 16 }}>Phí kỳ còn thiếu sau lần thu này: {money(saved.remainingAfter)}</Text>
        <Text style={{ color: theme.muted, fontSize: 15, lineHeight: 24 }}>Tổng tiền hợp đồng và ngày hẹn trả được giữ nguyên. {methods.find(row => row.value === saved.method)?.label} · tài khoản #{saved.accountId} · {dateTime(saved.paidAt)}.</Text>
        {!saved.current && <InlineError message="Kỳ hoặc phiếu thu đã được chỉnh sau lần ghi này. Đây là kết quả gốc; kiểm tra hồ sơ hiện tại trước khi thao tác tiếp." />}
        {!saved.billCurrent && <Text style={{ color: theme.warning, fontSize: 15, lineHeight: 24 }}>Ảnh bill trong hồ sơ đã thay đổi sau lần thu. Kết quả khoản thu gốc vẫn được giữ.</Text>}
        {!!action.error && <InlineError message={action.error} />}
        <Button label="Xác nhận đã kiểm tra khoản thu theo kỳ" loading={action.checking} onPress={() => { void action.acknowledge(); }} />
      </Card></ScrollView>
    </SafeAreaView>;
  }
  if (!data) {
    if (action.key) return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}><ScrollView contentContainerStyle={{ padding: 20 }}><Card style={{ gap: 16 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 24, fontWeight: "800" }}>Khoản thu đang chờ đối chiếu</Text>
      <Text style={{ color: theme.muted, fontSize: 16, lineHeight: 25 }}>Giữ mã yêu cầu để mở đúng phiếu đã lưu trước khi ghi khoản khác.</Text>
      {!!action.error && <InlineError message={action.error} />}
      <Button label="Đối chiếu khoản thu theo kỳ" loading={action.busy || action.checking} onPress={() => setResolving(true)} />
    </Card></ScrollView>{overlays}</SafeAreaView>;
    if (!action.checked || query.isPending && targetVersion !== null) return <StateView title="Đang kiểm tra khoản thu theo kỳ" loading />;
    return <StateView title={targetVersion === null ? "Chưa chọn kỳ gia hạn" : "Chưa tải được số tiền còn thu"} message={query.error?.message || action.error || "Mở kỳ gia hạn đã lưu để kiểm tra số còn thu."} retry={targetVersion === null ? undefined : () => { void query.refetch(); }} />;
  }
  const source = bill.data?.photoRevision && api && session ? { uri: `${api.origin}/api/mobile/v1/contracts/${encodeURIComponent(id)}/renewals/${data.period.version}/collection/bill?revision=${encodeURIComponent(bill.data.photoRevision)}`, headers: { Authorization: `Bearer ${session.token}` } } : null;
  const chosenAccount = confirm && data.accounts.find(row => row.method === confirm.method && row.id === confirm.account_id);
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 18, maxWidth: 760, width: "100%", alignSelf: "center" }}>
        <View style={{ gap: 8 }}><Text accessibilityRole="header" style={{ color: theme.text, fontSize: 25, fontWeight: "800" }}>{data.code}</Text>
          <Text style={{ color: theme.muted, fontSize: 16 }}>Thu tiền cho kỳ gia hạn #{data.period.version}</Text></View>
        {!!(localError || action.error) && <InlineError message={localError || action.error} />}
        {!!action.notice && <Text accessibilityLiveRegion="polite" style={{ color: theme.text, fontSize: 15, lineHeight: 24 }}>{action.notice}</Text>}
        {query.isError && <InlineError message="Chưa cập nhật được số tiền còn thu. Nội dung đang nhập được giữ; tải lại trước khi xác nhận." />}
        {!data.available && <InlineError message={data.blockedReason || "Kỳ này chưa thể ghi thêm khoản thu."} />}
        {!!action.key && <Text style={{ color: theme.warning, fontSize: 15, lineHeight: 24 }}>Có khoản thu chưa rõ kết quả. Đối chiếu trước khi sửa hoặc gửi lại tiền.</Text>}
        <Card style={{ gap: 10 }}>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>{data.period.license} · {data.period.vehicleName}</Text>
          <Text style={{ color: theme.muted, fontSize: 15, lineHeight: 24 }}>{dateTime(data.period.beforeReturnAt ?? data.period.createdAt ?? "")} → {dateTime(data.period.returnAt)}</Text>
          <Text style={{ color: theme.text, fontSize: 17 }}>Phí đã thỏa thuận: {money(data.period.amount)}</Text>
          <Text style={{ color: theme.text, fontSize: 17 }}>Đã thu cho kỳ: {money(data.period.collected)}</Text>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>Kỳ còn thiếu: {money(data.period.remaining)}</Text>
          <Text style={{ color: theme.muted, fontSize: 15, lineHeight: 24 }}>Khoản này thu cho kỳ đã lưu, không cộng lại phí hoặc đổi ngày hẹn trả.</Text>
        </Card>
        <Card style={{ gap: 16 }}>
          <FormField label="Số tiền thu cho kỳ (VND)" value={amount} onChangeText={setAmount} editable={!locked && data.available} keyboardType="number-pad" maxLength={20} />
          <ChoiceField label="Hình thức thu theo kỳ" value={method} choices={methods} disabled={locked} onChange={value => { setMethod(value as MobileCollectionMethod); setAccount(""); }} />
          <ChoiceField label="Tài khoản nhận khoản thu theo kỳ" value={account} disabled={locked} searchable choices={data.accounts.filter(row => row.method === method).map(row => ({ value: `${row.method}:${row.id}`, label: row.label }))} onChange={setAccount} />
          <RentalDateTime label="thực thu theo kỳ" value={paidAt} onChange={setPaidAt} disabled={locked} />
          <FormField label="Nội dung thu theo kỳ" value={note} onChangeText={setNote} editable={!locked} multiline maxLength={2000} />
        </Card>
        <Card style={{ gap: 16 }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>Bill cho kỳ gia hạn #{data.period.version}</Text>
          {(billLedger.pending||!!billLedger.error)&&<InlineError message={billLedger.error||"Có lần lưu bill chưa được xác nhận. Mở bước bill và kiểm tra kết quả trước khi ghi khoản thu."}/>}
          {bill.isError && <InlineError message={bill.error.message} />}
          {source ? <BillPhoto key={billKey} source={source} label="Bill khoản thu theo kỳ" onReady={ready => setReadyBill(ready ? billKey : "")} /> : <Text style={{ color: theme.muted }}>{bill.isPending ? "Đang kiểm tra bill…" : "Chưa có bill chính cho kỳ này."}</Text>}
          <Button secondary label={billLedger.pending?"Đối chiếu bill đang chờ xác nhận":"Chọn hoặc thay bill khoản thu theo kỳ"} disabled={locked} onPress={() => { Keyboard.dismiss(); router.push({ pathname: "/collection-bill/[id]", params: { id, version: String(data.period.version), returnTo: "collection" } }); }} />
          <Button secondary label={billKey && reviewedBill === billKey ? "Đã rà soát bill khoản thu theo kỳ" : "Xác nhận bill đúng khoản thu theo kỳ"} disabled={locked || !billKey || readyBill !== billKey || bill.isError || bill.isFetching} onPress={() => setReviewedBill(billKey)} />
        </Card>
        <Button secondary label="Ẩn bàn phím" onPress={Keyboard.dismiss} />
        <Button secondary label="Tải lại số liệu thu theo kỳ" loading={query.isFetching || bill.isFetching} disabled={action.busy || action.checking} onPress={() => { setReviewedBill(""); setImageEpoch(value => value + 1); void query.refetch(); void bill.refetch(); }} />
      </ScrollView>
      <View style={{ padding: 16, borderTopWidth: 1, borderColor: theme.border, backgroundColor: theme.surface }}><View style={{ maxWidth: 724, width: "100%", alignSelf: "center" }}>
        {action.key ? <Button label={action.busy ? "Đang ghi khoản thu theo kỳ" : "Đối chiếu khoản thu theo kỳ"} loading={action.busy || action.checking} onPress={() => setResolving(true)} /> :
          <Button label="Rà soát khoản thu theo kỳ" disabled={locked || !billLedger.checked || billLedger.pending || !!billLedger.error || !data.available || !data.canWrite || query.isError || query.isFetching || bill.isError || bill.isFetching} onPress={review} />}
      </View></View>
    </KeyboardAvoidingView>
    {confirm && <ConfirmEdit title="Xác nhận khoản đã thu theo kỳ?" message={`${data.code} · kỳ gia hạn #${confirm.version}. Thực nhận ${money(Number(confirm.amount))} · ${chosenAccount?.label || ""} · ${confirm.paid_at.replace("T", " ")}. Phí kỳ còn thiếu sau lần thu: ${money(data.period.remaining - Number(confirm.amount))}. Tổng hợp đồng và hẹn trả được giữ nguyên.${confirm.acknowledge_overpayment ? ` Khoản thu vượt số tiền hợp đồng còn thiếu ${money(Number(confirm.amount) - data.rentalRemaining!)}; chỉ xác nhận khi tiền đã thực nhận đúng như trên.` : ""}`}
      confirmLabel="Xác nhận đã thu cho kỳ" onCancel={() => setConfirm(null)} onConfirm={() => { const input = confirm; setConfirm(null); void action.submit(input); }} />}
    {overlays}
  </SafeAreaView>;
}
