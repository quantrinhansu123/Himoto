import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  Text,
  View,
} from "react-native";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ChevronRight, Check } from "lucide-react-native";
import type {
  MobileDraftCustomer,
  MobileDraftVehicle,
} from "@himoto/mobile-contract";
import { useSession } from "@/providers/session";
import { useTheme } from "@/theme";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { EditorSheet } from "./editor-sheet";
import { Button, InlineError, StateView, StatusBadge } from "./ui";
import { ChoiceField, FormField } from "./form-fields";

function PickRow({
  title,
  subtitle,
  label,
  onPress,
  selected = false,
  disabled = false,
}: {
  title: string;
  subtitle: string;
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        padding: 18,
        minHeight: 78,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: selected
          ? theme.tint
          : pressed
            ? theme.background
            : theme.surface,
      })}
    >
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>
          {title}
        </Text>
        <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 20 }}>
          {subtitle}
        </Text>
      </View>
      {selected ? (
        <Check size={21} color={theme.primary} accessible={false} />
      ) : (
        <ChevronRight size={21} color={theme.muted} accessible={false} />
      )}
    </Pressable>
  );
}
export function DraftCustomerPicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (row: MobileDraftCustomer) => void;
}) {
  const theme = useTheme(),
    { api, session } = useSession();
  const [mode, setMode] = useState<"branch" | "exact">("branch"),
    [search, setSearch] = useState(""),
    [submitted, setSubmitted] = useState(""),
    [error, setError] = useState(""),
    [picking, setPicking] = useState(false);
  const settled = useDebouncedValue(search),
    alive = useRef(true),
    controller = useRef<AbortController | null>(null),
    selecting = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  const query = useInfiniteQuery({
    queryKey: [
      "draft-customer-picker",
      session?.user.id,
      session?.user.storeId,
      settled,
    ],
    initialPageParam: 1,
    enabled: !!api && mode === "branch",
    gcTime: 0,
    queryFn: ({ pageParam, signal }) =>
      api!.catalogue(
        "customers",
        new URLSearchParams({
          page: String(pageParam),
          size: "20",
          search: settled,
        }).toString(),
        signal,
      ),
    getNextPageParam: (last) =>
      last.page < last.pages ? last.page + 1 : undefined,
  });
  const exact = useQuery({
    queryKey: ["draft-customer-exact", session?.user.id, submitted],
    enabled: !!api && mode === "exact" && !!submitted,
    gcTime: 0,
    queryFn: ({ signal }) => api!.draftCustomer({ query: submitted }, signal),
  });
  async function pick(id: number) {
    if (!api || selecting.current) return;
    selecting.current = true;
    setPicking(true);
    setError("");
    controller.current = new AbortController();
    try {
      const found = await api.draftCustomer({ id }, controller.current.signal);
      if (!alive.current) return;
      if (!found.rows[0])
        throw Error(
          "Hồ sơ không còn trong phạm vi truy cập. Tải lại danh sách.",
        );
      onPick(found.rows[0]);
    } catch (failure) {
      if (alive.current) setError((failure as Error).message);
    } finally {
      selecting.current = false;
      if (alive.current) setPicking(false);
    }
  }
  const rows = query.data?.pages.flatMap((page) => page.rows) || [];
  return (
    <EditorSheet title="Chọn khách hàng" onClose={onClose}>
      <View style={{ padding: 18, gap: 14 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button
              secondary={mode !== "branch"}
              label="Hồ sơ quản lý"
              onPress={() => {
                setMode("branch");
                setSearch("");
                setError("");
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              secondary={mode !== "exact"}
              label="Tra cứu chính xác"
              onPress={() => {
                setMode("exact");
                setSearch("");
                setSubmitted("");
                setError("");
              }}
            />
          </View>
        </View>
        <FormField
          label={
            mode === "branch"
              ? "Tìm khách trong phạm vi quản lý"
              : "Số điện thoại, giấy tờ hoặc liên hệ"
          }
          value={search}
          onChangeText={(value) => {
            setSearch(value);
            if (mode === "exact") setSubmitted("");
          }}
          maxLength={mode === "exact" ? 100 : 120}
          autoCapitalize="none"
          autoComplete="off"
          returnKeyType="search"
          onSubmitEditing={() => {
            Keyboard.dismiss();
            if (mode === "exact") setSubmitted(search.trim());
          }}
        />
        {mode === "exact" && (
          <>
            <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 20 }}>
              Nhập đầy đủ thông tin để tìm hồ sơ trên toàn công ty.
            </Text>
            <Button
              label="Tra cứu hồ sơ"
              disabled={!search.trim()}
              loading={exact.isFetching}
              onPress={() => {
                Keyboard.dismiss();
                setSubmitted(search.trim());
              }}
            />
          </>
        )}
        {!!error && <InlineError message={error} />}
        {picking && (
          <ActivityIndicator
            color={theme.primary}
            accessibilityLabel="Đang mở hồ sơ khách"
          />
        )}
        {mode === "branch" && query.isRefetchError && (
          <InlineError message={query.error.message} />
        )}
      </View>
      {mode === "branch" ? (
        query.isPending ? (
          <StateView title="Đang tải hồ sơ" loading />
        ) : query.isError && !query.data ? (
          <StateView
            title="Chưa tải được hồ sơ"
            message={query.error.message}
            retry={() => {
              void query.refetch();
            }}
          />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(row) => String(row.id)}
            keyboardShouldPersistTaps="handled"
            onEndReachedThreshold={0.4}
            onEndReached={() => {
              if (
                query.hasNextPage &&
                !query.isFetchingNextPage &&
                !query.isFetchNextPageError
              )
                void query.fetchNextPage();
            }}
            renderItem={({ item }) => (
              <PickRow
                title={item.name}
                subtitle={[
                  item.code,
                  item.phone || item.contactDetail,
                  item.storeName,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                label={`Chọn khách ${item.name}, ${item.code}`}
                disabled={picking}
                onPress={() => {
                  void pick(item.id);
                }}
              />
            )}
            ListEmptyComponent={
              <StateView
                title="Chưa tìm thấy hồ sơ"
                message="Đổi từ khóa hoặc dùng tra cứu chính xác."
              />
            }
            ListFooterComponent={
              query.isFetchNextPageError ? (
                <View style={{ padding: 18, gap: 12 }}>
                  <InlineError message={query.error.message} />
                  <Button
                    secondary
                    label="Tải tiếp lại"
                    onPress={() => {
                      void query.fetchNextPage();
                    }}
                  />
                </View>
              ) : query.isFetchingNextPage ? (
                <ActivityIndicator
                  style={{ padding: 20 }}
                  color={theme.primary}
                  accessibilityLabel="Đang tải thêm khách"
                />
              ) : undefined
            }
          />
        )
      ) : !submitted ? (
        <StateView
          title="Tra cứu hồ sơ công ty"
          message="Thông tin tra cứu cần khớp đầy đủ với hồ sơ khách."
        />
      ) : exact.isPending ? (
        <StateView title="Đang tra cứu" loading />
      ) : exact.isError ? (
        <StateView
          title="Chưa tra cứu được"
          message={exact.error.message}
          retry={() => {
            void exact.refetch();
          }}
        />
      ) : (
        <FlatList
          data={exact.data.rows}
          keyExtractor={(row) => String(row.id)}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <PickRow
              title={item.details.name}
              subtitle={[
                item.details.phone || item.details.contact_detail,
                item.storeName,
                item.details.id_card
                  ? `Giấy tờ …${item.details.id_card.slice(-4)}`
                  : "",
              ]
                .filter(Boolean)
                .join(" · ")}
              label={`Chọn hồ sơ ${item.details.name}`}
              onPress={() => onPick(item)}
            />
          )}
          ListEmptyComponent={
            <StateView
              title="Không có hồ sơ khớp"
              message="Kiểm tra thông tin hoặc tạo hồ sơ tại mục Khách hàng."
            />
          }
          ListFooterComponent={
            exact.data.hasMore ? (
              <Text style={{ padding: 18, color: theme.muted }}>
                Có thêm hồ sơ trùng thông tin. Dùng giấy tờ hoặc liên hệ khác để
                đối chiếu.
              </Text>
            ) : undefined
          }
        />
      )}
    </EditorSheet>
  );
}
export function DraftVehiclePicker({
  stores,
  initialStore,
  selectedIds,
  lifecycleId,
  onClose,
  onPick,
}: {
  stores: { id: number; name: string }[];
  initialStore: string;
  selectedIds: string[];
  lifecycleId?: string;
  onClose: () => void;
  onPick: (row: MobileDraftVehicle) => void;
}) {
  const theme = useTheme(),
    { api, session } = useSession();
  const [search, setSearch] = useState(""),
    [store, setStore] = useState(initialStore);
  const settled = useDebouncedValue(search);
  const query = useInfiniteQuery({
    queryKey: ["draft-vehicle-picker", session?.user.id, lifecycleId, store, settled],
    initialPageParam: 1,
    enabled: !!api,
    gcTime: 0,
    queryFn: ({ pageParam, signal }) =>
      (lifecycleId ? (query: string, signal?: AbortSignal) => api!.lifecycleInventory(lifecycleId, query, signal) : api!.draftInventory)(
        new URLSearchParams({
          page: String(pageParam),
          search: settled,
          ...(store ? { store } : {}),
        }).toString(),
        signal,
      ),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });
  const rows = query.data?.pages.flatMap((page) => page.rows) || [];
  return (
    <EditorSheet title="Chọn xe" onClose={onClose}>
      <View style={{ padding: 18, gap: 14 }}>
        <FormField
          label="Tìm tên xe hoặc biển số"
          value={search}
          onChangeText={setSearch}
          maxLength={120}
          autoComplete="off"
          returnKeyType="search"
          onSubmitEditing={() => Keyboard.dismiss()}
        />
        <ChoiceField
          label="Kho xe"
          value={store}
          onChange={setStore}
          searchable
          choices={[
            { value: "", label: "Tất cả kho" },
            ...stores.map((row) => ({
              value: String(row.id),
              label: row.name,
            })),
          ]}
        />
        <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 20 }}>
          {lifecycleId ? 'Chọn xe đang rảnh cho lượt thuê lại. Kho và lịch được kiểm tra lại khi xác nhận bàn giao.' : 'Chọn xe cho bản nháp. Kiểm tra lịch thuê sau khi chọn và nhập ngày giờ nhận/trả.'}
        </Text>
        {query.isRefetchError && <InlineError message={query.error.message} />}
      </View>
      {query.isPending ? (
        <StateView title="Đang tải kho xe" loading />
      ) : query.isError && !query.data ? (
        <StateView
          title="Chưa tải được kho xe"
          message={query.error.message}
          retry={() => {
            void query.refetch();
          }}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.vehicle.id}
          keyboardShouldPersistTaps="handled"
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (
              query.hasNextPage &&
              !query.isFetchingNextPage &&
              !query.isFetchNextPageError
            )
              void query.fetchNextPage();
          }}
          renderItem={({ item }) => (
            <View>
              <PickRow
                title={`${item.vehicle.license} · ${item.vehicle.name}`}
                subtitle={item.storeName}
                label={`Chọn xe ${item.vehicle.license}`}
                selected={selectedIds.includes(item.vehicle.id)}
                disabled={selectedIds.includes(item.vehicle.id) || !!lifecycleId && item.status !== 'ready'}
                onPress={() => onPick(item.vehicle)}
              />
              <View style={{ paddingHorizontal: 18, paddingBottom: 10 }}>
                <StatusBadge status={item.status} />
              </View>
            </View>
          )}
          ListEmptyComponent={
            <StateView
              title="Chưa tìm thấy xe"
              message="Đổi từ khóa hoặc chọn kho khác."
            />
          }
          ListFooterComponent={
            query.isFetchNextPageError ? (
              <View style={{ padding: 18, gap: 12 }}>
                <InlineError message={query.error.message} />
                <Button
                  secondary
                  label="Tải tiếp lại"
                  onPress={() => {
                    void query.fetchNextPage();
                  }}
                />
              </View>
            ) : query.isFetchingNextPage ? (
              <ActivityIndicator
                style={{ padding: 20 }}
                color={theme.primary}
                accessibilityLabel="Đang tải thêm xe"
              />
            ) : undefined
          }
        />
      )}
    </EditorSheet>
  );
}
