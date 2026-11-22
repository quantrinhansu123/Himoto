import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, Search, X } from "lucide-react-native";
import type { CatalogueKind, MobileStore } from "@himoto/mobile-contract";
import { Button, InlineError } from "@/components/ui";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { catalogueStatuses, catalogueAllLabel, contextualStatusLabel } from "@/lib/catalogue-config";
import type { MobileContractScope } from '../../../shared/mobile-contract-workspaces';
import { statuses, useTheme } from "@/theme";
import { DateField } from "./date-field";
import { ChoiceField } from "./form-fields";

export interface CatalogueSelection {
  status: string;
  store: string;
  from?: string;
  to?: string;
  storeBasis?: string;
  rentalType?: string;
  ownershipTerm?: string;
  overdueBucket?: string;
  sort?: string;
  direction?: string;
  vehicleType?: string;
  warehouseStore?: string;
  beneficiaryStore?: string;
  missingContract?: string;
}
export function CatalogueFilters({
  kind,
  scope = '',
  selected,
  defaultStore,
  stores,
  allowAll,
  loading,
  error,
  retry,
  onApply,
  onClose,
}: {
  kind: CatalogueKind;
  scope?: MobileContractScope;
  selected: CatalogueSelection;
  defaultStore: string;
  stores: MobileStore[];
  allowAll: boolean;
  loading: boolean;
  error: boolean;
  retry: () => void;
  onApply: (selection: CatalogueSelection) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const [selection, setSelection] = useState(selected);
  const [search, setSearch] = useState("");
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase();
  const choices = [
    ...(allowAll ? [{ id: 0, name: "Toàn bộ cơ sở" }] : []),
    ...stores,
  ].filter((store) => normalize(store.name).includes(normalize(search.trim())));
  return (
    <Modal
      visible
      transparent
      animationType={reducedMotion ? "none" : "fade"}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={[styles.scrim, { backgroundColor: theme.scrim }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng bộ lọc"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <SafeAreaView
          edges={["bottom", "left", "right"]}
          accessibilityViewIsModal
          style={[styles.sheet, { backgroundColor: theme.surface }]}
        >
          <View style={[styles.heading, { borderColor: theme.border }]}>
            <Text
              accessibilityRole="header"
              style={{
                color: theme.text,
                fontSize: 22,
                fontWeight: "700",
                flex: 1,
              }}
            >
              Lọc danh sách
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng"
              onPress={onClose}
              style={styles.iconButton}
            >
              <X size={22} color={theme.text} />
            </Pressable>
          </View>
          <FlatList
            data={choices}
            keyExtractor={(item) => String(item.id)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 20, paddingTop: 4 }}
            ListHeaderComponent={
              <View style={{ gap: 16, marginBottom: 12 }}>
                {kind === "contracts" && <>
                  <DateField label="Thuê từ ngày" value={selection.from || ""} onChange={from => setSelection(current => ({ ...current, from }))} />
                  <DateField label="Thuê đến ngày" value={selection.to || ""} onChange={to => setSelection(current => ({ ...current, to }))} />
                  <ChoiceField label="Loại hợp đồng" value={selection.rentalType || ""} choices={[
                    { value: "", label: "Tất cả loại hợp đồng" },
                    { value: "daily", label: "Thuê theo ngày" },
                    { value: "monthly", label: "Thuê theo tháng" },
                    { value: "monthly_3", label: "Thuê 3 tháng" },
                    { value: "monthly_6", label: "Thuê 6 tháng" },
                    { value: "monthly_12", label: "Thuê 12 tháng" },
                    { value: "rental", label: "Thuê xe" },
                    { value: "tour", label: "Tour / phượt" },
                    { value: "ownership", label: "Thuê sở hữu" },
                    { value: "ownership_cd", label: "Thuê sở hữu( cd)" },
                  ]} onChange={rentalType => setSelection(current => ({ ...current, rentalType }))} />
                  {(scope === "ownership" || selection.rentalType === "ownership" || selection.rentalType === "ownership_cd" || !!selection.ownershipTerm) && (
                    <ChoiceField label="Thời hạn sở hữu" value={selection.ownershipTerm || ""} choices={[
                      { value: "", label: "Tất cả thời hạn sở hữu" },
                      { value: "6", label: "6 tháng" },
                      { value: "9", label: "9 tháng" },
                      { value: "12", label: "12 tháng" },
                      { value: "18", label: "18 tháng" },
                      { value: "24", label: "24 tháng" },
                      { value: "custom", label: "Chưa phân loại" },
                    ]} onChange={ownershipTerm => setSelection(current => ({ ...current, ownershipTerm }))} />
                  )}
                  <ChoiceField label="Lọc cơ sở theo" value={selection.storeBasis || "source"} choices={[{ value: "source", label: "Cơ sở ghi nhận hợp đồng" }, { value: "warehouse", label: "Kho xe" }]} onChange={storeBasis => setSelection(current => ({ ...current, storeBasis }))} />
                  {(scope === "overdue" || selection.status === "overdue" || !!selection.overdueBucket) && (
                    <ChoiceField label="Nhóm tuổi nợ quá hạn" value={selection.overdueBucket || ""} choices={[
                      { value: "", label: "Tất cả mức quá hạn" },
                      { value: "d1_3", label: "Quá hạn 1 – 3 ngày" },
                      { value: "d4_7", label: "Quá hạn 4 – 7 ngày" },
                      { value: "d8_15", label: "Quá hạn 8 – 15 ngày" },
                      { value: "d16_30", label: "Quá hạn 16 – 30 ngày" },
                      { value: "gt30", label: "Quá hạn trên 30 ngày" },
                    ]} onChange={overdueBucket => setSelection(current => ({ ...current, overdueBucket }))} />
                  )}
                  <ChoiceField label="Sắp xếp hợp đồng theo" value={selection.sort || ""} choices={[
                    { value: "", label: "Mặc định (Mã HĐ / Quá hạn)" },
                    { value: "code", label: "Mã hợp đồng" },
                    { value: "start_date", label: "Ngày bắt đầu thuê" },
                    { value: "end_date", label: "Ngày hẹn trả" },
                    { value: "total_amount", label: "Tổng giá trị hợp đồng" },
                    { value: "rental_debt_amount", label: "Tiền thuê còn thiếu" },
                    { value: "overdue_minutes", label: "Thời gian quá hạn" },
                    { value: "billing_next_due_at", label: "Kỳ đóng tiền tiếp theo" },
                  ]} onChange={sort => setSelection(current => ({ ...current, sort }))} />
                  <ChoiceField label="Thứ tự sắp xếp" value={selection.direction || ""} choices={[
                    { value: "", label: "Giảm dần (Mới / Lớn trước)" },
                    { value: "desc", label: "Giảm dần" },
                    { value: "asc", label: "Tăng dần" },
                  ]} onChange={direction => setSelection(current => ({ ...current, direction }))} />
                  {selection.from && selection.to && selection.from > selection.to ? <InlineError message="Ngày kết thúc phải từ ngày bắt đầu trở đi." /> : null}
                </>}
                {kind === "vehicles" && <>
                  <ChoiceField label="Loại xe" value={selection.vehicleType || ""} choices={[
                    { value: "", label: "Tất cả loại xe" },
                    { value: "xega", label: "Xe ga" },
                    { value: "xeso", label: "Xe số" },
                    { value: "xe_dien", label: "Xe điện" },
                    { value: "xecon", label: "Xe côn tay" },
                    { value: "xesh", label: "Xe SH" },
                  ]} onChange={vehicleType => setSelection(current => ({ ...current, vehicleType }))} />
                  <ChoiceField label="Đối chiếu hợp đồng xe" value={selection.missingContract || ""} choices={[
                    { value: "", label: "Tất cả xe trong kho" },
                    { value: "1", label: "Xe đang thuê nhưng thiếu hợp đồng mở" },
                  ]} onChange={missingContract => setSelection(current => ({ ...current, missingContract }))} />
                  {stores.length > 0 && <>
                    <ChoiceField label="Kho xe hiện tại" value={selection.warehouseStore || ""} choices={[
                      { value: "", label: "Tất cả kho xe" },
                      ...stores.map(s => ({ value: String(s.id), label: `Kho xe: ${s.name}` })),
                    ]} onChange={warehouseStore => setSelection(current => ({ ...current, warehouseStore }))} searchable />
                    <ChoiceField label="Nguồn khách (HĐ đang thuê)" value={selection.beneficiaryStore || ""} choices={[
                      { value: "", label: "Tất cả nguồn khách" },
                      ...stores.map(s => ({ value: String(s.id), label: `Nguồn khách: ${s.name}` })),
                    ]} onChange={beneficiaryStore => setSelection(current => ({ ...current, beneficiaryStore }))} searchable />
                  </>}
                </>}
                <Text style={[styles.label, { color: theme.text }]}>
                  Trạng thái
                </Text>
                <View style={styles.chips}>
                  {[...new Set([...catalogueStatuses(kind, scope, true), ...(selection.status ? [selection.status] : [])])].map((status) => (
                    <Pressable
                      key={status}
                      accessibilityRole="button"
                      accessibilityState={{
                        selected: selection.status === status,
                      }}
                      aria-selected={selection.status === status}
                      onPress={() =>
                        setSelection((value) => ({ ...value, status }))
                      }
                      style={({ pressed }) => [
                        styles.chip,
                        {
                          backgroundColor:
                            selection.status === status
                              ? theme.primary
                              : theme.background,
                          borderColor:
                            selection.status === status
                              ? theme.primary
                              : theme.controlBorder,
                          opacity: pressed ? 0.72 : 1,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color:
                            selection.status === status
                              ? theme.primaryText
                              : theme.text,
                          fontSize: 14,
                          fontWeight: "600",
                        }}
                      >
                        {status
                          ? contextualStatusLabel(kind, status) ||
                            statuses[status]
                          : catalogueAllLabel(kind, scope)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={[styles.label, { color: theme.text }]}>Cơ sở</Text>
                <View
                  style={[
                    styles.search,
                    {
                      borderColor: theme.controlBorder,
                      backgroundColor: theme.background,
                    },
                  ]}
                >
                  <Search size={18} color={theme.muted} accessible={false} />
                  <TextInput
                    accessibilityLabel="Tìm cơ sở"
                    placeholder="Tìm cơ sở"
                    placeholderTextColor={theme.muted}
                    value={search}
                    onChangeText={setSearch}
                    autoCorrect={false}
                    style={{
                      flex: 1,
                      color: theme.text,
                      minHeight: 48,
                      fontSize: 16,
                    }}
                  />
                </View>
                {error && (
                  <>
                    <InlineError message="Chưa tải được danh sách cơ sở." />
                    <Button label="Tải lại cơ sở" secondary onPress={retry} />
                  </>
                )}
              </View>
            }
            renderItem={({ item }) => {
              const value = item.id ? String(item.id) : "all";
              const active = value === selection.store;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  aria-selected={active}
                  accessibilityLabel={item.name}
                  onPress={() =>
                    setSelection((current) => ({ ...current, store: value }))
                  }
                  style={({ pressed }) => [
                    styles.store,
                    {
                      backgroundColor: active
                        ? theme.tint
                        : pressed
                          ? theme.background
                          : theme.surface,
                      borderColor: active ? theme.primary : theme.controlBorder,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: theme.text,
                      flex: 1,
                      fontSize: 16,
                      lineHeight: 24,
                    }}
                  >
                    {item.name}
                  </Text>
                  {active && (
                    <Check size={21} color={theme.primary} accessible={false} />
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              loading ? (
                <ActivityIndicator
                  color={theme.primary}
                  style={{ padding: 24 }}
                />
              ) : (
                <Text
                  style={{
                    color: theme.muted,
                    fontSize: 15,
                    paddingVertical: 16,
                  }}
                >
                  Không có cơ sở phù hợp.
                </Text>
              )
            }
          />
          {selection.from && selection.to && selection.from > selection.to ? (
            <Text style={{ color: theme.danger, fontSize: 13, paddingHorizontal: 16, paddingTop: 10 }}>
              Chưa thể áp dụng: Ngày kết thúc phải từ ngày bắt đầu trở đi.
            </Text>
          ) : null}
          <View style={[styles.actions, { borderColor: theme.border }]}>
            <Button
              equalWidth
              label="Đặt lại"
              secondary
              onPress={() =>
                setSelection({ status: "", store: defaultStore })
              }
            />
            <Button equalWidth label="Áp dụng" disabled={!!(selection.from && selection.to && selection.from > selection.to)} onPress={() => onApply(selection)} />
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    width: "100%",
    maxWidth: 760,
    maxHeight: "88%",
    alignSelf: "center",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  heading: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: 15, fontWeight: "700", marginTop: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 12,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  store: {
    minHeight: 56,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  actions: { borderTopWidth: 1, padding: 16, gap: 12, flexDirection: "row" },
});
