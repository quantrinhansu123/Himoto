import { useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/providers/session";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { dateTime, money, useTheme } from "@/theme";
import { Button, Card, KeyValueRow, SkeletonList, StateView, StatusBadge } from "@/components/ui";
import { DateField } from "@/components/date-field";
import { FormField } from "@/components/form-fields";

export default function ContractAnomaliesScreen() {
  const { api, session } = useSession();
  const theme = useTheme();
  const [date, setDate] = useState("");
  const [employee, setEmployee] = useState("");
  const [store, setStore] = useState("");
  const [contract, setContract] = useState("");
  const [page, setPage] = useState(1);

  const dEmployee = useDebouncedValue(employee.trim(), 250);
  const dStore = useDebouncedValue(store.trim(), 250);
  const dContract = useDebouncedValue(contract.trim(), 250);

  const allowed = Boolean(api && session?.user.permissions.includes("contracts.read"));
  const query = useQuery({
    queryKey: [
      "contract-anomalies",
      api?.origin,
      session?.user.id,
      date,
      dEmployee,
      dStore,
      dContract,
      page,
    ],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        date,
        employee: dEmployee,
        store: dStore,
        contract: dContract,
        page: String(page),
      });
      return api!.contractAnomalies(params, signal);
    },
    enabled: allowed,
    retry: false,
  });

  if (!allowed) {
    return (
      <StateView
        title="Không mở được Bất thường HĐ"
        message="Tài khoản cần quyền xem hợp đồng."
      />
    );
  }

  const rows = query.data?.rows ?? [];

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen options={{ title: "Bất thường HĐ" }} />
      <FlatList
        data={rows}
        keyExtractor={(row) => String(row.transaction_id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 36,
          gap: 12,
          maxWidth: 760,
          width: "100%",
          alignSelf: "center",
        }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={theme.primary}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Text style={{ color: theme.muted, fontSize: 13.5, lineHeight: 20 }}>
              Ghi nhận các khoản hoàn tiền thuê vượt mức đối chiếu để kế toán và quản trị kiểm tra.
            </Text>
            <Card style={{ gap: 10 }}>
              <DateField
                label="Ngày chi"
                value={date}
                onChange={(v) => {
                  setDate(v);
                  setPage(1);
                }}
              />
              <FormField
                label="Nhân viên"
                value={employee}
                maxLength={100}
                onChangeText={(v) => {
                  setEmployee(v);
                  setPage(1);
                }}
              />
              <FormField
                label="Cơ sở"
                value={store}
                maxLength={100}
                onChangeText={(v) => {
                  setStore(v);
                  setPage(1);
                }}
              />
              <FormField
                label="Hợp đồng"
                value={contract}
                maxLength={100}
                onChangeText={(v) => {
                  setContract(v);
                  setPage(1);
                }}
              />
              {(!!date || !!employee || !!store || !!contract) && (
                <Button
                  size="sm"
                  secondary
                  label="Xóa bộ lọc"
                  onPress={() => {
                    setDate("");
                    setEmployee("");
                    setStore("");
                    setContract("");
                    setPage(1);
                  }}
                />
              )}
            </Card>
            {query.isPending && <SkeletonList count={3} lines={3} />}
            {query.isError && (
              <StateView
                title="Chưa tải được bất thường hợp đồng"
                message={(query.error as Error).message}
                retry={() => void query.refetch()}
              />
            )}
          </View>
        }
        renderItem={({ item }) => {
          const amountNum = Number(item.amount || 0);
          const expectedNum = Number(item.expected_amount || 0);
          const excess = amountNum - expectedNum;
          const statusLabel =
            item.transaction_status === "cancelled"
              ? "Đã hủy"
              : item.transaction_status === null
                ? "Không còn trên sổ quỹ"
                : "Phiếu chi";
          return (
            <Card style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <Text style={{ color: theme.text, fontSize: 15.5, fontWeight: "800", flex: 1 }}>
                  {item.contract_code} · #{item.transaction_id}
                </Text>
                <StatusBadge
                  status={item.transaction_status === "cancelled" ? "cancelled" : "overdue"}
                  label={statusLabel}
                />
              </View>
              <View style={{ gap: 2 }}>
                <KeyValueRow label="Ngày chi" value={dateTime(item.occurred_at)} />
                <KeyValueRow label="Nhân viên" value={item.employee} />
                <KeyValueRow label="Cơ sở" value={item.store} />
                <KeyValueRow label="Đã hoàn" value={money(amountNum)} />
                <KeyValueRow label="Mức đối chiếu" value={money(expectedNum)} />
                <KeyValueRow label="Vượt mức" strong valueColor={theme.danger} value={money(excess)} />
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={
          !query.isPending && !query.isError ? (
            <StateView title="Chưa có bất thường trong bộ lọc này" />
          ) : undefined
        }
        ListFooterComponent={
          page > 1 || query.data?.hasMore ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <Button
                size="sm"
                equalWidth
                secondary
                label="Trang trước"
                disabled={page <= 1 || query.isFetching}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
              />
              <Text style={{ color: theme.muted, fontSize: 13 }}>Trang {page}</Text>
              <Button
                size="sm"
                equalWidth
                secondary
                label="Trang sau"
                disabled={!query.data?.hasMore || query.isFetching}
                onPress={() => setPage((p) => p + 1)}
              />
            </View>
          ) : undefined
        }
      />
    </SafeAreaView>
  );
}
