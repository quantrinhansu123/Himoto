import { useState } from 'react';
import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CONTACT_STATUSES, HANDLING_STATUSES, type CollectionFollowupView } from '../../../../shared/collection-report';
import { ChoiceField, FormField } from '@/components/form-fields';
import { ConfirmEdit } from '@/components/editor-sheet';
import { KeyboardFormScrollView } from '@/components/keyboard-form-scroll-view';
import { Button, Card, InfoBanner, InlineError, KeyValueRow, StateView } from '@/components/ui';
import { useSession } from '@/providers/session';
import { dateTime, useTheme } from '@/theme';

function Followup({ data, reload }: { data: CollectionFollowupView; reload: () => void }) {
  const { api } = useSession(), theme = useTheme(), cache = useQueryClient();
  const [draft, setDraft] = useState(data.followup), [baseline, setBaseline] = useState(() => JSON.stringify(data.followup)), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [exit, setExit] = useState<(() => void) | null>(null), [leaving, setLeaving] = useState(false);
  const dirty = JSON.stringify(draft) !== baseline;
  const disablePrevention = usePreventRemove(!leaving && (busy || dirty), ({ repeat }) => { if (!busy) setExit(() => repeat); });
  const disabled = !data.can_write || busy;
  async function save() {
    if (disabled) return;
    setBusy(true);
    setError('');
    setNotice('');
    const next = {
      revision: draft.revision, contact_status: draft.contact_status, handling_status: draft.handling_status,
      customer_condition: draft.customer_condition.trim(), notes: draft.notes.trim(),
    };
    try {
      const result = await api!.saveCollectionFollowup(String(data.id), next);
      const updated = { ...next, revision: result.revision };
      setDraft(updated);
      setBaseline(JSON.stringify(updated));
      setNotice('Đã lưu tình trạng khách và lịch sử xử lý.');
      void cache.invalidateQueries({ queryKey: ['collection-report'] });
    } catch (cause) {
      const current = await api!.collectionFollowup(String(data.id)).catch(() => null);
      const saved = current?.followup;
      if (saved && saved.revision === next.revision + 1 && saved.contact_status === next.contact_status &&
          saved.handling_status === next.handling_status && saved.customer_condition === next.customer_condition && saved.notes === next.notes) {
        setDraft(saved);
        setBaseline(JSON.stringify(saved));
        setNotice('Đã đối chiếu. Ghi chú đã được lưu.');
        void cache.invalidateQueries({ queryKey: ['collection-report'] });
      } else setError((cause as Error).message);
    } finally { setBusy(false); }
  }
  const text = { color: theme.text, lineHeight: 22 };
  return <>
    <Card style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={{ ...text, fontSize: 18, fontWeight: '800' }}>HĐ {data.code}</Text>
      {!!draft.updated_at && <KeyValueRow label="Cập nhật gần nhất" value={dateTime(draft.updated_at)} />}
      <ChoiceField label="Liên hệ" value={draft.contact_status} choices={Object.entries(CONTACT_STATUSES).map(([value, label]) => ({ value, label }))}
        disabled={disabled} onChange={value => setDraft(previous => ({ ...previous, contact_status: value as typeof draft.contact_status }))} />
      <ChoiceField label="Xử lý" value={draft.handling_status} choices={Object.entries(HANDLING_STATUSES).map(([value, label]) => ({ value, label }))}
        disabled={disabled} onChange={value => setDraft(previous => ({ ...previous, handling_status: value as typeof draft.handling_status }))} />
      <FormField label="Tình trạng khách" value={draft.customer_condition} maxLength={300} editable={!disabled}
        onChangeText={value => setDraft(previous => ({ ...previous, customer_condition: value }))} />
      <FormField label="Ghi chú liên hệ theo ngày" value={draft.notes} maxLength={3000} multiline editable={!disabled}
        onChangeText={value => setDraft(previous => ({ ...previous, notes: value }))} />
      {!!error && <><InlineError message={error} /><Button size="sm" secondary label="Tải lại ghi chú hiện tại" onPress={reload} /></>}
      {!!notice && <InfoBanner tone="success" message={notice} />}
      {data.can_write && <Button label="Lưu tình trạng khách" loading={busy} disabled={!dirty} onPress={() => { void save(); }} />}
    </Card>
    {exit && <ConfirmEdit title="Bỏ thay đổi tình trạng khách?" message="Các thay đổi ghi chú công nợ chưa được lưu." confirmLabel="Rời màn hình" onCancel={() => setExit(null)} onConfirm={() => { const repeat = exit; setExit(null); setLeaving(true); disablePrevention(); repeat(); }} />}
  </>;
}

function View({ id }: { id: string }) {
  const { api, session } = useSession(), theme = useTheme();
  const query = useQuery({
    queryKey: ['collection-followup', api!.origin, session!.user.id, session!.user.storeId, session!.user.allStores, id],
    queryFn: ({ signal }) => api!.collectionFollowup(id, signal), retry: false,
  });
  const reload = () => { void query.refetch(); };
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: theme.background }}>
    <Stack.Screen options={{ title: 'Tình trạng khách' }} />
    <KeyboardFormScrollView contentContainerStyle={{ padding: 20, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
      {query.isPending ? <StateView title="Đang tải tình trạng khách" loading />
        : query.isError ? <StateView title="Chưa tải được tình trạng khách" message={query.error.message} retry={reload} />
          : <Followup key={query.dataUpdatedAt} data={query.data} reload={reload} />}
    </KeyboardFormScrollView>
  </SafeAreaView>;
}

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>(), { api, session } = useSession();
  if (!api || !session?.user.permissions.includes('contracts.read') || !/^[1-9]\d{0,14}$/.test(id)) {
    return <StateView title="Không mở được tình trạng khách" />;
  }
  return <View key={`${api.origin}:${session.user.id}:${session.user.storeId}:${session.user.allStores}:${id}`} id={id} />;
}
