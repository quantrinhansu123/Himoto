import { Text, View } from "react-native";
import type { MobileVehicleChange } from "../../../shared/mobile-vehicles";
import { useTheme } from "@/theme";
export function VehicleChanges({ changes }: { changes: MobileVehicleChange[] }) {
  const theme = useTheme();
  return <View style={{ gap: 8 }}>{changes.map((row, index) => <View key={`${row.field}:${index}`} style={{ gap: 3 }}><Text style={{ color: theme.muted, fontSize: 13 }}>{row.label}</Text><Text selectable style={{ color: theme.text, lineHeight: 22 }}>{row.from || "—"} → {row.to || "—"}</Text></View>)}</View>;
}
