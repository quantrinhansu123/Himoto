import { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  RefreshControl,
  ScrollView,
  Text,
  View,
  type ScrollViewInstance,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, QrCode, ReceiptText, Wallet } from "lucide-react-native";
import type { MobileCollectionMethod } from "@himoto/mobile-contract";
import { validateBackfillPayment } from "../../../shared/mobile-backfill";
import { validDraftTime } from "@himoto/mobile-draft-validation";
import {
  PAYMENT_PURPOSE_LABELS,
  paymentImpact,
  type MobileFinanceContext,
  type MobilePaymentInput,
  type MobilePaymentPurpose,
} from "../../../shared/mobile-finance";
import {
  paymentRenewalLines,
  paymentRenewalTotal,
  suggestedPaymentRenewal,
} from "@/lib/payment-renewal-form";
import { PaymentRenewalFields } from "./payment-renewal-fields";
import { useSession } from "@/providers/session";
import { usePaymentWrite } from "@/hooks/use-payment-write";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { money, useTheme } from "@/theme";
import {
  Button,
  Card,
  InfoBanner,
  InlineError,
  KeyValueRow,
  SkeletonList,
  StateView,
  StatusBadge,
} from "./ui";
import { ChoiceField, FormField } from "./form-fields";
import { KeyboardFormScrollView } from "./keyboard-form-scroll-view";
import { RentalDateTime } from "./rental-date-time";
import { ConfirmEdit } from "./editor-sheet";

const paymentNow = () =>
  new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16);
const methods = [
  { value: "cash", label: "Tiền mặt" },
  { value: "transfer", label: "CK tài khoản cá nhân" },
  { value: "company_transfer", label: "CK tài khoản công ty" },
];

function isRefundPurpose(p: MobilePaymentPurpose | null | undefined) {
  return p === "deposit_refund" || p === "rental_refund";
}

function defaultAmountFor(
  data: MobileFinanceContext,
  purpose: MobilePaymentPurpose,
): string {
  if (purpose === "debt") {
    return data.rentalRemaining && data.rentalRemaining > 0
      ? String(data.rentalRemaining)
      : "";
  }
  if (purpose === "deposit") {
    return data.depositRemaining > 0 ? String(data.depositRemaining) : "";
  }
  if (purpose === "deposit_refund") {
    return data.depositHeld > 0 ? String(data.depositHeld) : "";
  }
  if (purpose === "rental_refund") {
    return data.rentalRefundable > 0 ? String(data.rentalRefundable) : "";
  }
  return "";
}

export function PaymentEditor({
  id,
  backfill = false,
}: {
  id: string;
  backfill?: boolean;
}) {
  const { session } = useSession();
  if (
    !/^[1-9]\d{0,14}$/.test(id) ||
    !session?.user.permissions.includes("contracts.read") ||
    !session.user.permissions.includes("finance.write")
  )
    return (
      <StateView
        title="Không mở được bước ghi thu/chi"
        message="Tài khoản cần quyền tài chính để ghi khoản đã thu hoặc hoàn."
      />
    );
  return (
    <PaymentForm
      key={`${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}:${id}:${backfill}`}
      id={id}
      backfill={backfill}
    />
  );
}

function PaymentForm({ id, backfill }: { id: string; backfill: boolean }) {
  const theme = useTheme(),
    { api, session } = useSession();
  const [purpose, setPurpose] = useState<MobilePaymentPurpose | null>(null);
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [method, setMethod] = useState<MobileCollectionMethod>(
    backfill ? "cash" : "transfer",
  );
  const [account, setAccount] = useState("");
  const [initialTime] = useState(() => (backfill ? "" : paymentNow()));
  const [paidAt, setPaidAt] = useState(initialTime);
  const [note, setNote] = useState<string | null>(null);
  const [renewalDays, setRenewalDays] = useState("1");
  const [renewalPicks, setRenewalPicks] = useState<Record<
    string,
    string
  > | null>(null);
  const [backfillConfirmed, setBackfillConfirmed] = useState(false);
  const [localError, setLocalError] = useState("");
  const [confirm, setConfirm] = useState<MobilePaymentInput | null>(null);
  const [resolving, setResolving] = useState(false);
  const [savedPurpose, setSavedPurpose] =
    useState<MobilePaymentPurpose | null>(null);

  const dirty =
    (amountTouched && !!amount) ||
    purpose !== null ||
    method !== (backfill ? "cash" : "transfer") ||
    !!account ||
    paidAt !== initialTime ||
    note !== null ||
    backfillConfirmed ||
    renewalDays !== "1" ||
    !!Object.keys(renewalPicks || {}).length;

  const action = usePaymentWrite(id, dirty);
  const form = useRef<ScrollViewInstance>(null),
    reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!localError && !action.error && !action.key) return;
    const frame = requestAnimationFrame(() =>
      form.current?.scrollTo({ y: 0, animated: !reducedMotion }),
    );
    return () => cancelAnimationFrame(frame);
  }, [localError, action.error, action.key, reducedMotion]);

  const query = useQuery({
    queryKey: [
      "finance",
      session?.user.id,
      session?.user.storeId,
      session?.user.allStores,
      id,
      "editor",
    ],
    queryFn: ({ signal }) => api!.finance(id, 1, signal),
    enabled: !!api,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const data = query.data;
  const selected: MobilePaymentPurpose = purpose ?? data?.purposes[0] ?? "debt";
  const isRefund = isRefundPurpose(selected);
  const effectiveAmount = amountTouched
    ? amount
    : data
      ? defaultAmountFor(data, selected)
      : "";
  const picks =
    renewalPicks ??
    (data?.renewalItems?.length === 1
      ? {
          [String(data.renewalItems[0].id)]: suggestedPaymentRenewal(
            data.renewalItems[0].dailyPrice,
            renewalDays,
          ),
        }
      : {});
  const locked =
    action.busy ||
    action.checking ||
    !!action.key ||
    !action.checked ||
    !!action.receipt;
  const effectiveNote =
    note ??
    (backfill
      ? ""
      : data
        ? `${PAYMENT_PURPOSE_LABELS[selected]} · ${data.code}`
        : "");
  const available = data?.accounts.filter((row) => row.method === method) ?? [];
  const effectiveAccount =
    account || (available.length === 1 ? `${method}:${available[0].id}` : "");

  function review(at: number) {
    Keyboard.dismiss();
    setLocalError("");
    if (!data || locked || query.isFetching || query.isError) return;
    try {
      if (backfill) validateBackfillPayment(paidAt, backfillConfirmed, at);
      if (!data.canWrite || !data.purposes.includes(selected))
        throw Error("Chọn nghiệp vụ còn khả dụng của hợp đồng.");
      const lines =
        selected === "renewal"
          ? paymentRenewalLines(data, picks, renewalDays)
          : undefined;
      const recordedAmount = lines
        ? String(paymentRenewalTotal(lines))
        : effectiveAmount;
      if (
        !/^[1-9]\d{0,12}$/.test(recordedAmount) ||
        !Number.isSafeInteger(Number(recordedAmount))
      )
        throw Error("Nhập số tiền nguyên dương bằng VND, tối đa 13 chữ số.");
      const destination = available.find(
        (row) => `${row.method}:${row.id}` === effectiveAccount,
      );
      if (!destination)
        throw Error("Chọn đúng tài khoản đã thực nhận hoặc thực chi tiền.");
      if (
        !validDraftTime(paidAt) ||
        Date.parse(`${paidAt}:00+07:00`) > at + 5 * 60000
      )
        throw Error(
          "Kiểm tra thời điểm thực thu/chi; không chọn ngày giờ tương lai.",
        );
      const limit =
        selected === "deposit"
          ? data.depositRemaining
          : selected === "deposit_refund"
            ? data.depositHeld
            : selected === "rental_refund"
              ? data.rentalRefundable
              : null;
      if (limit !== null && Number(recordedAmount) > limit)
        throw Error(
          `Số tiền nhập vượt giới hạn ${money(limit)} của nghiệp vụ đã chọn.`,
        );
      if (effectiveNote.trim().length > 2000)
        throw Error("Nội dung thu/chi tối đa 2.000 ký tự.");
      const impact = paymentImpact(data, selected, Number(recordedAmount));
      if (impact.totalAfter !== null && impact.totalAfter > 9_999_999_999_999)
        throw Error("Tổng hợp đồng sau thu vượt giới hạn lưu trữ.");
      setConfirm({
        revision: data.revision,
        expected_total: data.totalAmount,
        expected_remaining: data.rentalRemaining,
        purpose: selected,
        amount: recordedAmount,
        method,
        account_id: destination.id,
        paid_at: paidAt,
        note: effectiveNote.trim(),
        ...(lines ? { items: lines } : {}),
        ...(impact.overpayment ? { acknowledge_overpayment: true } : {}),
      });
    } catch (cause) {
      setLocalError((cause as Error).message);
    }
  }

  if (action.receipt) {
    const showPostSaveVat =
      method === "company_transfer" &&
      !isRefundPurpose(savedPurpose ?? selected);
    return (
      <SafeAreaView
        edges={["left", "right", "bottom"]}
        style={{ flex: 1, backgroundColor: theme.background }}
      >
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 32,
            gap: 12,
            maxWidth: 760,
            width: "100%",
            alignSelf: "center",
          }}
        >
          <Card style={{ gap: 12 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Text
                accessibilityRole="header"
                style={{ color: theme.text, fontSize: 20, fontWeight: "800" }}
              >
                Thu/chi đã được ghi nhận
              </Text>
              <StatusBadge status="confirmed" label="Đã lưu" />
            </View>
            <KeyValueRow
              label="Mã phiếu"
              value={`#${action.receipt.transactionId}`}
              strong
              selectable
            />
            <InfoBanner
              tone="success"
              message="Kết quả đã lưu trên máy chủ. Kiểm tra lịch sử thu/chi trước khi ghi một khoản khác."
            />
            {showPostSaveVat && (
              <InfoBanner
                tone="warning"
                title="Hợp đồng cần xuất VAT"
                message="Khoản thu qua TK công ty đã lưu. Kiểm tra danh sách Hợp đồng cần xuất VAT để xuất hóa đơn kịp thời."
                action={
                  <Button
                    size="sm"
                    secondary
                    loading={action.checking}
                    icon={<ReceiptText size={14} color={theme.text} />}
                    label="Mở danh sách HĐ cần xuất VAT"
                    onPress={() => {
                      void action.openReceipt(() =>
                        router.push({
                          pathname: "/contracts-workspace/[scope]",
                          params: { scope: "vat" },
                        }),
                      );
                    }}
                  />
                }
              />
            )}
            {!!action.error && <InlineError message={action.error} />}
            <View style={{ gap: 8, paddingTop: 2 }}>
              <Button
                label="Xem lịch sử thu/chi"
                loading={action.checking}
                onPress={() => {
                  void action.openReceipt();
                }}
              />
              <Button
                size="sm"
                secondary
                loading={action.checking}
                icon={<Wallet size={14} color={theme.text} />}
                label="Mở Sổ quỹ"
                onPress={() => {
                  void action.openReceipt(() => router.push("/cashbook"));
                }}
              />
            </View>
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!data && query.isPending)
    return (
      <SafeAreaView
        edges={["left", "right", "bottom"]}
        style={{ flex: 1, backgroundColor: theme.background, padding: 16 }}
      >
        <View style={{ maxWidth: 760, width: "100%", alignSelf: "center" }}>
          <SkeletonList count={3} lines={3} />
        </View>
      </SafeAreaView>
    );

  if (!data)
    return (
      <SafeAreaView
        edges={["left", "right", "bottom"]}
        style={{ flex: 1, backgroundColor: theme.background }}
      >
        <StateView
          title="Chưa tải được số liệu thu/chi"
          message={query.error?.message || action.error}
          retry={() => {
            void query.refetch();
          }}
        />
      </SafeAreaView>
    );

  const impact = confirm
    ? paymentImpact(data, confirm.purpose, Number(confirm.amount))
    : null;
  const confirmAccount =
    confirm &&
    data.accounts.find(
      (row) => row.id === confirm.account_id && row.method === confirm.method,
    );

  return (
    <SafeAreaView
      edges={["left", "right", "bottom"]}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <KeyboardFormScrollView
        ref={form}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 32,
          gap: 12,
          maxWidth: 760,
          width: "100%",
          alignSelf: "center",
        }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            tintColor={theme.primary}
            onRefresh={() => {
              setLocalError("");
              void query.refetch();
            }}
          />
        }
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              accessibilityRole="header"
              style={{ color: theme.text, fontSize: 20, fontWeight: "800" }}
            >
              {data.code}
            </Text>
            <Text style={{ color: theme.muted, fontSize: 13 }}>
              Chỉ ghi khoản đã thực thu hoặc thực hoàn. Đối chiếu tiền và tài
              khoản trước khi xác nhận.
            </Text>
          </View>
          <StatusBadge status={data.status} />
        </View>

        {backfill && (
          <InfoBanner
            tone="warning"
            message="Nhập bổ sung khoản thu/chi bị quên. Chọn đúng ngày giao dịch, kiểm tra lịch sử và tài khoản để tránh ghi trùng."
          />
        )}

        <Card style={{ gap: 6, padding: 14 }}>
          <KeyValueRow
            label="Tiền thuê còn thiếu"
            value={money(data.rentalRemaining)}
            valueColor={
              (data.rentalRemaining ?? 0) > 0 ? theme.danger : theme.success
            }
            strong
          />
          <KeyValueRow
            label="Cọc đang giữ"
            value={money(data.depositHeld)}
            strong
          />
          <KeyValueRow
            label="Cọc còn thiếu"
            value={money(data.depositRemaining)}
            valueColor={
              data.depositRemaining > 0 ? theme.warning : theme.muted
            }
          />
          {data.rentalRefundable > 0 && (
            <KeyValueRow
              label="Tiền thuê có thể hoàn"
              value={money(data.rentalRefundable)}
              valueColor={theme.info}
            />
          )}
          <View style={{ flexDirection: "row", gap: 8, paddingTop: 6 }}>
            <Button
              size="sm"
              secondary
              equalWidth
              icon={<QrCode size={14} color={theme.text} />}
              label="Mã QR chuyển khoản"
              onPress={() =>
                router.push({ pathname: "/contract-qr/[id]", params: { id } })
              }
            />
            {session?.user.permissions.includes("contracts.settle") && (
              <Button
                size="sm"
                secondary
                equalWidth
                icon={<CheckCircle2 size={14} color={theme.text} />}
                label="Thanh toán & Đóng HĐ"
                onPress={() =>
                  router.push({
                    pathname: "/contract-operation/[action]/[id]",
                    params: { action: "payment_settlement", id },
                  })
                }
              />
            )}
          </View>
        </Card>

        {!!(localError || action.error) && (
          <InlineError message={localError || action.error} />
        )}
        {!!action.notice && (
          <InfoBanner tone="info" message={action.notice} />
        )}
        {!!action.key && (
          <InfoBanner
            tone="warning"
            message="Yêu cầu đã gửi đang chờ đối chiếu. Nội dung được giữ nguyên; chưa ghi khoản khác để tránh trùng tiền."
          />
        )}
        {query.isError && (
          <InlineError message="Chưa cập nhật được số liệu. Nội dung đang nhập vẫn được giữ; tải lại trước khi xác nhận." />
        )}

        {data.purposes.length > 0 ? (
          <Card style={{ gap: 14 }}>
            <ChoiceField
              label="Nghiệp vụ thu/chi"
              value={selected}
              disabled={locked}
              choices={data.purposes.map((value) => ({
                value,
                label: PAYMENT_PURPOSE_LABELS[value],
              }))}
              onChange={(value) => {
                setPurpose(value as MobilePaymentPurpose);
                setRenewalPicks(null);
                setRenewalDays("1");
                setLocalError("");
              }}
            />
            {selected === "extra" && (
              <InfoBanner
                tone="warning"
                message="Khoản thu thêm làm tăng cả giá trị hợp đồng và tiền đã thu. Ghi rõ nội dung khoản thu."
              />
            )}
            {selected === "renewal" ? (
              <PaymentRenewalFields
                data={data}
                days={renewalDays}
                picks={picks}
                disabled={locked}
                onDays={setRenewalDays}
                onPicks={setRenewalPicks}
              />
            ) : (
              <FormField
                label={
                  isRefund
                    ? "Số tiền thực chi / hoàn (VND)"
                    : "Số tiền thực thu (VND)"
                }
                value={effectiveAmount}
                onChangeText={(value) => {
                  setAmount(value);
                  setAmountTouched(true);
                  setLocalError("");
                }}
                editable={!locked}
                keyboardType="number-pad"
                maxLength={20}
                hint={
                  /^[1-9]\d{0,12}$/.test(effectiveAmount)
                    ? `Số tiền: ${money(Number(effectiveAmount))}`
                    : "Nhập số tiền nguyên bằng VND."
                }
              />
            )}
            <ChoiceField
              label="Hình thức thu/chi"
              value={method}
              choices={methods}
              disabled={locked}
              onChange={(value) => {
                setMethod(value as MobileCollectionMethod);
                setAccount("");
                setLocalError("");
              }}
            />
            {method === "company_transfer" && !isRefund && (
              <InfoBanner
                tone="warning"
                title="Hợp đồng cần xuất VAT"
                message="Thu qua TK công ty: lưu phiếu và kiểm tra hợp đồng tại mục Hợp đồng cần xuất VAT."
              />
            )}
            <ChoiceField
              label={isRefund ? "Tài khoản thực chi" : "Tài khoản thực nhận"}
              value={effectiveAccount}
              disabled={locked}
              choices={available.map((row) => ({
                value: `${row.method}:${row.id}`,
                label: row.label,
              }))}
              onChange={(value) => {
                setAccount(value);
                setLocalError("");
              }}
              searchable
            />
            {!available.length && (
              <InfoBanner
                tone="warning"
                message="Chưa có tài khoản hoạt động phù hợp với hình thức và cơ sở này."
              />
            )}
            {backfill && (
              <ChoiceField
                label="Xác nhận giao dịch thu chi lịch sử"
                value={backfillConfirmed ? "yes" : "no"}
                choices={[
                  {
                    value: "no",
                    label: "Chưa xác nhận khoản tiền đã phát sinh",
                  },
                  {
                    value: "yes",
                    label: "Xác nhận tiền đã thực thu hoặc thực chi",
                  },
                ]}
                disabled={locked}
                onChange={(value) => setBackfillConfirmed(value === "yes")}
              />
            )}
            <RentalDateTime
              label="thực thu/chi"
              value={paidAt}
              disabled={locked}
              onChange={(value) => {
                setPaidAt(value);
                setLocalError("");
              }}
            />
            <FormField
              label="Nội dung thu/chi"
              value={effectiveNote}
              onChangeText={setNote}
              editable={!locked}
              multiline
              maxLength={2000}
            />
          </Card>
        ) : (
          <Card>
            <Text style={{ color: theme.muted, fontSize: 14, lineHeight: 21 }}>
              Hợp đồng hiện không có nghiệp vụ thu/chi khả dụng.
            </Text>
          </Card>
        )}
      </KeyboardFormScrollView>

      <View
        style={{
          padding: 14,
          borderTopWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.surface,
        }}
      >
        <View style={{ maxWidth: 724, width: "100%", alignSelf: "center" }}>
          {action.key ? (
            <Button
              label={
                action.busy ? "Đang ghi thu/chi" : "Đối chiếu yêu cầu thu/chi"
              }
              loading={action.busy || action.checking}
              disabled={action.busy || action.checking}
              onPress={() => setResolving(true)}
            />
          ) : (
            <Button
              label="Ghi nhận khoản thu/chi"
              disabled={
                locked ||
                query.isError ||
                query.isFetching ||
                data.purposes.length === 0
              }
              onPress={() => review(Date.now())}
            />
          )}
        </View>
      </View>

      {confirm && (
        <ConfirmEdit
          title="Xác nhận khoản đã thu/chi?"
          message={`${PAYMENT_PURPOSE_LABELS[confirm.purpose]}: ${money(Number(confirm.amount))}. ${methods.find((row) => row.value === confirm.method)?.label} · ${confirmAccount?.label || ""}. Thực hiện lúc ${confirm.paid_at.replace("T", " ")}. Nội dung: ${confirm.note}.${confirm.items?.length ? ` Gia hạn ${confirm.items.length} xe: ${confirm.items.map((line) => { const item = data.renewalItems?.find((r) => r.id === line.item_id); return `${item?.license || line.item_id}: ${line.return_at.replace("T", " ")} · ${money(Number(line.amount))}`; }).join("; ")}.` : ""}${impact?.overpayment ? ` Số thu vượt còn thiếu: ${money(Number(confirm.amount) - (data.rentalRemaining ?? 0))}.` : ""}${impact && impact.totalIncrease > 0 ? ` Tổng hợp đồng tăng ${money(impact.totalIncrease)}, thành ${money(impact.totalAfter)}.` : impact?.overpayment ? " Hợp đồng đã đủ tiền; vẫn ghi thêm khoản thực nhận, không tăng tổng hợp đồng." : ""} Chỉ xác nhận khi tiền đã thực nhận hoặc thực chi đúng như trên.`}
          confirmLabel="Xác nhận đã thu/chi"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const input = confirm;
            setConfirm(null);
            setSavedPurpose(input.purpose);
            void action.submit(input);
          }}
        />
      )}
      {resolving && (
        <ConfirmEdit
          title="Đối chiếu yêu cầu thu/chi?"
          message="Nếu đã ghi, ứng dụng trả lại đúng phiếu đã lưu. Nếu chưa ghi, máy chủ khóa mã cũ để chặn yêu cầu đến muộn rồi cho phép rà soát lại nội dung. Không hủy phiếu hoặc khoản tiền đã ghi."
          confirmLabel="Đối chiếu với máy chủ"
          onCancel={() => setResolving(false)}
          onConfirm={() => {
            setResolving(false);
            void action.resolve();
          }}
        />
      )}
      {action.exit && (
        <ConfirmEdit
          title={action.busy ? "Đang ghi thu/chi" : "Rời bước thu/chi?"}
          busy={action.busy}
          message={
            action.busy
              ? "Chờ máy chủ xác nhận kết quả."
              : "Nội dung chưa gửi sẽ mất. Mã yêu cầu đã gửi được giữ trên thiết bị để đối chiếu sau khi mở lại."
          }
          confirmLabel="Rời bước thu/chi"
          onCancel={action.dismissExit}
          onConfirm={action.leave}
        />
      )}
    </SafeAreaView>
  );
}
