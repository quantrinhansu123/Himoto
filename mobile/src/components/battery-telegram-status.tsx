import { useEffect,useRef,useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Text } from "react-native";
import { useSession } from "@/providers/session";
import { useTheme } from "@/theme";
import { Button,Card,InlineError } from "./ui";
import { ConfirmEdit } from "./editor-sheet";
const labels:Record<string,string>={pending:'Chờ gửi',sending:'Đang gửi',sent:'Đã gửi',failed:'Gửi thất bại',unknown:'Chưa rõ kết quả',awaiting_config:'Chưa cấu hình nhóm / bot'};
export function BatteryTelegramStatus({
  id,
  requestKey,
  title,
}: {
  id: string;
  requestKey: string;
  title?: string;
}) {
  const { api, session } = useSession(),
    theme = useTheme(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const query = useQuery({
    queryKey: ["battery-telegram", session!.user.id, id, requestKey],
    queryFn: ({ signal }) => api!.batteryTelegram(id, requestKey, signal),
    retry: false,
  });
  async function send() {
    if (!api || busy) return;
    setBusy(true);
    setConfirm(false);
    setError("");
    try {
      await api.sendBatteryTelegram(id, requestKey);
      if (alive.current) void query.refetch();
    } catch (cause) {
      if (alive.current) setError((cause as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const heading =
    title ||
    (requestKey === "rental"
      ? "Telegram thuê pin / sạc"
      : "Telegram lượt trả pin");
  const actionLabel =
    requestKey === "rental"
      ? "thuê pin / sạc"
      : heading.toLowerCase().includes("gia hạn")
        ? "gia hạn pin"
        : "trả pin";

  return (
    <Card style={{ gap: 12 }}>
      <Text style={{ color: theme.text, fontSize: 20, fontWeight: "800" }}>
        {heading}
      </Text>
      {query.data && (
        <>
          <Text style={{ color: theme.muted }}>
            {query.data.destination_label} ·{" "}
            {query.data.status
              ? labels[query.data.status] || query.data.status
              : "Chưa tạo tin"}
          </Text>
          <Text selectable style={{ color: theme.text, lineHeight: 24 }}>
            {query.data.text}
          </Text>
          {query.data.can_send && (
            <Button
              label={`Rà soát gửi Telegram ${actionLabel}`}
              loading={busy}
              onPress={() => setConfirm(true)}
            />
          )}
          {["unknown", "sending"].includes(query.data.status || "") && (
            <Text style={{ color: theme.muted, lineHeight: 24 }}>
              Kiểm tra nhóm Telegram trước khi gửi tiếp. Giữ nguyên mã giao dịch
              và kết quả đã có.
            </Text>
          )}
        </>
      )}
      {(error || query.error?.message) && (
        <InlineError message={error || query.error!.message} />
      )}
      <Button
        secondary
        label={`Kiểm tra Telegram ${actionLabel}`}
        loading={query.isFetching}
        onPress={() => {
          void query.refetch();
        }}
      />
      {confirm && (
        <ConfirmEdit
          title={`Gửi Telegram ${actionLabel}?`}
          message={`Đích: ${query.data?.destination_label}\n\n${query.data?.text || ""}`}
          confirmLabel={`Xác nhận gửi Telegram ${actionLabel}`}
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            void send();
          }}
        />
      )}
    </Card>
  );
}
