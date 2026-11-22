import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react-native';
import { useSession } from '@/providers/session';
import { notifySePaySound } from '@/lib/sepay-notification-sound';
import { money, useTheme } from '@/theme';

function LiveNotice({ userId }: { userId: number }) {
  const { api } = useSession(), cache = useQueryClient(), theme = useTheme();
  const [message, setMessage] = useState('');
  const cursor = useRef<number | undefined>(undefined);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    async function poll() {
      if (busy || AppState.currentState !== 'active' || controller.signal.aborted) return;
      busy = true;
      try {
        const rows = await api!.sepayEvents(cursor.current ?? 0, controller.signal);
        if (controller.signal.aborted) return;
        const previous = cursor.current;
        cursor.current = Math.max(previous ?? 0, ...rows.map(row => row.id));
        if (previous === undefined || !rows.length) return;
        const row = rows[0];
        setMessage(`${row.mode === 'test' ? 'Demo SePay' : 'Đã nhận tiền'} · ${money(row.amount)} · HĐ ${row.code}${rows.length > 1 ? ` và ${rows.length - 1} giao dịch khác` : ''}`);
        void notifySePaySound(userId, controller.signal).catch(() => {});
        void cache.invalidateQueries({ queryKey: ['sepay-events'] });
        if (rows.some(receipt => receipt.mode === 'live')) {
          for (const name of ['record', 'catalogue', 'finance', 'cashbook', 'cashbook-accounts', 'contract-history']) void cache.invalidateQueries({ queryKey: [name] });
        }
      } catch {
        // The next foreground poll retries the read after a network interruption.
      } finally { busy = false; }
    }
    const timer = setInterval(() => { void poll(); }, 12000);
    const state = AppState.addEventListener('change', value => { if (value === 'active') void poll(); });
    void poll();
    return () => { controller.abort(); clearInterval(timer); state.remove(); };
  }, [api, cache, userId]);
  if (!message) return null;
  return <SafeAreaView edges={['top', 'left', 'right']} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10, backgroundColor: theme.tint }}>
    <Pressable accessibilityRole="button" onPress={() => { setMessage(''); router.push('/payment-events'); }} style={{ flex: 1, paddingVertical: 12 }}>
      <Text accessibilityLiveRegion="polite" style={{ color: theme.text, lineHeight: 21, fontWeight: '600' }}>{message}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Đóng thông báo tiền về" onPress={() => setMessage('')}
      style={{ minHeight: 48, minWidth: 48, justifyContent: 'center', alignItems: 'center' }}>
      <X size={20} color={theme.text} accessible={false} />
    </Pressable>
  </SafeAreaView>;
}

export function SePayNotice() {
  const { api, session } = useSession();
  if (!api || !session?.user.permissions.some(p => p === 'contracts.read' || p === 'finance.read')) return null;
  return <LiveNotice key={`${api.origin}:${session.user.id}:${session.user.storeId}:${session.user.allStores}`} userId={session.user.id} />;
}
