import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Building2,
  FilePenLine,
  FileText,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  ShieldAlert,
} from "lucide-react-native";
import type { CatalogueKind, MobileRecord } from "@himoto/mobile-contract";
import {
  Button,
  Card,
  InlineError,
  StateView,
  StatusBadge,
} from "@/components/ui";
import { useSession } from "@/providers/session";
import { useTheme } from "@/theme";
import { contextualStatusLabel } from "@/lib/catalogue-config";
import { recordPreviewKey } from "@/lib/record-preview";
import { ContractDetailView } from "@/components/contract-detail-view";

export default function RecordDetail() {
  const params = useLocalSearchParams<{ kind: string; id: string }>();
  const { api, session } = useSession();
  const cache = useQueryClient();
  const theme = useTheme();
  const [actionError, setActionError] = useState("");

  const valid =
    ["vehicles", "contracts", "customers"].includes(params.kind) &&
    /^[1-9]\d{0,14}$/.test(params.id);
  const allowed =
    valid && session?.user.permissions.includes(`${params.kind}.read`);

  const query = useQuery<MobileRecord>({
    queryKey: ["record", session?.user.id, params.kind, params.id],
    queryFn: ({ signal }) =>
      api!.record(params.kind as CatalogueKind, params.id, signal),
    placeholderData: () =>
      api && session
        ? cache.getQueryData<MobileRecord>(
            recordPreviewKey(
              api.origin,
              session.user,
              params.kind as CatalogueKind,
              params.id,
            ),
          )
        : undefined,
    staleTime: 30_000,
    refetchOnMount: "always",
    gcTime: 300_000,
    enabled: !!api && !!allowed,
  });

  if (!allowed) {
    return (
      <StateView
        title="Không mở được hồ sơ"
        message="Kiểm tra liên kết và quyền truy cập của tài khoản."
      />
    );
  }

  if (query.isPending && !query.data) return <StateView title="Đang tải hồ sơ" loading />;
  if (query.isError && !query.data) {
    return (
      <StateView
        title="Chưa tải được hồ sơ"
        message={query.error.message}
        retry={() => {
          void query.refetch();
        }}
      />
    );
  }

  const row = query.data!;

  // If this is a contract, render the dedicated Web-mirroring ContractDetailView
  if (params.kind === "contracts") {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <Stack.Screen options={{ title: `HĐ ${row.code}` }} />
        <ContractDetailView
          record={row}
          isRefetching={query.isRefetching}
          onRefresh={() => {
            void query.refetch();
          }}
        />
      </View>
    );
  }

  // If this is a vehicle opened via generic record link, redirect or render full vehicle view
  if (params.kind === "vehicles") {
    router.replace({ pathname: "/vehicle/[id]", params: { id: params.id } });
    return <StateView title="Đang chuyển sang hồ sơ xe..." loading />;
  }

  // Customer Profile View (Chuẩn Web)
  const phone = (row.phone || "").replace(/[\s().-]/g, "");
  const canCall = /^\+?[0-9]{8,15}$/.test(phone);

  async function callCustomer() {
    if (!canCall) return;
    setActionError("");
    try {
      await Linking.openURL(`tel:${phone}`);
    } catch {
      setActionError("Thiết bị chưa mở được cuộc gọi.");
    }
  }

  return (
    <ScrollView
      contentContainerStyle={{
        padding: 20,
        gap: 16,
        width: "100%",
        maxWidth: 760,
        alignSelf: "center",
      }}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => {
            void query.refetch();
          }}
          tintColor={theme.primary}
        />
      }
    >
      <Stack.Screen options={{ title: row.name || "Khách hàng" }} />

      {/* Header Profile Card */}
      <Card style={{ gap: 12, padding: 18 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: theme.primary, fontSize: 13, fontWeight: "700" }}>
              {row.code || `KH #${row.id}`}
            </Text>
            <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 26, fontWeight: "800" }}>
              {row.name}
            </Text>
          </View>
          <StatusBadge
            status={row.status}
            label={contextualStatusLabel("customers", row.status)}
          />
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Building2 size={16} color={theme.muted} />
          <Text style={{ color: theme.muted, fontSize: 13 }}>
            Cơ sở tiếp nhận: <Text style={{ color: theme.text, fontWeight: "600" }}>{row.storeName || "Toàn hệ thống"}</Text>
          </Text>
        </View>
      </Card>

      {query.isError && (
        <InlineError message="Chưa cập nhật được hồ sơ. Kéo xuống để thử lại." />
      )}
      {!!actionError && <InlineError message={actionError} />}

      {/* Contact & Personal Information */}
      <Card style={{ gap: 14, padding: 16 }}>
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>
          Thông tin liên hệ & Căn cước
        </Text>

        <View style={styles.infoRow}>
          <View style={styles.infoIconLabel}>
            <Phone size={15} color={theme.muted} />
            <Text style={{ color: theme.muted, fontSize: 13 }}>Số điện thoại</Text>
          </View>
          <Text selectable style={{ color: theme.primary, fontSize: 16, fontWeight: "700" }}>
            {row.phone || "—"}
          </Text>
        </View>

        {canCall && (
          <Button
            label={`Gọi điện thoại (${phone})`}
            icon={<Phone size={16} color={theme.primaryText} />}
            onPress={() => {
              void callCustomer();
            }}
          />
        )}

        {!!row.email && (
          <View style={styles.infoRow}>
            <View style={styles.infoIconLabel}>
              <Mail size={15} color={theme.muted} />
              <Text style={{ color: theme.muted, fontSize: 13 }}>Email</Text>
            </View>
            <Text selectable style={{ color: theme.text, fontSize: 14 }}>
              {row.email}
            </Text>
          </View>
        )}

        {!!row.address && (
          <View style={styles.infoRow}>
            <View style={styles.infoIconLabel}>
              <MapPin size={15} color={theme.muted} />
              <Text style={{ color: theme.muted, fontSize: 13 }}>Địa chỉ thường trú</Text>
            </View>
            <Text selectable style={{ color: theme.text, fontSize: 14, flex: 1, textAlign: "right" }}>
              {row.address}
            </Text>
          </View>
        )}

        {!!row.contactChannel && (
          <View style={styles.infoRow}>
            <View style={styles.infoIconLabel}>
              <MessageSquare size={15} color={theme.muted} />
              <Text style={{ color: theme.muted, fontSize: 13 }}>Kênh liên hệ</Text>
            </View>
            <Text selectable style={{ color: theme.text, fontSize: 14 }}>
              {row.contactChannel}
            </Text>
          </View>
        )}

        {!!row.customerNote && (
          <View style={[styles.noteBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <ShieldAlert size={15} color={theme.warning} />
              <Text style={{ color: theme.warning, fontSize: 13, fontWeight: "700" }}>Lưu ý hồ sơ rủi ro:</Text>
            </View>
            <Text selectable style={{ color: theme.text, fontSize: 13, lineHeight: 20 }}>
              {row.customerNote}
            </Text>
          </View>
        )}
      </Card>

      {/* Customer Quick Actions */}
      <Card style={{ gap: 12, padding: 16 }}>
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>
          Tác vụ khách hàng
        </Text>

        {session?.user.permissions.includes("customers.write") && (
          <Button
            label="Sửa hồ sơ khách hàng"
            icon={<FilePenLine size={16} color={theme.primaryText} />}
            onPress={() =>
              router.push({
                pathname: "/customer/[id]",
                params: { id: params.id },
              })
            }
          />
        )}

        <Button
          secondary
          label="Giấy tờ, CCCD & Ảnh khách hàng"
          icon={<FileText size={16} color={theme.text} />}
          onPress={() =>
            router.push({
              pathname: "/record-media/[entity]/[id]",
              params: { entity: "customers", id: params.id },
            })
          }
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  infoIconLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  noteBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
    marginTop: 4,
  },
});
