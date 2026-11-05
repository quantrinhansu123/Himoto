import { Text } from 'react-native';
import { useTheme } from '@/theme';
const labels: Record<string, string> = { orders: 'Hợp đồng và dữ liệu lưu trên hợp đồng', order_vehicle_details: 'Lịch sử xe trong hợp đồng', management_record_photos: 'Ảnh hồ sơ', vehicle_location_events: 'Lịch sử vị trí xe', vehicle_transfers: 'Điều chuyển xe', maintenance_details: 'Bảo dưỡng xe', vehicle_maintenance: 'Bảo dưỡng xe' };
export function VehicleImportReferences({ references }: { references: { table: string; column: string; count: number }[] }) {
  const theme = useTheme();
  return <>{references.map((r, i) => <Text key={`${r.table}:${r.column}:${i}`} style={{ color: theme.muted, fontSize: 14, lineHeight: 22 }}>{labels[r.table] || 'Dữ liệu liên quan đến xe'}: {r.count} liên kết</Text>)}</>;
}
