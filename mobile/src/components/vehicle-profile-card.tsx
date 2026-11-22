import React from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import type { MobileVehicleProfile } from "../../../shared/mobile-vehicles";
import { GPS_STATE_LABELS, gpsMapLink } from "../../../shared/mobile-gps";
import { dateTime, money, useTheme } from "@/theme";
import { Button, Card, StatusBadge } from "./ui";
import { Bike, Building2, Calendar, Gauge, KeyRound, MapPin, Palette, ShieldAlert, User, Wrench } from "lucide-react-native";

export function VehicleProfileCard({ profile }: { profile: MobileVehicleProfile }) {
  const theme = useTheme();
  const row = profile.values;

  return (
    <View style={{ gap: 14 }}>
      {/* Header Profile Card */}
      <Card style={{ gap: 10, padding: 18 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text
              accessibilityRole="header"
              style={{
                color: theme.text,
                fontSize: 26,
                fontWeight: "800",
                letterSpacing: 0.5,
              }}
            >
              {row.license || "Chưa có biển số"}
            </Text>
            <Text style={{ color: theme.muted, fontSize: 16, fontWeight: "600" }}>
              {row.name || "Xe chưa đặt tên"}
            </Text>
          </View>
          <StatusBadge status={row.status} />
        </View>

        <View
          style={[
            styles.storeRow,
            { backgroundColor: theme.background, borderColor: theme.border },
          ]}
        >
          <Building2 size={16} color={theme.primary} />
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600", flex: 1 }}>
            Hiện tại: {profile.storeName || "Chưa xác định cơ sở"}
            {profile.beneficiaryStoreName && profile.beneficiaryStoreName !== profile.storeName
              ? ` · Thụ hưởng: ${profile.beneficiaryStoreName}`
              : ""}
          </Text>
        </View>
        {(profile.holderName || (profile.overdueDays ?? 0) > 0) && (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            {!!profile.holderName && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <User size={15} color={theme.primary} />
                <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: "700" }}>
                  Người giữ xe: {profile.holderName}
                </Text>
              </View>
            )}
            {(profile.overdueDays ?? 0) > 0 && (
              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: theme.dangerBackground }}>
                <Text style={{ color: theme.danger, fontSize: 12, fontWeight: "800" }}>
                  Quá hạn {profile.overdueDays} ngày
                </Text>
              </View>
            )}
          </View>
        )}
      </Card>

      {/* GPS Info Card */}
      {profile.gps && (
        <Card style={{ gap: 10, padding: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <MapPin size={16} color={theme.primary} />
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Thiết bị định vị GPS</Text>
            </View>
            <Text style={{ color: profile.gps.status === "online" || profile.gps.status === "stopped" ? theme.success : theme.warning, fontSize: 13, fontWeight: "800" }}>
              {GPS_STATE_LABELS[profile.gps.status] || profile.gps.status}
            </Text>
          </View>
          <Text style={{ color: theme.muted, fontSize: 13 }}>
            Nền tảng: {profile.gps.provider || "—"} · IMEI: {profile.gps.externalDeviceId || "—"}
            {profile.gps.lastSpeed != null ? ` · Tốc độ: ${profile.gps.lastSpeed} km/h` : ""}
          </Text>
          <View style={{ gap: 2 }}>
            {!!profile.gps.syncReceivedAt && <Text style={{ color: theme.muted, fontSize: 12 }}>Đồng bộ Himoto: {dateTime(profile.gps.syncReceivedAt)}</Text>}
            {!!profile.gps.heartbeatAt && <Text style={{ color: theme.muted, fontSize: 12 }}>Tín hiệu thiết bị: {dateTime(profile.gps.heartbeatAt)}</Text>}
            {!!profile.gps.positionRecordedAt && <Text style={{ color: theme.muted, fontSize: 12 }}>Vị trí ghi nhận: {dateTime(profile.gps.positionRecordedAt)}</Text>}
          </View>
          {gpsMapLink(profile.gps.lastLatitude, profile.gps.lastLongitude) && (
            <Button
              secondary
              label="Mở vị trí GPS trên Google Maps"
              onPress={() => {
                const url = gpsMapLink(profile.gps!.lastLatitude, profile.gps!.lastLongitude);
                if (url) void Linking.openURL(url);
              }}
            />
          )}
        </Card>
      )}

      {/* Pricing Group */}
      <Card style={{ gap: 12, padding: 16 }}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Bảng giá & Giá trị</Text>
        <View style={styles.grid2}>
          <View style={[styles.gridCol, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <Text style={{ color: theme.muted, fontSize: 12 }}>Giá thuê ngày</Text>
            <Text style={{ color: theme.primary, fontSize: 17, fontWeight: "800", marginTop: 2 }}>
              {row.daily_price ? money(row.daily_price) : "Chưa ghi nhận"}
            </Text>
          </View>
          <View style={[styles.gridCol, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <Text style={{ color: theme.muted, fontSize: 12 }}>Giá trị định giá</Text>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700", marginTop: 2 }}>
              {row.cost_price ? money(row.cost_price) : "Chưa ghi nhận"}
            </Text>
          </View>
        </View>
      </Card>

      {/* Technical Specs Group */}
      <Card style={{ gap: 12, padding: 16 }}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Định danh & Kỹ thuật</Text>
        
        <View style={styles.specList}>
          <View style={styles.specItem}>
            <View style={styles.specLabelCol}>
              <Bike size={15} color={theme.muted} />
              <Text style={{ color: theme.muted, fontSize: 13 }}>Hãng / Dòng</Text>
            </View>
            <Text selectable style={[styles.specValue, { color: theme.text }]}>
              {row.brand || "—"} {profile.typeLabel ? `· ${profile.typeLabel}` : ""}
            </Text>
          </View>

          <View style={styles.specItem}>
            <View style={styles.specLabelCol}>
              <Gauge size={15} color={theme.muted} />
              <Text style={{ color: theme.muted, fontSize: 13 }}>Số km (Odo)</Text>
            </View>
            <Text selectable style={[styles.specValue, { color: theme.text, fontWeight: "700" }]}>
              {row.odometer === null ? "—" : `${row.odometer.toLocaleString("vi-VN")} km`}
            </Text>
          </View>

          <View style={styles.specItem}>
            <View style={styles.specLabelCol}>
              <Palette size={15} color={theme.muted} />
              <Text style={{ color: theme.muted, fontSize: 13 }}>Màu sắc</Text>
            </View>
            <Text selectable style={[styles.specValue, { color: theme.text }]}>
              {row.color || "—"}
            </Text>
          </View>

          <View style={styles.specItem}>
            <View style={styles.specLabelCol}>
              <Calendar size={15} color={theme.muted} />
              <Text style={{ color: theme.muted, fontSize: 13 }}>Năm sản xuất</Text>
            </View>
            <Text selectable style={[styles.specValue, { color: theme.text }]}>
              {row.year ? String(row.year) : "—"}
            </Text>
          </View>

          <View style={styles.specItem}>
            <View style={styles.specLabelCol}>
              <KeyRound size={15} color={theme.muted} />
              <Text style={{ color: theme.muted, fontSize: 13 }}>Số khung</Text>
            </View>
            <Text selectable style={[styles.specValue, { color: theme.text, fontFamily: "monospace" }]}>
              {row.chassis || "—"}
            </Text>
          </View>

          <View style={styles.specItem}>
            <View style={styles.specLabelCol}>
              <Wrench size={15} color={theme.muted} />
              <Text style={{ color: theme.muted, fontSize: 13 }}>Số máy</Text>
            </View>
            <Text selectable style={[styles.specValue, { color: theme.text, fontFamily: "monospace" }]}>
              {row.engine || "—"}
            </Text>
          </View>

          <View style={styles.specItem}>
            <View style={styles.specLabelCol}>
              <Building2 size={15} color={theme.muted} />
              <Text style={{ color: theme.muted, fontSize: 13 }}>Cơ sở sở hữu</Text>
            </View>
            <Text selectable style={[styles.specValue, { color: theme.text }]}>
              {profile.ownerStoreName || "Chưa xác định"}
            </Text>
          </View>

          {!!row.note && (
            <View style={[styles.specItem, { borderBottomWidth: 0 }]}>
              <View style={styles.specLabelCol}>
                <ShieldAlert size={15} color={theme.muted} />
                <Text style={{ color: theme.muted, fontSize: 13 }}>Ghi chú xe</Text>
              </View>
              <Text selectable style={[styles.specValue, { color: theme.text }]}>
                {row.note}
              </Text>
            </View>
          )}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  storeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  grid2: {
    flexDirection: "row",
    gap: 10,
  },
  gridCol: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  specList: {
    gap: 10,
  },
  specItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F033",
  },
  specLabelCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  specValue: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "right",
    flex: 1.2,
  },
});
