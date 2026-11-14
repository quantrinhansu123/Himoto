import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { MobileVehicleProfile } from "../../../shared/mobile-vehicles";
import { money, useTheme } from "@/theme";
import { Card, StatusBadge } from "./ui";
import { Bike, Building2, Calendar, Gauge, KeyRound, Palette, ShieldAlert, Wrench } from "lucide-react-native";

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
          </Text>
        </View>
      </Card>

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
