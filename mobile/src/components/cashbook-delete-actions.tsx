import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { uuid } from "expo";
import { ScrollView, Text, View } from "react-native";
import { CASHBOOK_DELETE_OPERATION, CASHBOOK_DELETE_BATCH_SIZE, type VoucherDeleteRow } from "../../../shared/mobile-cashbook-delete";
import { pendingWrites } from "@/lib/pending-writes";
import { useSession } from "@/providers/session";
import { money, useTheme } from "@/theme";
import { Button, Card, InlineError } from "./ui";
import { FormField } from "./form-fields";
import { EditorSheet } from "./editor-sheet";
type Plan = { nonce: number; type: "income" | "expense"; filters: string; rows: VoucherDeleteRow[] | null };
function DeleteReview({ plan, onClose, onDeleted }: { plan: Plan; onClose: () => void; onDeleted: () => void }) {
  const { api, session } = useSession(), theme = useTheme(), cache = useQueryClient();
  const [busy, setBusy] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState(""), [done, setDone] = useState(0), [complete, setComplete] = useState(false), [confirm, setConfirm] = useState("");
  const running = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const selection = useQuery({ queryKey: ["cashbook-delete-selection", session!.user.id, plan.filters, plan.type, plan.nonce], queryFn: ({ signal }) => api!.cashbookDeleteSelection(new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(plan.filters)), type: plan.type }).toString(), signal), enabled: plan.rows === null, gcTime: 0, retry: false });
  const rows = plan.rows || selection.data?.rows || [], loading = plan.rows === null && selection.isPending, failed = plan.rows === null && selection.isError;
  const amount = rows.reduce((sum, row) => sum + row.amount, 0), ready = rows.length > 0 && Number.isFinite(amount) && !loading && !failed;
  async function remove() {
    if (!api || !session || running.current || pending || !ready || complete || plan.rows === null && confirm.trim().toUpperCase() !== "XOA") return;
    running.current = true; setBusy(true); setError("");
    const scope = { origin: api.origin, userId: session.user.id, storeId: session.user.allStores ? null : session.user.storeId, allStores: session.user.allStores };
    try {
      for (let index = 0; index < rows.length; index += CASHBOOK_DELETE_BATCH_SIZE) {
        if (!alive.current) return;
        const ids = rows.slice(index, index + CASHBOOK_DELETE_BATCH_SIZE).map(row => Number(row.id));
        const intent = await pendingWrites.reserveExclusive(scope, CASHBOOK_DELETE_OPERATION, [CASHBOOK_DELETE_OPERATION], () => uuid.v4().toLowerCase());
        if (!alive.current) return;
        setPending(true);
        if (!intent.created) throw Error("Còn đợt xóa phiếu chưa rõ kết quả. Mở Tài khoản để đối chiếu mã gốc trước khi tiếp tục.");
        await api.deleteCashbookVouchers(ids, intent.key);
        if (!alive.current) return;
        const proof = await api.cashbookDeletion(intent.key);
        if (!alive.current) return;
        if (proof.deletedCount !== ids.length) throw Error("Số phiếu xác nhận chưa khớp. Giữ mã gốc để đối chiếu.");
        // The one confirmation authorizes this frozen list. Each batch's own
        // committed receipt is read before clearing its exact UUID or proceeding.
        await pendingWrites.complete(scope, CASHBOOK_DELETE_OPERATION, intent.key);
        if (!alive.current) return;
        setPending(false); setDone(index + ids.length);
        for (const queryKey of [["cashbook"], ["cashbook-accounts"], ["cashbook-account"], ["cashbook-account-transactions"], ["finance"], ["catalogue"], ["record"]]) void cache.invalidateQueries({ queryKey });
      }
      if (alive.current) { setComplete(true); onDeleted(); }
    } catch (cause) { if (alive.current) setError((cause as Error).message); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  return <EditorSheet title={complete ? "Kết quả xóa phiếu" : "Rà soát xóa phiếu sổ quỹ"} onClose={() => { if (!busy) onClose(); }}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}>
      <Card style={{ gap: 12 }}>
        <Text accessibilityRole="header" style={{ color: complete ? theme.success : theme.text, fontSize: 22, fontWeight: "800" }}>{complete ? `Đã xác nhận xóa ${done} phiếu` : loading ? "Đang lấy toàn bộ phiếu theo bộ lọc" : `${rows.length} phiếu trong danh sách xóa`}</Text>
        <Text style={{ color: theme.text, lineHeight: 23 }}>Tổng số tiền trên phiếu: {ready ? money(amount) : "—"}</Text>
        <Text style={{ color: theme.muted, lineHeight: 23 }}>{plan.rows === null ? `Toàn bộ ${plan.type === "income" ? "phiếu thu" : "phiếu chi"} theo bộ lọc lúc mở xác nhận, kể cả các trang chưa xem.` : "Các phiếu đã chọn, có thể thuộc nhiều trang hoặc loại phiếu."}</Text>
        {!complete && <Text style={{ color: theme.danger, lineHeight: 23 }}>Xóa vĩnh viễn phiếu. Khoản đã thu, tổng tiền hợp đồng hoặc tiền pin liên quan sẽ được điều chỉnh tương ứng.</Text>}
        {!complete && <Text style={{ color: theme.muted, lineHeight: 23 }}>Mỗi đợt tối đa 500 phiếu. Chỉ chuyển sang đợt tiếp theo sau khi đọc được xác nhận của đợt trước.</Text>}
        {!!rows.length && <Text selectable style={{ color: theme.muted }}>{rows.slice(0, 6).map(row => `#${row.id}`).join(", ")}{rows.length > 6 ? "…" : ""}</Text>}
      </Card>
      {(busy || done > 0) && <Text accessibilityLiveRegion="polite" style={{ color: theme.text, fontWeight: "700" }}>Đã đối chiếu {done}/{rows.length} phiếu{busy ? " · Đang xử lý…" : ""}</Text>}
      {failed && <InlineError message={selection.error.message} />}
      {failed && <Button secondary label="Tải lại danh sách phiếu cần xóa" onPress={() => { void selection.refetch(); }} />}
      {!!error && <InlineError message={error} />}
      {pending && !busy && <>
        <Text style={{ color: theme.muted, lineHeight: 23 }}>Đợt vừa gửi chưa được đối chiếu xong. Không gửi lại hoặc tạo mã mới. Các đợt trước đã xác nhận vẫn được giữ; sau đối chiếu có thể lọc lại các phiếu còn lại.</Text>
        <Button secondary label="Mở Tài khoản để đối chiếu xóa phiếu" onPress={() => { onClose(); router.push("/(tabs)/account"); }} />
      </>}
      {!complete && !pending && plan.rows === null && <FormField label="Gõ XOA để xác nhận xóa toàn bộ danh sách" value={confirm} onChangeText={setConfirm} editable={!busy} autoCapitalize="characters" autoCorrect={false} maxLength={8} />}
      {!complete && <Button label={`Xóa ${rows.length} phiếu đã rà soát`} loading={busy} disabled={!ready || pending || plan.rows === null && confirm.trim().toUpperCase() !== "XOA"} onPress={() => { void remove(); }} />}
      <Button secondary label={complete ? "Đóng kết quả xóa phiếu" : "Đóng rà soát xóa phiếu"} disabled={busy} onPress={onClose} />
    </ScrollView>
  </EditorSheet>;
}
export function CashbookDeleteActions({ selected, filters, type, disabled, onDeleted }: { selected: VoucherDeleteRow[]; filters: string; type: "income" | "expense"; disabled: boolean; onDeleted: () => void }) {
  const { session } = useSession();
  const [plan, setPlan] = useState<Plan | null>(null), sequence = useRef(0);
  if (!session!.user.permissions.includes("settings.write")) return null;
  return <View style={{ gap: 12 }}>
    <Button secondary label={`Xóa phiếu đã chọn (${selected.length})`} disabled={disabled || !selected.length} onPress={() => setPlan({ nonce: ++sequence.current, rows: [...selected], filters, type })} />
    <Button secondary label={`Xóa hết ${type === "income" ? "phiếu thu" : "phiếu chi"} theo bộ lọc`} disabled={disabled} onPress={() => setPlan({ nonce: ++sequence.current, rows: null, filters, type })} />
    {plan && <DeleteReview key={plan.nonce} plan={plan} onClose={() => setPlan(null)} onDeleted={onDeleted} />}
  </View>;
}
