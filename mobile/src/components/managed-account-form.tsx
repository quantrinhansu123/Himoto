import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { router, usePreventRemove } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { uuid } from 'expo';
import { Check, Square } from 'lucide-react-native';
import { useSession } from '@/providers/session';
import { pendingWrites } from '@/lib/pending-writes';
import { useTheme } from '@/theme';
import { Button, Card, InlineError, SegmentedBar } from './ui';
import { ChoiceField, FormField } from './form-fields';
import { ConfirmEdit } from './editor-sheet';
import { AccountIssuedCredentials } from './account-issued-credentials';
import {
  newManagedAccount,
  managedAccountInput,
  changeManagedAccountRole,
  parseAccountValues,
  ACCESS_ROLES,
  ADMIN_PERMISSIONS,
  ACCESS_PERMISSION_LABELS,
  ACCOUNT_PERMISSION_GROUPS,
  isOwnershipManager,
  accountWriteOperations,
  type ManagedAccount,
  type ManagedAccountOptions,
  type ManagedAccountInput,
  type AccessRole,
  type MobileStaffCredentials,
} from '../../../shared/mobile-managed-accounts';

export function ManagedAccountForm({
  record,
  options,
  storeId,
}: {
  record: ManagedAccount | null;
  options: ManagedAccountOptions;
  storeId: number | null;
}) {
  const { api, session } = useSession();
  const cache = useQueryClient();
  const theme = useTheme();
  const scoped = isOwnershipManager(session?.user);
  const isAdminActor = session?.user.role === 'admin';
  const [form, setForm] = useState(() =>
    record ? managedAccountInput(record) : newManagedAccount(scoped ? session!.user.storeId : storeId),
  );
  const [baseline] = useState(() => JSON.stringify(form));
  const [part, setPart] = useState<'identity' | 'scope' | 'permissions'>('identity');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [exit, setExit] = useState<(() => void) | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [issued, setIssued] = useState<MobileStaffCredentials | null>(null);
  const [savedAccountId, setSavedAccountId] = useState<number | null>(null);
  const alive = useRef(true);
  const running = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const prevent = usePreventRemove(
    !leaving && (busy || pending || JSON.stringify(form) !== baseline),
    ({ repeat }) => {
      if (!busy && !issued) setExit(() => repeat);
    },
  );

  const update = <K extends keyof ManagedAccountInput>(k: K, v: ManagedAccountInput[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const ownershipRole = form.access_role === 'ownership_manager';
  const availableStores = options.stores.filter(
    (s) => (!scoped || s.id === session!.user.storeId) && (!ownershipRole || s.kind === 'lease_to_own'),
  );

  function selectRole(nextRole: AccessRole) {
    setForm((p) => {
      const next = changeManagedAccountRole(p, nextRole);
      if (scoped) return { ...next, scope_all: false, store_id: session!.user.storeId };
      if (nextRole === 'ownership_manager') {
        const leaseStore = options.stores.find((s) => s.id === next.store_id && s.kind === 'lease_to_own')
          ?? options.stores.find((s) => s.kind === 'lease_to_own');
        return { ...next, scope_all: false, store_id: leaseStore?.id ?? null };
      }
      return next;
    });
  }

  function selectStore(value: string) {
    const nextStoreId = value === 'all' || !value ? null : Number(value);
    const picked = options.stores.find((s) => s.id === nextStoreId);
    setForm((p) => {
      let nextRole = p.access_role;
      let nextPermissions = p.permissions;
      if (picked?.kind === 'lease_to_own' && p.access_role === 'branch_manager') {
        nextRole = 'ownership_manager';
        nextPermissions = [...ACCESS_ROLES.ownership_manager.permissions];
      } else if (picked && picked.kind !== 'lease_to_own' && p.access_role === 'ownership_manager') {
        nextRole = 'branch_manager';
        nextPermissions = [...ACCESS_ROLES.branch_manager.permissions];
      }
      return {
        ...p,
        access_role: nextRole,
        permissions: nextPermissions,
        scope_all: value === 'all',
        store_id: nextStoreId,
      };
    });
  }

  function review() {
    try {
      parseAccountValues(form, !record);
      setError('');
      setConfirm(true);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  function finishToAccount(accountId: number) {
    setIssued(null);
    setLeaving(true);
    prevent();
    if (accountId > 0) {
      router.replace({ pathname: '/managed-account/[id]', params: { id: String(accountId), saved: '1' } });
    } else {
      router.replace('/managed-accounts');
    }
  }

  async function save() {
    if (!api || !session || running.current) return;
    running.current = true;
    setBusy(true);
    setConfirm(false);
    setError('');
    try {
      const scope = {
        origin: api.origin,
        userId: session.user.id,
        storeId: session.user.allStores ? null : session.user.storeId,
        allStores: session.user.allStores,
      };
      const operation = record ? `account.update:${record.id}` : 'account.create';
      const intent = await pendingWrites.reserveExclusive(
        scope,
        operation,
        record ? accountWriteOperations(record.id) : [operation],
        () => uuid.v4().toLowerCase(),
      );
      if (!alive.current) return;
      setPending(true);
      if (!intent.created)
        throw Error('Còn thay đổi tài khoản chưa đối chiếu. Mở Tài khoản để kiểm tra mã gốc.');
      const result = await api.saveManagedAccount(
        record ? String(record.id) : null,
        { ...form, ...(record ? { revision: record.revision } : {}) },
        intent.key,
      );
      await pendingWrites.complete(scope, operation, intent.key).catch(() => {});
      for (const key of [['managed-accounts'], ['managed-account'], ['managed-account-options'], ['directory', 'staff']]) {
        void cache.invalidateQueries({ queryKey: key });
      }
      if (!alive.current) return;
      setPending(false);
      setForm((previous) => ({ ...previous, password: '' }));
      const nextId = result.id || record?.id || 0;
      if (result.credentials) {
        setSavedAccountId(nextId);
        setIssued(result.credentials);
      } else if (nextId > 0) {
        finishToAccount(nextId);
      } else {
        setLeaving(true);
        prevent();
        router.replace('/managed-accounts');
      }
    } catch (cause) {
      if (alive.current) setError((cause as Error).message);
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  }

  const maxPerms = form.access_role === 'admin' ? ADMIN_PERMISSIONS.length : ADMIN_PERMISSIONS.length - 1;
  const selectedPermCount =
    form.access_role === 'admin'
      ? ADMIN_PERMISSIONS.length
      : form.permissions.filter((p) => p !== 'accounts.manage').length;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14, maxWidth: 760, width: '100%', alignSelf: 'center' }}
        >
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>
            {record ? 'Cập nhật tài khoản' : 'Tạo tài khoản'}
          </Text>
          <SegmentedBar
            value={part}
            disabled={busy}
            options={[
              { value: 'identity', label: 'Đăng nhập' },
              { value: 'scope', label: 'Vai trò & Cơ sở' },
              { value: 'permissions', label: `Quyền (${selectedPermCount})` },
            ]}
            onChange={setPart}
          />
          {part === 'identity' && (
            <Card style={{ gap: 14 }}>
              <FormField label="Tên hiển thị tài khoản" value={form.name} onChangeText={(v) => update('name', v)} maxLength={191} editable={!busy && !pending} />
              <FormField
                label="Tên đăng nhập tài khoản"
                value={form.login_name}
                onChangeText={(v) => update('login_name', v.toLowerCase())}
                maxLength={80}
                autoCapitalize="none"
                editable={!busy && !pending}
                hint={record ? undefined : 'Để trống để tự sinh.'}
              />
              {!record && (
                <FormField
                  label="Mật khẩu ban đầu"
                  value={form.password}
                  onChangeText={(v) => update('password', v)}
                  secureTextEntry
                  autoCapitalize="none"
                  maxLength={128}
                  editable={!busy && !pending}
                  hint="Để trống để tự sinh mật khẩu."
                />
              )}
            </Card>
          )}
          {part === 'scope' && (
            <Card style={{ gap: 14 }}>
              <ChoiceField
                label="Vai trò tài khoản"
                value={form.access_role}
                choices={Object.entries(ACCESS_ROLES)
                  .filter(([value]) => !scoped || !['admin', 'headquarters_sales', 'headquarters_debt'].includes(value))
                  .map(([value, r]) => ({ value, label: r.label }))}
                disabled={busy || pending || record?.id === session!.user.id}
                onChange={(v) => selectRole(v as AccessRole)}
              />
              <ChoiceField
                label="Phạm vi cơ sở tài khoản"
                value={form.scope_all ? 'all' : String(form.store_id || '')}
                choices={[
                  ...(!scoped && !ownershipRole ? [{ value: '', label: 'Chọn cơ sở' }, { value: 'all', label: 'Tất cả cơ sở' }] : !scoped ? [{ value: '', label: 'Chọn cơ sở thuê sở hữu' }] : []),
                  ...availableStores.map((s) => ({ value: String(s.id), label: s.name })),
                ]}
                searchable
                disabled={busy || pending || form.access_role === 'admin' || scoped}
                onChange={selectStore}
              />
              <ChoiceField
                label="Cho phép tài khoản đăng nhập"
                value={form.enabled ? 'yes' : 'no'}
                choices={[
                  { value: 'yes', label: 'Cho phép đăng nhập' },
                  { value: 'no', label: 'Khóa đăng nhập' },
                ]}
                disabled={busy || pending || record?.id === session!.user.id}
                onChange={(v) => update('enabled', v === 'yes')}
              />
              <Text style={{ color: theme.muted, fontSize: 13.5, lineHeight: 20 }}>
                {form.scope_all
                  ? 'Truy cập toàn bộ cơ sở theo quyền đã cấp.'
                  : ownershipRole
                    ? 'Quản lý thuê sở hữu chỉ gắn với cơ sở Thuê sở hữu và tự động đủ quyền vận hành cơ sở đó.'
                    : 'Chỉ truy cập cơ sở được phân công theo quyền đã cấp.'}
              </Text>
            </Card>
          )}
          {part === 'permissions' && (
            <>
              <Text style={{ color: theme.text, fontWeight: '600' }}>
                {selectedPermCount}/{maxPerms} quyền đã chọn
              </Text>
              {ACCOUNT_PERMISSION_GROUPS.map((g) => (
                <Card key={g.title} style={{ gap: 6 }}>
                  <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700' }}>{g.title}</Text>
                  {g.permissions.map((p) => {
                    const checked = form.permissions.includes(p);
                    const restrictedDelete = p === 'contracts.delete' && !['admin', 'accounting'].includes(form.access_role);
                    const actorMissing = !isAdminActor && !session!.user.permissions.includes(p);
                    const permDisabled = busy || pending || form.access_role === 'admin' || ownershipRole || restrictedDelete || actorMissing;
                    return (
                      <Pressable
                        key={p}
                        accessibilityRole="checkbox"
                        accessibilityLabel={ACCESS_PERMISSION_LABELS[p]}
                        accessibilityState={{ checked, disabled: permDisabled }}
                        disabled={permDisabled}
                        onPress={() => update('permissions', checked ? form.permissions.filter((x) => x !== p) : [...form.permissions, p])}
                        style={{ minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: permDisabled ? 0.55 : 1 }}
                      >
                        <View
                          style={{
                            width: 24,
                            height: 24,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 1,
                            borderColor: theme.controlBorder,
                            borderRadius: 6,
                            backgroundColor: checked ? theme.primary : theme.surface,
                          }}
                        >
                          {checked ? <Check size={16} color="white" /> : <Square size={15} color={theme.muted} />}
                        </View>
                        <Text style={{ color: theme.text, flex: 1, fontSize: 14, lineHeight: 20 }}>
                          {ACCESS_PERMISSION_LABELS[p]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </Card>
              ))}
              <Text style={{ color: theme.muted, fontSize: 13 }}>
                Quản lý tài khoản và phân quyền chỉ dành cho quản trị viên. Quyền xóa hợp đồng chỉ áp dụng cho Quản trị viên hoặc Kế toán.
              </Text>
            </>
          )}
          {!!error && <InlineError message={error} />}
          <Button label="Rà soát lưu tài khoản" loading={busy} disabled={pending} onPress={review} />
          {pending && !busy && (
            <Button
              secondary
              label="Đối chiếu tài khoản trong Tài khoản"
              onPress={() => {
                setLeaving(true);
                prevent();
                router.push('/(tabs)/account');
              }}
            />
          )}
          {confirm && (
            <ConfirmEdit
              title="Lưu tài khoản và phân quyền?"
              message={`${form.name} · ${form.login_name || 'Tự sinh tên đăng nhập'}\n${ACCESS_ROLES[form.access_role].label} · ${form.scope_all ? 'Toàn hệ thống' : options.stores.find((s) => s.id === form.store_id)?.name || 'Chưa phân cơ sở'}\n${form.enabled ? 'Cho phép đăng nhập' : 'Khóa đăng nhập'}`}
              confirmLabel="Xác nhận lưu tài khoản"
              onCancel={() => setConfirm(false)}
              onConfirm={() => {
                void save();
              }}
            />
          )}
          {exit && (
            <ConfirmEdit
              title="Rời phần tài khoản?"
              message={pending ? 'Mã gốc được giữ trong Tài khoản để đối chiếu.' : 'Các thay đổi chưa lưu sẽ bị bỏ.'}
              confirmLabel="Rời biểu mẫu tài khoản"
              onCancel={() => setExit(null)}
              onConfirm={() => {
                const repeat = exit;
                setExit(null);
                setLeaving(true);
                prevent();
                repeat();
              }}
            />
          )}
          {issued && <AccountIssuedCredentials value={issued} onClose={() => finishToAccount(savedAccountId || 0)} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
