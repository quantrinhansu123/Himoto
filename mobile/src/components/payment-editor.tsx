import { useEffect, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, View, type ScrollViewInstance } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import type { MobileCollectionMethod } from "@himoto/mobile-contract";
import { validateBackfillPayment } from "../../../shared/mobile-backfill";
import { validDraftTime } from "@himoto/mobile-draft-validation";
import { PAYMENT_PURPOSE_LABELS, paymentImpact } from "../../../shared/mobile-finance";
import type { MobilePaymentInput, MobilePaymentPurpose } from "../../../shared/mobile-finance";
import { paymentRenewalLines,paymentRenewalTotal,suggestedPaymentRenewal } from "@/lib/payment-renewal-form";
import { PaymentRenewalFields } from "./payment-renewal-fields";
import { useSession } from "@/providers/session";
import { usePaymentWrite } from "@/hooks/use-payment-write";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { money, useTheme } from "@/theme";
import { Button, Card, InlineError, StateView } from "./ui";
import { ChoiceField, FormField } from "./form-fields";
import { RentalDateTime } from "./rental-date-time";
import { ConfirmEdit } from "./editor-sheet";

const paymentNow = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16);
const methods = [{ value: "cash", label: "Tiền mặt" }, { value: "transfer", label: "CK tài khoản cá nhân" }, { value: "company_transfer", label: "CK tài khoản công ty" }];
export function PaymentEditor({ id,backfill=false }: { id: string;backfill?:boolean }) {
  const { session } = useSession();
  if (!/^[1-9]\d{0,14}$/.test(id) || !session?.user.permissions.includes("contracts.read") || !session.user.permissions.includes("finance.write"))
    return <StateView title="Không mở được bước ghi thu/chi" message="Tài khoản cần quyền tài chính để ghi khoản đã thu hoặc hoàn." />;
  return <PaymentForm key={`${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}:${id}:${backfill}`} id={id} backfill={backfill} />;
}
function PaymentForm({ id,backfill }: { id: string;backfill:boolean }) {
  const theme = useTheme(), { api, session } = useSession();
  const [purpose, setPurpose] = useState<MobilePaymentPurpose | null>(null), [amount, setAmount] = useState("");
  const [method, setMethod] = useState<MobileCollectionMethod>(backfill?"cash":"transfer"), [account, setAccount] = useState("");
  const [initialTime] = useState(()=>backfill?"":paymentNow()), [paidAt, setPaidAt] = useState(initialTime), [note, setNote] = useState<string | null>(null);
  const [renewalDays,setRenewalDays]=useState("1"),[renewalPicks,setRenewalPicks]=useState<Record<string,string>|null>(null);
  const [backfillConfirmed,setBackfillConfirmed]=useState(false);
  const [localError, setLocalError] = useState(""), [confirm, setConfirm] = useState<MobilePaymentInput | null>(null), [resolving, setResolving] = useState(false);
  const dirty = !!amount || purpose !== null || method !== (backfill?"cash":"transfer") || !!account || paidAt !== initialTime || note !== null || backfillConfirmed || renewalDays!=="1" || !!Object.keys(renewalPicks||{}).length;
  const action = usePaymentWrite(id, dirty);
  const form = useRef<ScrollViewInstance>(null), reducedMotion = useReducedMotion();
  useEffect(() => {
    if (!localError && !action.error && !action.key) return;
    const frame = requestAnimationFrame(() => form.current?.scrollTo({ y: 0, animated: !reducedMotion }));
    return () => cancelAnimationFrame(frame);
  }, [localError, action.error, action.key, reducedMotion]);
  const query = useQuery({
    queryKey: ["finance", session?.user.id, session?.user.storeId, session?.user.allStores, id, "editor"],
    queryFn: ({ signal }) => api!.finance(id, 1, signal), enabled: !!api, staleTime: 0, gcTime: 0,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const data = query.data, selected = purpose ?? data?.purposes[0] ?? "debt";
  const picks=renewalPicks??(data?.renewalItems?.length===1?{[String(data.renewalItems[0].id)]:suggestedPaymentRenewal(data.renewalItems[0].dailyPrice,renewalDays)}:{});
  const locked = action.busy || action.checking || !!action.key || !action.checked || !!action.receipt;
  const effectiveNote = note ?? (backfill?"":data ? `${PAYMENT_PURPOSE_LABELS[selected]} · ${data.code}` : "");
  const available = data?.accounts.filter((row) => row.method === method) ?? [];
  const effectiveAccount=account||(backfill&&available.length===1?`${method}:${available[0].id}`:"");
  function review(at: number) {
    Keyboard.dismiss(); setLocalError("");
    if (!data || locked || query.isFetching || query.isError) return;
    try {
      if(backfill)validateBackfillPayment(paidAt,backfillConfirmed,at);
      if (!data.canWrite || !data.purposes.includes(selected)) throw Error("Chọn nghiệp vụ còn khả dụng của hợp đồng.");
      const lines=selected==="renewal"?paymentRenewalLines(data,picks,renewalDays):undefined,recordedAmount=lines?String(paymentRenewalTotal(lines)):amount;
      if (!/^[1-9]\d{0,12}$/.test(recordedAmount) || !Number.isSafeInteger(Number(recordedAmount))) throw Error("Nhập số tiền nguyên dương bằng VND, tối đa 13 chữ số.");
      const destination = available.find((row) => `${row.method}:${row.id}` === effectiveAccount);
      if (!destination) throw Error("Chọn đúng tài khoản đã thực nhận hoặc thực chi tiền.");
      if (!validDraftTime(paidAt) || Date.parse(`${paidAt}:00+07:00`) > at + 5 * 60000) throw Error("Kiểm tra thời điểm thực thu/chi; không chọn ngày giờ tương lai.");
      const limit = selected === "deposit" ? data.depositRemaining : selected === "deposit_refund" ? data.depositHeld : selected === "rental_refund" ? data.rentalRefundable : null;
      if (limit !== null && Number(recordedAmount) > limit) throw Error(`Số tiền nhập vượt giới hạn ${money(limit)} của nghiệp vụ đã chọn.`);
      if (effectiveNote.trim().length > 2000) throw Error("Nội dung thu/chi tối đa 2.000 ký tự.");
      const impact = paymentImpact(data, selected, Number(recordedAmount));
      if (impact.totalAfter !== null && impact.totalAfter > 9_999_999_999_999) throw Error("Tổng hợp đồng sau thu vượt giới hạn lưu trữ.");
      setConfirm({ revision: data.revision, expected_total: data.totalAmount, expected_remaining: data.rentalRemaining, purpose: selected, amount:recordedAmount, method, account_id: destination.id, paid_at: paidAt,
        note: effectiveNote.trim(), ...(lines?{items:lines}:{}), ...(impact.overpayment ? { acknowledge_overpayment: true } : {}) });
    } catch (cause) { setLocalError((cause as Error).message); }
  }
  if (action.receipt) return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
    <ScrollView contentContainerStyle={{ padding: 24, gap: 20, maxWidth: 760, width: "100%", alignSelf: "center" }}>
      <Card style={{ gap: 16 }}>
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 24, fontWeight: "800" }}>Thu/chi đã được ghi nhận</Text>
        <Text selectable style={{ color: theme.text, fontSize: 18 }}>Phiếu #{action.receipt.transactionId}</Text>
        <Text style={{ color: theme.muted, fontSize: 15, lineHeight: 24 }}>Kết quả đã lưu trên máy chủ. Kiểm tra lịch sử thu/chi trước khi ghi một khoản khác.</Text>
        {!!action.error && <InlineError message={action.error} />}
        <Button label="Xem lịch sử thu/chi" loading={action.checking} onPress={() => { void action.openReceipt(); }} />
      </Card>
    </ScrollView>
  </SafeAreaView>;
  if (!data && query.isPending) return <StateView title="Đang tải số liệu thu/chi" loading />;
  if (!data) return <StateView title="Chưa tải được số liệu thu/chi" message={query.error?.message || action.error}
    retry={() => { void query.refetch(); }} />;
  const impact = confirm ? paymentImpact(data, confirm.purpose, Number(confirm.amount)) : null;
  const confirmAccount = confirm && data.accounts.find((row) => row.id === confirm.account_id && row.method === confirm.method);
  return <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView ref={form} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 18, maxWidth: 760, width: "100%", alignSelf: "center" }}>
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 25, fontWeight: "800" }}>{data.code}</Text>
          {backfill&&<Text style={{color:theme.warning,lineHeight:24}}>Nhập bổ sung khoản thu/chi bị quên. Chọn đúng ngày giao dịch, kiểm tra lịch sử và tài khoản để tránh ghi trùng.</Text>}
          <Text style={{ color: theme.muted, fontSize: 15, lineHeight: 24 }}>Chỉ ghi khoản đã thực thu hoặc thực hoàn. Đối chiếu tiền và tài khoản trước khi xác nhận.</Text>
        </View>
        <Card style={{ gap: 8 }}>
          <Text style={{ color: theme.text, fontSize: 17 }}>Tiền thuê còn thiếu: {money(data.rentalRemaining)}</Text>
          <Text style={{ color: theme.text, fontSize: 17 }}>Cọc đang giữ: {money(data.depositHeld)}</Text>
          <Text style={{ color: theme.text, fontSize: 17 }}>Cọc còn thiếu: {money(data.depositRemaining)}</Text>
        </Card>
        {!!(localError || action.error) && <InlineError message={localError || action.error} />}
        {!!action.notice && <Text accessibilityLiveRegion="polite" style={{ color: theme.text, fontSize: 15, lineHeight: 24 }}>{action.notice}</Text>}
        {!!action.key && <Card style={{ gap: 14 }}>
          <Text style={{ color: theme.warning, fontSize: 15, lineHeight: 24 }}>Yêu cầu đã gửi đang chờ đối chiếu. Nội dung được giữ nguyên; chưa ghi khoản khác để tránh trùng tiền.</Text>
        </Card>}
        {query.isError && <InlineError message="Chưa cập nhật được số liệu. Nội dung đang nhập vẫn được giữ; tải lại trước khi xác nhận." />}
        {data.purposes.length > 0 ? <Card style={{ gap: 18 }}>
          <ChoiceField label="Nghiệp vụ thu/chi" value={selected} disabled={locked}
            choices={data.purposes.map((value) => ({ value, label: PAYMENT_PURPOSE_LABELS[value] }))}
            onChange={(value) => { setPurpose(value as MobilePaymentPurpose);setRenewalPicks(null);setRenewalDays("1"); setLocalError(""); }} />
          {selected === "extra" && <Text style={{ color: theme.warning, fontSize: 15, lineHeight: 23 }}>Khoản thu thêm làm tăng cả giá trị hợp đồng và tiền đã thu. Ghi rõ nội dung khoản thu.</Text>}
          {selected==="renewal"?<PaymentRenewalFields data={data} days={renewalDays} picks={picks} disabled={locked} onDays={setRenewalDays} onPicks={setRenewalPicks} />:<>
          <FormField label="Số tiền thực thu/chi (VND)" value={amount} onChangeText={(value) => { setAmount(value); setLocalError(""); }} editable={!locked} keyboardType="number-pad" maxLength={20}
            hint={/^[1-9]\d{0,12}$/.test(amount) ? money(Number(amount)) : "Nhập số tiền nguyên bằng VND."} />
          </>}
          <ChoiceField label="Hình thức thu/chi" value={method} choices={methods} disabled={locked}
            onChange={(value) => { setMethod(value as MobileCollectionMethod); setAccount(""); setLocalError(""); }} />
          <ChoiceField label={selected.endsWith("refund") ? "Tài khoản thực chi" : "Tài khoản thực nhận"} value={effectiveAccount} disabled={locked}
            choices={available.map((row) => ({ value: `${row.method}:${row.id}`, label: row.label }))}
            onChange={(value) => { setAccount(value); setLocalError(""); }} searchable />
          {!available.length && <Text style={{ color: theme.warning, fontSize: 15 }}>Chưa có tài khoản hoạt động phù hợp với hình thức và cơ sở này.</Text>}
          {backfill&&<ChoiceField label="Xác nhận giao dịch thu chi lịch sử" value={backfillConfirmed?"yes":"no"} choices={[{value:"no",label:"Chưa xác nhận khoản tiền đã phát sinh"},{value:"yes",label:"Xác nhận tiền đã thực thu hoặc thực chi"}]} disabled={locked} onChange={value=>setBackfillConfirmed(value==="yes")} />}
          <RentalDateTime label="thực thu/chi" value={paidAt} disabled={locked} onChange={(value) => { setPaidAt(value); setLocalError(""); }} />
          <FormField label="Nội dung thu/chi" value={effectiveNote} onChangeText={setNote} editable={!locked} multiline maxLength={2000} />
        </Card> : <Card><Text style={{ color: theme.muted, fontSize: 15, lineHeight: 24 }}>Hợp đồng hiện không có nghiệp vụ thu/chi khả dụng.</Text></Card>}
        <Button secondary label="Ẩn bàn phím" onPress={Keyboard.dismiss} />
        <Button secondary label="Tải lại số liệu thu/chi" loading={query.isFetching} disabled={action.busy || action.checking} onPress={() => { setLocalError(""); void query.refetch(); }} />
      </ScrollView>
      <View style={{ padding: 16, borderTopWidth: 1, borderColor: theme.border, backgroundColor: theme.surface }}>
        <View style={{ maxWidth: 724, width: "100%", alignSelf: "center" }}>
          {action.key ? <Button label={action.busy ? "Đang ghi thu/chi" : "Đối chiếu yêu cầu thu/chi"} loading={action.busy || action.checking} disabled={action.busy || action.checking} onPress={() => setResolving(true)} /> :
            <Button label="Ghi nhận khoản thu/chi" disabled={locked || query.isError || query.isFetching || data.purposes.length === 0} onPress={() => review(Date.now())} />}
        </View>
      </View>
    </KeyboardAvoidingView>
    {confirm && <ConfirmEdit title="Xác nhận khoản đã thu/chi?"
      message={`${PAYMENT_PURPOSE_LABELS[confirm.purpose]}: ${money(Number(confirm.amount))}. ${methods.find((row) => row.value === confirm.method)?.label} · ${confirmAccount?.label || ""}. Thực hiện lúc ${confirm.paid_at.replace("T", " ")}. Nội dung: ${confirm.note}.${confirm.items?.length?` Gia hạn ${confirm.items.length} xe: ${confirm.items.map(line=>{const item=data.renewalItems?.find(r=>r.id===line.item_id);return `${item?.license||line.item_id}: ${line.return_at.replace("T"," ")} · ${money(Number(line.amount))}`;}).join("; ")}.`:""}${impact?.overpayment ? ` Số thu vượt còn thiếu: ${money(Number(confirm.amount) - (data.rentalRemaining ?? 0))}.` : ""}${impact && impact.totalIncrease > 0 ? ` Tổng hợp đồng tăng ${money(impact.totalIncrease)}, thành ${money(impact.totalAfter)}.` : impact?.overpayment ? " Hợp đồng đã đủ tiền; vẫn ghi thêm khoản thực nhận, không tăng tổng hợp đồng." : ""} Chỉ xác nhận khi tiền đã thực nhận hoặc thực chi đúng như trên.`}
      confirmLabel="Xác nhận đã thu/chi" onCancel={() => setConfirm(null)} onConfirm={() => { const input = confirm; setConfirm(null); void action.submit(input); }} />}
    {resolving && <ConfirmEdit title="Đối chiếu yêu cầu thu/chi?" message="Nếu đã ghi, ứng dụng trả lại đúng phiếu đã lưu. Nếu chưa ghi, máy chủ khóa mã cũ để chặn yêu cầu đến muộn rồi cho phép rà soát lại nội dung. Không hủy phiếu hoặc khoản tiền đã ghi."
      confirmLabel="Đối chiếu với máy chủ" onCancel={() => setResolving(false)} onConfirm={() => { setResolving(false); void action.resolve(); }} />}
    {action.exit && <ConfirmEdit title={action.busy ? "Đang ghi thu/chi" : "Rời bước thu/chi?"} busy={action.busy}
      message={action.busy ? "Chờ máy chủ xác nhận kết quả." : "Nội dung chưa gửi sẽ mất. Mã yêu cầu đã gửi được giữ trên thiết bị để đối chiếu sau khi mở lại."}
      confirmLabel="Rời bước thu/chi" onCancel={action.dismissExit} onConfirm={action.leave} />}
  </SafeAreaView>;
}
