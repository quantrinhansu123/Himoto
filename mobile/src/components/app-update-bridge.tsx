import { useEffect, useRef } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { useTheme } from '@/theme';

export function AppUpdateBridge() {
  const theme = useTheme(), state = Updates.useUpdates(), running = useRef(false), lastCheck = useRef(0);
  useEffect(() => {
    if (__DEV__ || Platform.OS === 'web' || !Updates.isEnabled) return;
    async function check() {
      if (running.current || Date.now() - lastCheck.current < 5 * 60_000) return;
      running.current = true; lastCheck.current = Date.now();
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) await Updates.fetchUpdateAsync();
      } catch { /* Retry on the next foreground; an update outage must not interrupt work. */ }
      finally { running.current = false; }
    }
    // Let Expo finish its startup check before making an additional request.
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') void check(); });
    return () => subscription.remove();
  }, []);
  if (__DEV__ || Platform.OS === 'web' || !state.isUpdatePending) return null;
  // Never reload automatically while an employee is entering a transaction.
  return <View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: theme.tint }}>
    <Text accessibilityLiveRegion="polite" style={{ color: theme.text, fontSize: 13, lineHeight: 19 }}>Đã tải bản cập nhật mới. Mở lại ứng dụng hoặc vào Tài khoản để áp dụng.</Text>
  </View>;
}
