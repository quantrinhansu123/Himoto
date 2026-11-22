import { useState } from "react";
import { Text, View } from "react-native";
import type { MobileFinanceContext } from "../../../shared/mobile-finance";
import { addRentalDuration } from "../../../shared/rental-time";
import { suggestedPaymentRenewal } from "@/lib/payment-renewal-form";
import { dateTime, money, useTheme } from "@/theme";
import {
  Card,
  InfoBanner,
  KeyValueRow,
  PaginationBar,
  StatusBadge,
} from "./ui";
import { ChoiceField, FormField } from "./form-fields";

export function PaymentRenewalFields({
  data,
  days,
  picks,
  disabled,
  onDays,
  onPicks,
}: {
  data: MobileFinanceContext;
  days: string;
  picks: Record<string, string>;
  disabled: boolean;
  onDays: (value: string) => void;
  onPicks: (value: Record<string, string>) => void;
}) {
  const theme = useTheme();
  const [page, setPage] = useState(1);
  const items = data.renewalItems || [];
  const pages = Math.max(1, Math.ceil(items.length / 25));
  const current = Math.min(page, pages);
  const rows = items.slice((current - 1) * 25, current * 25);
  const selected = Object.keys(picks).length;
  const total = Object.values(picks).reduce(
    (s, v) => s + (/^[0-9]+$/.test(v) ? Number(v) : 0),
    0,
  );

  function changeDays(value: string) {
    onDays(value);
    onPicks(
      Object.fromEntries(
        Object.entries(picks).map(([key, amount]) => {
          const item = items.find((r) => String(r.id) === key);
          const suggestion = suggestedPaymentRenewal(
            item?.dailyPrice ?? null,
            value,
          );
          return [key, suggestion || amount];
        }),
      ),
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <InfoBanner
        tone="info"
        title="Xe cần gia hạn"
        message="Mỗi xe cộng từ hẹn trả hiện tại của chính xe đó. Phiếu thu ghi đúng thời điểm thực nhận tiền. Chọn tối đa 50 xe mỗi phiếu."
      />
      <FormField
        label="Số ngày gia hạn trong phiếu thu"
        value={days}
        onChangeText={changeDays}
        keyboardType="number-pad"
        maxLength={3}
        editable={!disabled}
      />
      <Card style={{ gap: 4, padding: 12 }}>
        <KeyValueRow label="Số xe đã chọn" value={`${selected} xe`} strong />
        <KeyValueRow
          label="Tổng tiền gia hạn"
          value={money(total)}
          valueColor={theme.primary}
          strong
        />
      </Card>
      {rows.map((item) => {
        const key = String(item.id);
        const checked = key in picks;
        const suggested = suggestedPaymentRenewal(item.dailyPrice, days);
        const validDays =
          /^[0-9]+$/.test(days) && Number(days) >= 1 && Number(days) <= 365;
        const next =
          item.returnAt && validDays
            ? addRentalDuration(item.returnAt, Number(days), "day")
            : "";
        return (
          <Card key={key} style={{ gap: 10, padding: 13 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Text
                style={{
                  color: theme.text,
                  fontSize: 15.5,
                  fontWeight: "700",
                  flex: 1,
                }}
              >
                {item.license || item.name}
              </Text>
              <StatusBadge
                status={checked ? "confirmed" : "pending"}
                label={checked ? "Đã chọn" : "Chưa chọn"}
              />
            </View>
            <View style={{ gap: 2 }}>
              <KeyValueRow label="Dòng xe" value={item.name} />
              <KeyValueRow
                label="Hẹn trả hiện tại"
                value={item.returnAt ? dateTime(item.returnAt) : "Chưa có"}
              />
              {checked && !!next && (
                <KeyValueRow
                  label="Hẹn trả mới"
                  value={dateTime(next)}
                  valueColor={theme.primary}
                  strong
                />
              )}
            </View>
            <ChoiceField
              label={`Chọn gia hạn ${item.license || key}`}
              value={checked ? "yes" : "no"}
              choices={[
                { value: "no", label: "Không gia hạn" },
                { value: "yes", label: "Gia hạn & thu tiền" },
              ]}
              disabled={disabled || (!checked && selected >= 50)}
              onChange={(value) => {
                const nextPicks = { ...picks };
                if (value === "yes") nextPicks[key] = suggested;
                else delete nextPicks[key];
                onPicks(nextPicks);
              }}
            />
            {checked && (
              <FormField
                label={`Tiền gia hạn ${item.license || key} (VND)`}
                value={picks[key]}
                editable={!disabled}
                keyboardType="number-pad"
                maxLength={13}
                hint={
                  /^[1-9]\d{0,12}$/.test(picks[key])
                    ? `Số tiền: ${money(Number(picks[key]))}${suggested ? ` · Gợi ý ${money(Number(suggested))} cho ${days} ngày` : ""}`
                    : suggested
                      ? `Gợi ý ${money(Number(suggested))} cho ${days} ngày.`
                      : "Chưa có đơn giá; nhập đúng thỏa thuận."
                }
                onChangeText={(value) => onPicks({ ...picks, [key]: value })}
              />
            )}
            {checked &&
              suggested &&
              /^[0-9]+$/.test(picks[key]) &&
              Number(picks[key]) < Number(suggested) && (
                <InfoBanner
                  tone="warning"
                  message={`Phí thấp hơn gợi ý ${money(Number(suggested))}; rà soát thỏa thuận trước khi thu.`}
                />
              )}
          </Card>
        );
      })}
      {pages > 1 && (
        <PaginationBar
          page={current}
          pages={pages}
          total={items.length}
          unit="xe"
          disabled={disabled}
          onChange={setPage}
        />
      )}
    </View>
  );
}
