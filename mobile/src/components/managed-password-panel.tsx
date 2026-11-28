import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { uuid } from 'expo';
import { copyText } from '@/lib/clipboard';
import { useSession } from '@/providers/session';
import { pendingWrites } from '@/lib/pending-writes';
import { useTheme } from '@/theme';
import { accountWriteOperations, type ManagedAccount } from '../../../shared/mobile-managed-accounts';
import { Button, Card, InfoBanner, InlineError } from './ui';
import { ConfirmEdit } from './editor-sheet';
import { FormField } from './form-fields';

export function ManagedPasswordPanel({ record }: { record: ManagedAccount }) {
  const { api, session } = useSession();
  const cache = useQueryClient();
  const theme = useTheme();
  const [password, setPassword] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const running = useRef(false);

  useEffect(() => {
    alive.current = true;
    const listener = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        setPassword(null);
        setShown(false);
        setCopied(false);
      }
    });
    return () => {
      alive.current = false;
      listener.remove();
    };
  }, []);

  useFocusEffect(
    useCallback(
      () => () => {
        setPassword(null);
        setShown(false);
        setCopied(false);
      },
      [],
    ),
  );

  useEffect(() => {
    if (password === null) return;
    const timer = setTimeout(() => {
      setPassword(null);
      setShown(false);
      setCopied(false);
    }, 60000);
    return () => clearTimeout(timer);
  }, [password]);

  async function reveal() {
    if (!api || !session || running.current) return;
    running.current = true;
    setConfirm(false);
    setBusy(true);
    setError('');
    setCopied(false);
    const scope = {
      origin: api.origin,
      userId: session.user.id,
      storeId: session.user.allStores ? null : session.user.storeId,
      allStores: session.user.allStores,
    };
    const operation = `account.password:${record.id}`;
    const conflicts = accountWriteOperations(record.id);
    let activeKey = '';
    try {
      let intent = await pendingWrites.reserveExclusive(scope, operation, conflicts, () => uuid.v4().toLowerCase());
      if (!alive.current) return;
      if (!intent.created) {
        // Auto-reconcile any prior completed/cancelled account lock left on this device
        // so viewing passwords is never permanently blocked by an unacknowledged receipt.
        try {
          await api.resolveWrite(intent.key, intent.operation);
        } catch {
          await api.managedAccountResult(intent.key);
        }
        const original = await pendingWrites.entryScope(scope, intent.operation, intent.key);
        await pendingWrites.complete(original || scope, intent.operation, intent.key);
        void cache.invalidateQueries({ queryKey: ['managed-account'] });
        void cache.invalidateQueries({ queryKey: ['managed-accounts'] });
        intent = await pendingWrites.reserveExclusive(scope, operation, conflicts, () => uuid.v4().toLowerCase());
        if (!alive.current) return;
        if (!intent.created) {
          setPending(true);
          throw Error('Còn thao tác tài khoản chưa đối chiếu. Kiểm tra mã gốc trong Tài khoản.');
        }
      }
      activeKey = intent.key;
      setPending(true);
      const result = await api.revealManagedPassword(String(record.id), intent.key);
      await pendingWrites.complete(scope, operation, intent.key).catch(() => {});
      activeKey = '';
      if (!alive.current) return;
      setPending(false);
      if (result.revision !== record.revision) {
        void cache.invalidateQueries({ queryKey: ['managed-account', session.user.id, String(record.id)] });
      }
      if (result.password === null) {
        throw Error('Chưa có mật khẩu đã lưu trên máy chủ. Chờ nhân viên đổi mật khẩu.');
      }
      setPassword(result.password);
      setShown(true);
    } catch (cause) {
      const status = typeof (cause as { status?: unknown })?.status === 'number' ? (cause as { status: number }).status : 0;
      if (activeKey && status >= 400 && status < 500) {
        const resolved = await api.resolveWrite(activeKey, operation).catch(() => null);
        if (resolved && (resolved.status === 'cancelled' || resolved.status === 'committed')) {
          await pendingWrites.complete(scope, operation, activeKey).catch(() => {});
          if (alive.current) setPending(false);
        }
      }
      if (alive.current) setError((cause as Error).message || 'Chưa xem được mật khẩu. Vui lòng thử lại.');
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 12 }}>
      <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800' }}>Mật khẩu theo quyền riêng</Text>
      <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 20 }}>
        Mật khẩu đang xem tự ẩn sau một phút hoặc khi rời ứng dụng.
      </Text>
      {password !== null && (
        <>
          <FormField label="Mật khẩu tài khoản đang xem" value={password} editable={false} secureTextEntry={!shown} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button size="sm" equalWidth secondary label={shown ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onPress={() => setShown((v) => !v)} />
            <Button
              size="sm"
              equalWidth
              secondary
              label="Sao chép mật khẩu"
              onPress={() => {
                void copyText(password).then((ok) => {
                  if (ok) setCopied(true);
                });
              }}
            />
          </View>
          {copied && <InfoBanner tone="success" message="Đã sao chép mật khẩu vào bộ nhớ tạm." />}
          <Button
            size="sm"
            secondary
            label="Đóng mật khẩu"
            onPress={() => {
              setPassword(null);
              setShown(false);
              setCopied(false);
            }}
          />
        </>
      )}
      {password === null && (
        <Button
          size="sm"
          secondary
          label="Xem mật khẩu đã lưu"
          loading={busy}
          disabled={!record.password_available}
          onPress={() => setConfirm(true)}
        />
      )}
      {!record.password_available && (
        <Text style={{ color: theme.muted, fontSize: 13 }}>Chưa có bản lưu · chờ nhân viên đổi mật khẩu.</Text>
      )}
      {!!error && <InlineError message={error} />}
      {pending && !busy && (
        <Button size="sm" secondary label="Đối chiếu trong Tài khoản" onPress={() => router.push('/(tabs)/account')} />
      )}
      {confirm && (
        <ConfirmEdit
          title="Xem mật khẩu tài khoản?"
          message={`${record.name} · ${record.login_name || record.email}\nLần xem được ghi vào lịch sử quyền truy cập.`}
          confirmLabel="Xác nhận xem mật khẩu"
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            void reveal();
          }}
        />
      )}
    </Card>
  );
}
