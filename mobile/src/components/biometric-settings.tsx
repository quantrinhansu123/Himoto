import { useEffect, useState } from 'react';
import { Platform, Text } from 'react-native';
import { Fingerprint } from 'lucide-react-native';
import { useSession } from '@/providers/session';
import { biometricLock } from '@/lib/biometric-lock';
import { useTheme } from '@/theme';
import { Button, Card, InlineError } from './ui';

export function BiometricSettings() {
  const { api, session } = useSession(), theme = useTheme();
  const [enabled, setEnabled] = useState(false), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    if (!api || !session || Platform.OS === 'web') return;
    let alive = true;
    void biometricLock.enabled(api.origin, session.user.id).then(value => { if (alive) { setEnabled(value); setReady(true); } }).catch(() => { if (alive) setError('Không đọc được cài đặt mở khóa trên thiết bị.'); });
    return () => { alive = false; };
  }, [api, session]);
  async function toggle() {
    if (!api || !session || busy) return;
    setBusy(true); setError('');
    try { await biometricLock.set(api.origin, session.user.id, !enabled, session.sessionId || session.token); setEnabled(!enabled); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  if (Platform.OS === 'web') return null;
  return <Card style={{ gap: 12 }}>
    <Fingerprint size={28} color={theme.primary} accessible={false}/>
    <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 19, fontWeight: '700' }}>Mở khóa bằng Face ID / vân tay</Text>
    <Text style={{ color: theme.muted, fontSize: 15, lineHeight: 24 }}>{enabled ? 'Đang bật. Xác thực khi mở app hoặc quay lại sau 1 phút.' : 'Bảo vệ phiên làm việc trên thiết bị mà không phải nhập lại mật khẩu hằng ngày.'}</Text>
    <Button secondary label={enabled ? 'Tắt khóa sinh trắc học' : 'Bật Face ID / vân tay'} disabled={!ready} loading={busy} onPress={() => { void toggle(); }}/>
    {!!error && <InlineError message={error}/>}
  </Card>;
}
