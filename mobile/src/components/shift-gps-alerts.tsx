import { Linking, Text, View } from 'react-native';
import { AlertTriangle, MapPin, Navigation } from 'lucide-react-native';
import type { ShiftGpsAlertSummary } from '../../../shared/shift-stock-check';
import { useTheme } from '@/theme';
import { Button, Card, StatusBadge } from './ui';

function formatDist(meters: number | null) {
  if (meters === null) return 'Chưa có tọa độ';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
  return `${meters.toLocaleString('vi-VN')} m`;
}

function openMaps(lat: number, lng: number) {
  void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`);
}

export function ShiftGpsAlerts({ alerts }: { alerts?: ShiftGpsAlertSummary | null }) {
  const theme = useTheme();
  if (!alerts || alerts.total_alerts <= 0) return null;

  return (
    <Card
      style={{
        gap: 12,
        borderColor: theme.danger,
        borderWidth: 1.5,
        backgroundColor: theme.dangerBackground,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <AlertTriangle size={20} color={theme.danger} />
          <Text accessibilityRole="header" style={{ color: theme.danger, fontSize: 16, fontWeight: '800', flex: 1 }}>
            Cảnh báo vị trí GPS (Chỉ quản trị thấy)
          </Text>
        </View>
        <StatusBadge status="overdue" label={`${alerts.total_alerts} cảnh báo`} />
      </View>

      <Text style={{ color: theme.text, fontSize: 13, lineHeight: 19 }}>
        Phạm vi cho phép tại cơ sở: ≤ {alerts.radius_m} m. Nhân viên không thấy cảnh báo này.
      </Text>

      {alerts.phone_alerts.length > 0 && (
        <View style={{ gap: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: theme.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MapPin size={15} color={theme.danger} />
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>
              Lớp 1 · Vị trí điện thoại lúc chụp ({alerts.phone_alerts.length})
            </Text>
          </View>
          {alerts.phone_alerts.map((item, idx) => (
            <View
              key={`phone-${idx}-${item.captured_at}`}
              style={{
                backgroundColor: theme.surface,
                borderRadius: 10,
                padding: 10,
                gap: 4,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>{item.label}</Text>
              <Text style={{ color: theme.danger, fontSize: 13, fontWeight: '700' }}>{item.issue}</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>
                {item.actor_name ? `${item.actor_name} · ` : ''}
                {new Date(item.captured_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                {item.distance_m != null ? ` · Khoảng cách: ${formatDist(item.distance_m)}` : ''}
              </Text>
              {item.latitude != null && item.longitude != null && (
                <View style={{ paddingTop: 4 }}>
                  <Button
                    size="sm"
                    secondary
                    label="Mở vị trí chụp trên Google Maps"
                    onPress={() => openMaps(item.latitude!, item.longitude!)}
                  />
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {alerts.vehicle_alerts.length > 0 && (
        <View style={{ gap: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: theme.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Navigation size={15} color={theme.danger} />
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>
              Lớp 2 · GPS gắn trên xe Lưu kho ({alerts.vehicle_alerts.length})
            </Text>
          </View>
          {alerts.vehicle_alerts.map(item => (
            <View
              key={`veh-${item.vehicle_id}`}
              style={{
                backgroundColor: theme.surface,
                borderRadius: 10,
                padding: 10,
                gap: 4,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>
                {item.license} · {item.name}
              </Text>
              <Text style={{ color: theme.danger, fontSize: 13, fontWeight: '700' }}>{item.issue}</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>
                Trạng thái GPS: {item.status}
                {item.distance_m != null ? ` · Cách cơ sở: ${formatDist(item.distance_m)}` : ''}
                {item.recorded_at ? ` · Cập nhật: ${new Date(item.recorded_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}` : ''}
              </Text>
              {item.latitude != null && item.longitude != null && (
                <View style={{ paddingTop: 4 }}>
                  <Button
                    size="sm"
                    secondary
                    label="Xem vị trí GPS xe trên Google Maps"
                    onPress={() => openMaps(item.latitude!, item.longitude!)}
                  />
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}
