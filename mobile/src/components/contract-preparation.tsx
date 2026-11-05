import { useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type {
  MobileContractIssueInput,
  MobileInitialCollection,
} from "@himoto/mobile-contract";
import { validDraftTime } from "@himoto/mobile-draft-validation";
import { useSession } from "@/providers/session";
import { useContractAction } from "@/hooks/use-contract-action";
import { useTheme, money, dateTime } from "@/theme";
import { Button, Card, InlineError, StateView } from "./ui";
import { ChoiceField, FormField } from "./form-fields";
import { RentalDateTime } from "./rental-date-time";
import { ConfirmEdit } from "./editor-sheet";
type CollectionRow = {
  key: number;
  purpose: "deposit" | "rental";
  amount: string;
  method: MobileInitialCollection["method"];
  account: string;
  paidAt: string;
};
const now = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16);
const validAmount = (v: string) =>
  /^[1-9]\d{0,12}$/.test(v) && Number.isSafeInteger(Number(v));
export function ContractPreparation({ id }: { id: string }) {
  const { session } = useSession();
  if (
    !/^[1-9]\d{0,14}$/.test(id) ||
    !session?.user.permissions.includes("contracts.finalize") ||
    !session.user.permissions.includes("contracts.read")
  )
    return (
      <StateView
        title="Không mở được bước xác nhận"
        message="Kiểm tra liên kết và quyền phát hành hợp đồng."
      />
    );
  return (
    <PreparationForm
      key={`${session.user.id}:${session.user.storeId}:${session.user.allStores}:${id}`}
      id={id}
    />
  );
}
function PreparationForm({ id }: { id: string }) {
  const theme = useTheme(),
    { api, session } = useSession();
  const [mode, setMode] = useState<"rental" | "reservation" | null>(null),
    [rows, setRows] = useState<CollectionRow[]>([]),
    [ack, setAck] = useState(false),
    [localError, setLocalError] = useState("");
  const [confirm, setConfirm] = useState<
      MobileContractIssueInput | { revision: string } | null
    >(null),
    [reload, setReload] = useState(false);
  const serial = useRef(0),
    list = useRef<FlatList<CollectionRow>>(null);
  const dirty = rows.length > 0 || mode !== null || ack;
  const action = useContractAction(id, dirty);
  const query = useQuery({
    queryKey: [
      "contract-preparation",
      session?.user.id,
      session?.user.storeId,
      session?.user.allStores,
      id,
    ],
    queryFn: ({ signal }) => api!.contractPreparation(id, signal),
    enabled: !!api,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const data = query.data,
    reserving =
      !data?.historical &&
      (mode ?? (data?.reservation ? "reservation" : "rental")) ===
        "reservation",
    handover = data?.status === "deposit_contract";
  const active = data?.status === "draft" || handover,
    disabled =
      action.busy || action.checking || !!action.receipt || query.isFetching;
  const issues = data
    ? reserving
      ? data.issues.reservation
      : data.issues.rental
    : {};
  const rentalCollected = rows
      .filter((row) => row.purpose === "rental" && validAmount(row.amount))
      .reduce((sum, row) => sum + Number(row.amount), 0),
    depositCollected = rows
      .filter((row) => row.purpose === "deposit" && validAmount(row.amount))
      .reduce((sum, row) => sum + Number(row.amount), 0);
  const label = handover
    ? "Xác nhận giao xe"
    : reserving
      ? "Nhận cọc giữ xe"
      : data?.historical
        ? "Phát hành hợp đồng đã trả"
        : "Phát hành và giao xe";
  function update(key: number, patch: Partial<CollectionRow>) {
    setRows((old) =>
      old.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
    setLocalError("");
  }
  function review() {
    Keyboard.dismiss();
    setLocalError("");
    if (!data || disabled || !action.checked) return;
    if (handover) {
      setConfirm({ revision: data.revision });
      return;
    }
    if (Object.keys(issues).length) {
      list.current?.scrollToOffset({ offset: 0 });
      return;
    }
    try {
      const receipts = rows.map((row, index): MobileInitialCollection => {
        const account = data.accounts.find(
          (account) =>
            `${account.method}:${account.id}` === row.account &&
            account.method === row.method,
        );
        if (!validAmount(row.amount))
          throw Error(
            `Khoản ${index + 1}: nhập số tiền nguyên dương bằng VND.`,
          );
        if (!account)
          throw Error(
            `Khoản ${index + 1}: chọn đúng tài khoản đã thực nhận tiền.`,
          );
        if (
          !validDraftTime(row.paidAt) ||
          Date.parse(`${row.paidAt}:00+07:00`) > Date.now() + 5 * 60000
        )
          throw Error(`Khoản ${index + 1}: kiểm tra thời điểm thực nhận tiền.`);
        return {
          purpose: row.purpose,
          amount: row.amount,
          method: row.method,
          account_id: account.id,
          paid_at: row.paidAt,
        };
      });
      if (
        reserving &&
        (!receipts.length || receipts.some((row) => row.purpose !== "rental"))
      )
        throw Error(
          "Tiền giữ xe là khoản trả trước tiền thuê. Nhập ít nhất một khoản tiền thuê thực nhận.",
        );
      if (
        data.totalAmount === null ||
        data.rentalPaid === null ||
        data.depositAmount === null
      )
        throw Error("Cần đối chiếu giá trị hợp đồng trước khi phát hành.");
      if (
        rentalCollected > Math.max(data.totalAmount - data.rentalPaid, 0) ||
        depositCollected > Math.max(data.depositAmount - data.depositPaid, 0)
      )
        throw Error(
          "Số tiền nhập vượt số còn phải thu. Kiểm tra các khoản thực nhận.",
        );
      if (action.code === "reservation_overlap" && !ack)
        throw Error("Xác nhận đã kiểm tra chồng lịch cọc trước khi tiếp tục.");
      setConfirm({
        revision: data.revision,
        receipts,
        ...(reserving ? { reservation: true as const } : {}),
        ...(ack ? { acknowledge_reservation_overlap: true as const } : {}),
      });
    } catch (cause) {
      setLocalError((cause as Error).message);
      list.current?.scrollToOffset({ offset: 0 });
    }
  }
  function editDraft() {
    router.replace({ pathname: "/draft/[id]", params: { id } });
  }
  function refresh(){void query.refetch().then(()=>action.checkPrevious());}
  const heading = (title: string) => (
    <Text
      accessibilityRole="header"
      style={{ color: theme.text, fontSize: 20, fontWeight: "700" }}
    >
      {title}
    </Text>
  );
  const text = (value: string) => (
    <Text style={{ color: theme.muted, fontSize: 14, lineHeight: 22 }}>
      {value}
    </Text>
  );
  if (action.receipt)
    return (
      <SafeAreaView
        edges={["left", "right", "bottom"]}
        style={{
          flex: 1,
          padding: 22,
          gap: 18,
          backgroundColor: theme.background,
        }}
      >
        <Stack.Screen options={{ title: "Kết quả xác nhận" }} />
        {heading("Lần xác nhận trước đã thành công")}
        {text(
          "Mở hợp đồng để xem trạng thái và các khoản đã ghi nhận. Không gửi lại để tạo thêm phiếu thu.",
        )}
        <Button
          label="Xem hợp đồng đã xác nhận"
          loading={action.checking}
          onPress={() => {
            void action.openReceipt();
          }}
        />
      </SafeAreaView>
    );
  if (!data)
    return (
      <SafeAreaView
        edges={["left", "right", "bottom"]}
        style={{ flex: 1, backgroundColor: theme.background }}
      >
        <StateView
          title={
            query.isPending
              ? "Đang kiểm tra hợp đồng"
              : "Chưa mở được bước xác nhận"
          }
          loading={query.isPending}
          message={action.error || query.error?.message}
          retry={() => {
            refresh();
          }}
        />
        {query.isError && (
          <View style={{ padding: 18 }}>
            <Button
              secondary
              label="Kiểm tra lần xác nhận trước"
              loading={action.checking}
              onPress={() => {
                void action.checkPrevious();
              }}
            />
          </View>
        )}
      </SafeAreaView>
    );
  return (
    <SafeAreaView
      edges={["left", "right", "bottom"]}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <Stack.Screen
        options={{ title: handover ? "Giao xe giữ chỗ" : "Rà soát phát hành" }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <FlatList
          ref={list}
          data={!handover && active ? rows : []}
          keyExtractor={(row) => String(row.key)}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          contentContainerStyle={{
            maxWidth: 760,
            width: "100%",
            alignSelf: "center",
            padding: 18,
            gap: 16,
            paddingBottom: 28,
          }}
          ListHeaderComponent={
            <View style={{ gap: 16 }}>
              {heading(data.code)}
              {text(`Cơ sở ghi nhận: ${data.storeName || `#${data.storeId}`}`)}
              <Card style={{ gap: 12 }}>
                {heading(data.customerName || "Chưa gắn khách hàng")}
                {data.vehicles.map((row) => (
                  <Text
                    key={row.id}
                    style={{ color: theme.text, fontSize: 16, lineHeight: 24 }}
                  >
                    {row.label}
                  </Text>
                ))}
                {text(`${dateTime(data.startsAt)} → ${dateTime(data.endsAt)}`)}
                {text(
                  `Tiền thuê: ${money(data.totalAmount)} · Đã thu: ${money(data.rentalPaid)}`,
                )}
                {!reserving &&
                  text(
                    `Cọc thế chấp: ${money(data.depositAmount)} · Đã thu: ${money(data.depositPaid)}`,
                  )}
              </Card>
              {query.isError && (
                <InlineError message="Chưa cập nhật được hồ sơ. Tải lại trước khi xác nhận." />
              )}
              {!active && (
                <Card style={{ gap: 14 }}>
                  {heading("Hợp đồng đã chuyển trạng thái")}
                  {text("Mở hồ sơ để xem thông tin hiện tại.")}
                  <Button
                    label="Mở hồ sơ hợp đồng"
                    onPress={() =>
                      router.dismissTo({
                        pathname: "/record/[kind]/[id]",
                        params: { kind: "contracts", id },
                      })
                    }
                  />
                </Card>
              )}
              {!data.canFinalize && (
                <InlineError message="Hợp đồng thuê sở hữu cần quản lý có quyền duyệt và phát hành." />
              )}
              {active && !handover && (
                <ChoiceField
                  label="Cách phát hành"
                  value={reserving ? "reservation" : "rental"}
                  disabled={disabled || data.historical}
                  choices={[
                    {
                      value: "rental",
                      label: data.historical
                        ? "Hợp đồng đã trả xe"
                        : "Giao xe ngay",
                    },
                    { value: "reservation", label: "Nhận cọc giữ xe" },
                  ]}
                  onChange={(value) => {
                    setMode(value as "rental" | "reservation");
                    setAck(false);
                    setLocalError("");
                    action.clearError();
                  }}
                />
              )}
              {active && !handover && Object.keys(issues).length > 0 && (
                <Card style={{ gap: 12 }}>
                  {heading("Cần bổ sung bản nháp")}
                  {Object.values(issues).map((message, index) => (
                    <InlineError key={index} message={message} />
                  ))}
                  {session?.user.permissions.includes("contracts.draft") && (
                    <Button
                      secondary
                      label="Bổ sung bản nháp"
                      onPress={editDraft}
                    />
                  )}
                </Card>
              )}
              {active &&
                text(
                  handover
                    ? "Giao xe chuyển đơn giữ chỗ sang đang thuê. Khoản tiền giữ xe đã thu sẽ được giữ nguyên."
                    : reserving
                      ? "Tiền giữ xe được trừ vào tiền thuê, không ghi thành cọc thế chấp. Chỉ nhập khoản đã thực nhận."
                      : "Chỉ nhập khoản đã thực nhận. Khi không nhập khoản thu, phần chưa thu tiếp tục là công nợ. Hệ thống kiểm tra lại lịch và tình trạng xe khi xác nhận.",
                )}
              {active && text("Ngày giờ nhận tiền sử dụng giờ Việt Nam.")}
              {!!localError && <InlineError message={localError} />}
              {!!action.error && (
                <View style={{ gap: 12 }}>
                  <InlineError message={action.error} />
                  {Object.values(action.fields).map((message, index) => (
                    <InlineError key={index} message={message} />
                  ))}
                  <Button
                    secondary
                    label="Kiểm tra lần xác nhận trước"
                    loading={action.checking}
                    onPress={() => {
                      void action.checkPrevious();
                    }}
                  />
                </View>
              )}
              {action.code === "reservation_overlap" && (
                <ChoiceField
                  label="Đã kiểm tra và chấp nhận chồng lịch cọc"
                  value={ack ? "yes" : "no"}
                  choices={[
                    { value: "no", label: "Chưa đồng ý" },
                    { value: "yes", label: "Đã kiểm tra và đồng ý" },
                  ]}
                  onChange={(value) => setAck(value === "yes")}
                  disabled={disabled}
                />
              )}
              {active && (
                <Button
                  secondary
                  label="Tải lại thông tin hợp đồng"
                  disabled={disabled}
                  onPress={() => {
                    if (dirty) setReload(true);
                    else refresh();
                  }}
                />
              )}
              {active &&
                !handover &&
                heading(`Các khoản thực nhận (${rows.length})`)}
            </View>
          }
          renderItem={({ item, index }) => (
            <Card style={{ gap: 14 }}>
              {heading(`Khoản ${index + 1}`)}
              <ChoiceField
                label={`Loại tiền khoản ${index + 1}`}
                value={item.purpose}
                choices={[
                  {
                    value: "rental",
                    label: reserving
                      ? "Tiền giữ xe (trừ tiền thuê)"
                      : "Tiền thuê / phí",
                  },
                  { value: "deposit", label: "Cọc thế chấp" },
                ]}
                disabled={disabled}
                onChange={(value) =>
                  update(item.key, {
                    purpose: value as CollectionRow["purpose"],
                  })
                }
              />
              <FormField
                label={`Số tiền khoản ${index + 1} (VND)`}
                value={item.amount}
                onChangeText={(value) => update(item.key, { amount: value })}
                keyboardType="number-pad"
                editable={!disabled}
                maxLength={13}
              />
              <ChoiceField
                label={`Hình thức khoản ${index + 1}`}
                value={item.method}
                choices={[
                  { value: "transfer", label: "CK tài khoản cá nhân" },
                  { value: "company_transfer", label: "CK tài khoản công ty" },
                  { value: "cash", label: "Tiền mặt" },
                ]}
                disabled={disabled}
                onChange={(value) =>
                  update(item.key, {
                    method: value as CollectionRow["method"],
                    account: "",
                  })
                }
              />
              <ChoiceField
                label={`Tài khoản nhận khoản ${index + 1}`}
                value={item.account}
                choices={data.accounts
                  .filter((account) => account.method === item.method)
                  .map((account) => ({
                    value: `${account.method}:${account.id}`,
                    label: account.label,
                  }))}
                disabled={disabled}
                searchable
                onChange={(value) => update(item.key, { account: value })}
              />
              <RentalDateTime
                label={`nhận tiền khoản ${index + 1}`}
                value={item.paidAt}
                onChange={(value) => update(item.key, { paidAt: value })}
                disabled={disabled}
              />
              <Button
                secondary
                label={`Bỏ khoản thu ${index + 1}`}
                disabled={disabled}
                onPress={() =>
                  setRows((old) => old.filter((row) => row.key !== item.key))
                }
              />
            </Card>
          )}
          ListFooterComponent={
            active && !handover ? (
              <View style={{ gap: 14 }}>
                <Button
                  secondary
                  label="Thêm khoản thực nhận"
                  disabled={disabled || rows.length >= 100}
                  onPress={() => {
                    const key = ++serial.current;
                    setRows((old) => [
                      ...old,
                      {
                        key,
                        purpose: "rental",
                        amount: "",
                        method: "transfer",
                        account: "",
                        paidAt: now(),
                      },
                    ]);
                  }}
                />
                {text(
                  `Đang nhập: thuê/giữ xe ${money(rentalCollected)} · cọc ${money(depositCollected)}.`,
                )}
              </View>
            ) : undefined
          }
        />
        {active && (
          <View
            style={{
              padding: 16,
              borderTopWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.surface,
            }}
          >
            <View style={{ maxWidth: 724, width: "100%", alignSelf: "center" }}>
              <Button
                label={label}
                loading={action.busy}
                disabled={
                  disabled ||
                  query.isError ||
                  !data.canFinalize ||
                  !action.checked ||
                  (!handover && Object.keys(issues).length > 0)
                }
                onPress={review}
              />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
      {confirm && (
        <ConfirmEdit
          title={`${label}?`}
          message={
            handover
              ? "Xác nhận đã bàn giao xe cho khách. Không thu lại khoản giữ xe đã ghi nhận."
              : `${data.customerName || "Khách hàng"} · ${data.vehicles.length} xe. Ghi nhận tiền thuê/giữ xe ${money(rentalCollected)} và cọc ${money(depositCollected)}. Còn phải thu tiền thuê ${money(Math.max((data.totalAmount ?? 0) - (data.rentalPaid ?? 0) - rentalCollected, 0))}${reserving ? "" : `, cọc ${money(Math.max((data.depositAmount ?? 0) - data.depositPaid - depositCollected, 0))}`}. Chỉ xác nhận khi đúng hồ sơ và số tiền thực nhận.`
          }
          confirmLabel={label}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const body = confirm;
            setConfirm(null);
            void action.submit(handover ? "handover" : "finalize", body);
          }}
        />
      )}
      {reload && (
        <ConfirmEdit
          title="Tải lại thông tin?"
          message="Các khoản đang nhập sẽ được xóa để đối chiếu lại hồ sơ mới. Thao tác này không tạo hay hủy phiếu thu đã lưu."
          confirmLabel="Tải lại hợp đồng"
          onCancel={() => setReload(false)}
          onConfirm={() => {
            setReload(false);
            setRows([]);
            setMode(null);
            setAck(false);
            setLocalError("");
            action.clearError();
            refresh();
          }}
        />
      )}
      {action.exit && (
        <ConfirmEdit
          title={action.busy ? "Đang xác nhận" : "Rời bước xác nhận?"}
          message={
            action.busy
              ? "Chờ máy chủ xác nhận kết quả."
              : "Các khoản chưa gửi sẽ mất. Mã thao tác đã gửi được giữ trên thiết bị để kiểm tra kết quả khi mở lại."
          }
          busy={action.busy}
          onCancel={action.dismissExit}
          onConfirm={action.leave}
          confirmLabel="Rời bước xác nhận"
        />
      )}
    </SafeAreaView>
  );
}
