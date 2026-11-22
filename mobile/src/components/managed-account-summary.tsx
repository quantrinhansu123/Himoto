import { Text, View } from 'react-native';
import { Card, KeyValueRow, StatusBadge } from './ui';
import { useTheme, dateTime } from '@/theme';
import { ACCESS_ROLES, ACCESS_PERMISSION_LABELS, type ManagedAccount, type AccessPermission } from '../../../shared/mobile-managed-accounts';

export function ManagedAccountSummary({ account: r, permissions = false }: { account: ManagedAccount; permissions?: boolean }) {
  const theme = useTheme();
  const active = r.enabled ?? r.status === 'active';
  return (
    <>
      {!permissions && (
        <Card style={{ gap: 8, padding: 13 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <Text accessibilityRole="header" numberOfLines={1} style={{ color: theme.text, fontSize: 16, fontWeight: '800', flex: 1 }}>
              {r.name}
            </Text>
            <StatusBadge status={active ? 'active' : 'cancelled'} label={active ? 'Hoạt động' : 'Đã khóa'} />
          </View>
          <Text selectable style={{ color: theme.primary, fontSize: 13.5, fontWeight: '700' }}>
            {r.login_name || r.email}
          </Text>
          <View style={{ gap: 2 }}>
            <KeyValueRow label="Vai trò" value={r.access_role ? ACCESS_ROLES[r.access_role].label : 'Tài khoản hiện có'} />
            <KeyValueRow label="Phạm vi" value={r.scope_all ? 'Toàn hệ thống' : r.store_name || 'Chờ phân cơ sở'} />
            {!!r.staff_code && (
              <KeyValueRow label="Nhân sự" value={`${r.staff_code}${r.staff_status === 'leave' ? ' · Đã nghỉ việc' : ''}`} />
            )}
            <KeyValueRow label="Đổi MK gần nhất" value={r.password_changed_at ? dateTime(r.password_changed_at) : 'Chưa ghi nhận'} />
          </View>
        </Card>
      )}
      {permissions && (
        <Card style={{ gap: 8, padding: 13 }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>Quyền thao tác ({(r.permissions || []).length})</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {(r.permissions || []).map(p => (
              <View key={p} style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border }}>
                <Text style={{ color: theme.text, fontSize: 12.5, fontWeight: '600' }}>
                  {ACCESS_PERMISSION_LABELS[p as AccessPermission] || p}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      )}
    </>
  );
}
