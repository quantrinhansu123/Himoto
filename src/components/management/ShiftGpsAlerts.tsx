'use client';
import { AlertTriangle, MapPin, Navigation } from 'lucide-react';
import type { ShiftGpsAlertSummary } from '../../../shared/shift-stock-check';

function formatDist(meters: number | null) {
  if (meters === null) return 'Chưa có tọa độ';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
  return `${meters.toLocaleString('vi-VN')} m`;
}

export function ShiftGpsAlerts({ alerts }: { alerts?: ShiftGpsAlertSummary | null }) {
  if (!alerts || alerts.total_alerts <= 0) return null;
  return (
    <section
      aria-label="Cảnh báo vị trí GPS dành cho quản trị"
      style={{
        border: '1.5px solid #dc2626',
        backgroundColor: 'rgba(220, 38, 38, 0.08)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        display: 'grid',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ color: '#b91c1c', display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
          <AlertTriangle size={18} />
          Cảnh báo vị trí GPS (Chỉ quản trị thấy) · {alerts.total_alerts} bất thường
        </strong>
        <small style={{ color: '#991b1b' }}>Phạm vi cơ sở: ≤ {alerts.radius_m} m · Nhân viên không thấy cảnh báo này</small>
      </div>

      {alerts.phone_alerts.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13.5 }}>
            <MapPin size={15} color="#b91c1c" />
            Lớp 1 · Vị trí điện thoại lúc chụp ({alerts.phone_alerts.length})
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            {alerts.phone_alerts.map((item, idx) => (
              <li key={`phone-${idx}-${item.captured_at}`} style={{ fontSize: 13.5 }}>
                <strong>{item.label}</strong>: <span style={{ color: '#b91c1c', fontWeight: 600 }}>{item.issue}</span>{' '}
                <small>
                  ({item.actor_name ? `${item.actor_name} · ` : ''}
                  {new Date(item.captured_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                  {item.distance_m != null ? ` · ${formatDist(item.distance_m)}` : ''})
                </small>
                {item.latitude != null && item.longitude != null && (
                  <>
                    {' · '}
                    <a href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`} target="_blank" rel="noopener noreferrer">
                      Xem Google Maps
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {alerts.vehicle_alerts.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13.5 }}>
            <Navigation size={15} color="#b91c1c" />
            Lớp 2 · GPS gắn trên xe Lưu kho ({alerts.vehicle_alerts.length})
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            {alerts.vehicle_alerts.map(item => (
              <li key={`veh-${item.vehicle_id}`} style={{ fontSize: 13.5 }}>
                <strong>{item.license}</strong> · {item.name}: <span style={{ color: '#b91c1c', fontWeight: 600 }}>{item.issue}</span>{' '}
                <small>
                  (Trạng thái: {item.status}
                  {item.distance_m != null ? ` · Cách CS: ${formatDist(item.distance_m)}` : ''}
                  {item.recorded_at ? ` · ${new Date(item.recorded_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}` : ''})
                </small>
                {item.latitude != null && item.longitude != null && (
                  <>
                    {' · '}
                    <a href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`} target="_blank" rel="noopener noreferrer">
                      Xem vị trí xe trên Maps
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
