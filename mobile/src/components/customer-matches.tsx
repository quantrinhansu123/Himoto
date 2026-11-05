import { useEffect, useRef } from "react";
import { ScrollView, Text, View, type ScrollViewInstance } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { MobileCustomerMatch, MobileCustomerMatches } from "../../../shared/mobile-customer-matches";
import { useTheme } from "@/theme";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { Button, Card, InlineError, StatusBadge } from "./ui";

export function CustomerMatches({ matches, disabled, onView, onUse }: {
  matches: MobileCustomerMatches;
  disabled: boolean;
  onView: (row: MobileCustomerMatch) => void;
  onUse: (row: MobileCustomerMatch) => void;
}) {
  const theme = useTheme();
  return (
    <Card style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 19, fontWeight: "700" }}>Khách hàng đã tồn tại</Text>
      <Text style={{ color: theme.muted, fontSize: 14, lineHeight: 22 }}>Mở đúng hồ sơ để kiểm tra hoặc dùng khách đã có. Thông tin hợp đồng đang nhập được giữ lại.</Text>
      {matches.rows.map((row) => (
        <View key={row.customer.id} style={{ gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>{row.customer.details.name} · #{row.customer.id}</Text>
          <Text style={{ color: theme.muted, fontSize: 14, lineHeight: 21 }}>{row.customer.details.phone || row.customer.details.contact_detail || "Chưa có liên hệ"} · {row.customer.storeName || "Chưa gán cơ sở"}</Text>
          <Button secondary label={`Đi tới khách hàng #${row.customer.id}`} disabled={disabled} onPress={() => onView(row)} />
          <Button label={`Dùng khách hàng #${row.customer.id}`} disabled={disabled} onPress={() => onUse(row)} />
        </View>
      ))}
      {!matches.rows.length && <InlineError message="Chưa tìm thấy hồ sơ khớp. Giữ thông tin đang nhập và kiểm tra lại số giấy tờ hoặc điện thoại." />}
      {matches.hasMore && <InlineError message="Còn hồ sơ khớp chưa hiển thị. Kiểm tra kỹ thông tin định danh để chọn đúng khách." />}
    </Card>
  );
}

export function CustomerMatchDetails({ match, busy, error, onClose, onUse, onEdit }: {
  match: MobileCustomerMatch;
  busy: boolean;
  error: string;
  onClose: () => void;
  onUse?: () => void;
  onEdit?: () => void;
}) {
  const theme = useTheme();
  const row = match.customer, d = row.details;
  const scroll = useRef<ScrollViewInstance>(null);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (error) scroll.current?.scrollTo({ y: 0, animated: !reducedMotion });
  }, [error, reducedMotion]);
  const fields = [
    ["Cơ sở", row.storeName], ["Họ và tên", d.name], ["Điện thoại", d.phone], ["Email", d.email],
    ["Địa chỉ", d.address], ["Giấy tờ định danh", d.id_card], ["Ngày cấp giấy tờ", d.id_card_issued_on],
    ["Nơi cấp giấy tờ", d.id_card_issued_by], ["Giấy phép lái xe", d.driver_license_number],
    ["Ngày cấp GPLX", d.driver_license_issued_on], ["Ngày sinh", d.birthday],
    ["Loại khách", d.customer_type === "foreign" ? "Khách nước ngoài" : "Khách trong nước"],
    ["Quốc tịch", d.nationality], ["Kênh liên hệ", d.contact_channel], ["Thông tin liên hệ", d.contact_detail],
    ["Ghi chú / cảnh báo", d.warning_note],
  ];
  return (
    <SafeAreaView edges={["top", "left", "right", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, gap: 16, width: "100%", maxWidth: 760, alignSelf: "center" }}>
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 23, fontWeight: "700" }}>Khách hàng #{row.id}</Text>
        <StatusBadge status={row.status} />
        {!match.canEdit && <Text style={{ color: theme.muted, fontSize: 14, lineHeight: 22 }}>Hồ sơ thuộc cơ sở khác. Anh/chị có thể xem và dùng hồ sơ; quyền chỉnh sửa vẫn theo cơ sở được phân công.</Text>}
        {!!error && <InlineError message={error} />}
        <Card style={{ gap: 16 }}>
          {fields.filter(([, value]) => value).map(([label, value]) => (
            <View key={label} style={{ gap: 5 }}>
              <Text style={{ color: theme.muted, fontSize: 13 }}>{label}</Text>
              <Text style={{ color: theme.text, fontSize: 16, lineHeight: 24 }}>{value}</Text>
            </View>
          ))}
          {row.relatives.filter((relative) => relative.name || relative.phone).map((relative, index) => (
            <View key={index} style={{ gap: 5 }}>
              <Text style={{ color: theme.muted, fontSize: 13 }}>Người thân {index + 1}</Text>
              <Text style={{ color: theme.text, fontSize: 16, lineHeight: 24 }}>{[relative.name, relative.relationship, relative.phone].filter(Boolean).join(" · ")}</Text>
            </View>
          ))}
        </Card>
        {onEdit && match.canEdit && <Button secondary label="Sửa hồ sơ khách này" disabled={busy} onPress={onEdit} />}
      </ScrollView>
      <View style={{ padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.surface }}>
        {onUse && <Button label={`Dùng khách hàng #${row.id}`} loading={busy} onPress={onUse} />}
        <Button secondary label="Quay lại biểu mẫu" disabled={busy} onPress={onClose} />
      </View>
    </SafeAreaView>
  );
}
