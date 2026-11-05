import { Text } from 'react-native';
import type { MobileVehicleImportReceipt } from '../../../shared/mobile-vehicle-import';
import { useSession } from '@/providers/session';
import { useCsvExport } from '@/hooks/use-csv-export';
import { dateTime, useTheme } from '@/theme';
import { Button, Card, InlineError } from './ui';
export function VehicleImportReceipt({ receipt, disabled = false }: { receipt: MobileVehicleImportReceipt; disabled?: boolean }) {
  const theme = useTheme(), { api, session } = useSession(), download = useCsvExport(), r = receipt;
  const text = { color: theme.text, fontSize: 16, lineHeight: 24 }, muted = { color: theme.muted, fontSize: 14, lineHeight: 22 };
  return <Card style={{ gap: 12 }}><Text accessibilityRole="header" style={{ ...text, fontSize: 22, fontWeight: '700' }}>{r.mode === 'reset' ? `Đã xóa ${r.removed} xe` : r.mode === 'replace' ? `Đã thay ${r.existing} xe bằng ${r.inserted} xe` : `Đã cập nhật ${r.updated}, thêm ${r.inserted} xe`}</Text>
    {r.mode !== 'reset' && <Text style={text}>Bỏ qua {r.skipped} dòng ngoài cơ sở đã chọn. {r.mode === 'sync' ? `Giữ ${r.retained} xe ngoài phần nhập.` : 'Danh sách trước thay thế được giữ trong bản sao lưu.'}</Text>}
    <Text style={muted}>Ghi nhận {dateTime(r.recordedAt)}. Đây là kết quả lần gửi gốc; danh sách xe có thể đã được chỉnh sửa tiếp.</Text><Text selectable style={muted}>Mã lần gửi: {r.key}</Text><Text selectable style={muted}>Bản sao lưu: {r.backupId}</Text>
    {session?.user.permissions.includes('contracts.read') && <Button secondary label="Tải bản sao lưu JSON trước thay đổi" loading={download.busy} disabled={disabled} onPress={() => void download.run(signal => api!.vehicleImportBackup(r.backupId, signal))} />}
    {!!download.error && <InlineError message={download.error} />}{!!download.message && <Text accessibilityLiveRegion="polite" style={muted}>{download.message}</Text>}
  </Card>;
}
