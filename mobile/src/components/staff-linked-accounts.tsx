import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { canManageAccounts, canRecoverAccountPasswords, validateNewPassword } from '../../../shared/mobile-managed-accounts';
import type { MobileStaffAccount } from '../../../shared/mobile-staff-accounts';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';
import { Button, Card, InlineError, StateView, StatusBadge } from './ui';
import { EditorSheet } from './editor-sheet';
import { FormField } from './form-fields';

export function StaffLinkedAccounts({ id }: { id: number }) {
  const { api, session } = useSession();
  const theme = useTheme();
  const allowed = canManageAccounts(session?.user);
  const canSetPassword = canRecoverAccountPasswords(session?.user);
  const query = useQuery({
    queryKey: ['staff-accounts', session?.user.id, id],
    queryFn: ({ signal }) => api!.staffAccounts(String(id), signal),
    enabled: !!api && allowed,
    staleTime: 0,
  });
  const [editing, setEditing] = useState<MobileStaffAccount | null>(null);
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');

  const refetch = query.refetch;
  useFocusEffect(
    useCallback(() => {
      if (allowed) void refetch();
    }, [allowed, refetch]),
  );

  if (!allowed) return null;

  function openEdit(account: MobileStaffAccount) {
    setEditing(account);
    setLoginName(account.login_name);
    setPassword('');
    setConfirmation('');
    setShowPassword(false);
    setSaveError('');
  }

  async function submitEdit() {
    if (!api || !editing || saving) return;
    setSaveError('');
    const normalized = loginName.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,80}$/.test(normalized)) {
      setSaveError('Tên đăng nhập cần 3–80 ký tự (chữ không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới).');
      return;
    }
    if (password) {
      try {
        validateNewPassword(password);
      } catch (cause) {
        setSaveError((cause as Error).message);
        return;
      }
      if (password !== confirmation) {
        setSaveError('Nhập lại mật khẩu mới chưa khớp.');
        return;
      }
    } else if (confirmation) {
      setSaveError('Nhập mật khẩu mới trước khi xác nhận.');
      return;
    }
    setSaving(true);
    try {
      const result = await api.updateStaffAccount(String(id), {
        account_id: editing.id,
        login_name: normalized,
        revision: editing.revision,
        ...(password ? { password, confirmation } : {}),
      });
      setEditing(null);
      setNotice(
        result.password_changed
          ? 'Đã cập nhật tên đăng nhập và đặt lại mật khẩu mới cho tài khoản.'
          : 'Đã cập nhật tên đăng nhập của tài khoản.',
      );
      await query.refetch();
    } catch (cause) {
      setSaveError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>
        Tài khoản đăng nhập
      </Text>
      {!!notice && (
        <Text accessibilityLiveRegion="polite" style={{ color: theme.success, fontSize: 13.5, fontWeight: '600' }}>
          {notice}
        </Text>
      )}
      {query.isPending ? (
        <StateView title="Đang tải tài khoản…" loading />
      ) : query.isError ? (
        <StateView title="Chưa tải được tài khoản của nhân sự" message={query.error.message} retry={() => void query.refetch()} />
      ) : query.data.length ? (
        query.data.map((account) => (
          <Card key={account.id} style={{ gap: 10, padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text selectable style={{ color: theme.text, fontSize: 15, fontWeight: '700', flex: 1 }}>
                {account.login_name}
              </Text>
              <StatusBadge status={account.enabled ? 'active' : 'inactive'} label={account.enabled ? 'Hoạt động' : 'Đã khóa'} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                size="sm"
                equalWidth
                secondary
                label={canSetPassword ? 'Đổi tên / Đặt MK' : 'Sửa tên đăng nhập'}
                onPress={() => openEdit(account)}
              />
              <Button
                size="sm"
                equalWidth
                secondary
                label="Hồ sơ & quyền"
                onPress={() => router.push({ pathname: '/managed-account/[id]', params: { id: String(account.id) } })}
              />
            </View>
          </Card>
        ))
      ) : (
        <Text style={{ color: theme.muted, fontSize: 14 }}>Nhân sự chưa có tài khoản đăng nhập được liên kết.</Text>
      )}
      {editing && (
        <EditorSheet
          title={canSetPassword ? 'Sửa đăng nhập & đặt mật khẩu' : 'Sửa tên đăng nhập'}
          onClose={() => {
            if (!saving) setEditing(null);
          }}
        >
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14 }}>
            <FormField
              label="Tên đăng nhập"
              value={loginName}
              onChangeText={(v) => setLoginName(v.toLowerCase())}
              autoCapitalize="none"
              editable={!saving}
              maxLength={80}
            />
            {canSetPassword && (
              <>
                <FormField
                  label="Mật khẩu mới (để trống nếu giữ nguyên)"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  editable={!saving}
                  maxLength={128}
                />
                <FormField
                  label="Nhập lại mật khẩu mới"
                  value={confirmation}
                  onChangeText={setConfirmation}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  editable={!saving}
                  maxLength={128}
                />
                <Button
                  size="sm"
                  secondary
                  label={showPassword ? 'Ẩn mật khẩu đang nhập' : 'Hiện mật khẩu đang nhập'}
                  onPress={() => setShowPassword((v) => !v)}
                />
                <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 19 }}>
                  Đặt mật khẩu mới sẽ đăng xuất các phiên đăng nhập cũ của nhân sự này.
                </Text>
              </>
            )}
            {!!saveError && <InlineError message={saveError} />}
            <Button label="Lưu thay đổi tài khoản" loading={saving} onPress={() => void submitEdit()} />
          </ScrollView>
        </EditorSheet>
      )}
    </Card>
  );
}
