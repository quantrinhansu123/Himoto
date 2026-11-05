import { useEffect } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/providers/session';
import { enableNativePush, nativePushConfigured, notificationsModule } from '@/lib/push-notifications';

export function NotificationBridge() {
  const {api, session} = useSession(), client = useQueryClient();
  useEffect(() => {
    if (!nativePushConfigured) return;
    let disposed = false;
    const cleanup: (() => void)[] = [];
    void notificationsModule().then(async n => {
      if (disposed) return;
      n.setNotificationHandler({handleNotification: async () => ({shouldShowBanner: !!api && !disposed,
        shouldShowList: !!api && !disposed,shouldPlaySound: !!api && !disposed,shouldSetBadge: false})});
      if (!api) { await n.dismissAllNotificationsAsync(); await n.clearLastNotificationResponseAsync(); return; }
      const refresh = () => { void client.invalidateQueries({queryKey:['notifications']}); };
      const response = () => { if (!disposed) { refresh(); router.push('/notifications'); } };
      const a = n.addNotificationReceivedListener(refresh);
      const b = n.addNotificationResponseReceivedListener(event => {
        if (event.notification.request.content.data?.screen === 'notifications') response();
      });
      cleanup.push(() => a.remove(), () => b.remove());
      const last = await n.getLastNotificationResponseAsync();
      if (!disposed && last?.notification.request.content.data?.screen === 'notifications') {
        await n.clearLastNotificationResponseAsync(); response();
      }
      const register = async () => {
        const status = await api.pushStatus();
        if (!disposed && status.enabled) await enableNativePush(api, false);
      };
      const c = n.addPushTokenListener(token => {
        if (!disposed && token.type === 'android' && typeof token.data === 'string')
          void api.pushStatus().then(s => !disposed && s.enabled ? api.enablePush(token.data as string) : undefined).catch(() => {});
      });
      cleanup.push(() => c.remove());
      const d = AppState.addEventListener('change', state => { if (state === 'active') void register().catch(() => {}); });
      cleanup.push(() => d.remove());
      await register();
    }).catch(() => {});
    return () => { disposed = true; cleanup.forEach(f => f()); };
  }, [api, session?.token, client]);
  return null;
}
