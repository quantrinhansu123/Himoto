import { Text, View } from "react-native";
import type { MobileVehicleProfile } from "../../../shared/mobile-vehicles";
import { money, useTheme } from "@/theme";
import { Card, StatusBadge } from "./ui";
export function VehicleProfileCard({ profile }: { profile: MobileVehicleProfile }) {
  const theme = useTheme(), row = profile.values;
  const fields = [["Tên / dòng xe", row.name], ["Hãng xe", row.brand], ["Loại xe", profile.typeLabel], ["Năm sản xuất", row.year === null ? "" : String(row.year)], ["Màu sắc", row.color], ["Số khung", row.chassis], ["Số máy", row.engine], ["Số km", row.odometer === null ? "" : row.odometer.toLocaleString("vi-VN")], ["Cơ sở hiện tại", profile.storeName], ["Cơ sở sở hữu", profile.ownerStoreName]];
  return <Card style={{ gap: 16 }}>
    <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 25, fontWeight: "800" }}>{row.license}</Text>
    <StatusBadge status={row.status} />
    <View style={{gap:6}}><Text style={{color:theme.text,fontSize:16}}>Giá trị / giá mua: {row.cost_price == null ? 'Chưa ghi nhận' : money(row.cost_price)}</Text><Text style={{color:theme.text,fontSize:16}}>Giá thuê: {row.daily_price == null ? 'Chưa ghi nhận' : money(row.daily_price)}</Text></View>
    {fields.filter(([, value]) => value).map(([label, value]) => <View key={label} style={{ gap: 5 }}><Text style={{ color: theme.muted, fontSize: 13 }}>{label}</Text><Text selectable style={{ color: theme.text, fontSize: 16, lineHeight: 23 }}>{value}</Text></View>)}
  </Card>;
}
