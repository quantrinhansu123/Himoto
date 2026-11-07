import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Fingerprint, ShieldCheck } from 'lucide-react-native';
import { biometricLock } from '@/lib/biometric-lock';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';
import { Button, InlineError } from './ui';

export function BiometricGate({ children }: PropsWithChildren) {
  const { api, session, logout } = useSession(), theme = useTheme();
  const actor = api && session ? `${api.origin}:${session.user.id}:${session.sessionId || session.token}` : '';
  const [gate, setGate] = useState({ actor: '', ready: false, enabled: false, locked: false });
  const [privacy, setPrivacy] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const authenticating = useRef(false), backgroundAt = useRef(0), latestActor = useRef(actor), autoPrompt = useRef('');
  useEffect(() => { latestActor.current = actor; }, [actor]);
  useEffect(() => {
    if (!api || !session || Platform.OS === 'web') return;
    let alive = true;
    const load = async () => {
      try {
        const enabled = await biometricLock.enabled(api.origin, session.user.id);
        if (alive) setGate(old => ({ actor, ready: true, enabled, locked: enabled && (old.actor === actor ? old.locked : !biometricLock.hasPasswordProof(api.origin, session.sessionId || session.token)) }));
      } catch { if (alive) { setGate({ actor, ready: true, enabled: true, locked: true }); setError('Không đọc được cài đặt bảo vệ phiên. Thử mở khóa để tiếp tục.'); } }
    };
    void load(); const unsubscribe = biometricLock.subscribe(() => { void load(); });
    return () => { alive = false; unsubscribe(); };
  }, [api, session, actor]);
  const unlock = useCallback(async () => {
    if (authenticating.current) return;
    authenticating.current = true; setBusy(true); setError(''); const at = latestActor.current;
    try { await biometricLock.authenticate(); if (at === latestActor.current) setGate(old => ({ ...old, locked: false })); }
    catch (cause) { if (at === latestActor.current) setError((cause as Error).message); }
    finally { authenticating.current = false; setBusy(false); }
  }, []);
  useEffect(() => {
    if (gate.actor === actor && gate.ready && gate.enabled && gate.locked && autoPrompt.current !== actor) {
      autoPrompt.current = actor; void unlock();
    }
  }, [actor, gate, unlock]);
  useEffect(() => {
    if (!gate.enabled) return;
    const listener = AppState.addEventListener('change', state => {
      if (authenticating.current) return;
      if (state !== 'active') {
        if (!backgroundAt.current) backgroundAt.current = Date.now();
        setPrivacy(true);
      } else {
        setPrivacy(false);
        if (backgroundAt.current && Date.now() - backgroundAt.current >= 60000) {
          autoPrompt.current = ''; setGate(old => ({ ...old, locked: true }));
        }
        backgroundAt.current = 0;
      }
    });
    return () => listener.remove();
  }, [gate.enabled]);
  const blocked = Platform.OS !== 'web' && !!actor && (gate.actor !== actor || !gate.ready || gate.enabled && (gate.locked || privacy));
  return <View style={{ flex: 1 }}>
    <View style={{ flex: 1 }} importantForAccessibility={blocked ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={blocked}>{children}</View>
    {blocked && <Modal visible animationType="none" presentationStyle="fullScreen" supportedOrientations={['portrait', 'landscape']} onRequestClose={() => {}} accessibilityViewIsModal>
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
      <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center', gap: 20 }}>
        <ShieldCheck size={42} color={theme.primary} accessible={false}/>
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 30, fontWeight: '800' }}>Himoto đã khóa</Text>
        <Text style={{ color: theme.muted, fontSize: 16, lineHeight: 25 }}>Xác thực bằng Face ID, vân tay hoặc mã khóa thiết bị để tiếp tục. Bản đang nhập được giữ nguyên.</Text>
        <Fingerprint size={48} color={theme.muted} accessible={false}/>
        <Button label="Mở khóa để tiếp tục" disabled={gate.actor !== actor || !gate.ready} loading={busy} onPress={() => { void unlock(); }}/>
        <Button secondary label="Đăng nhập lại bằng mật khẩu" disabled={busy} onPress={() => {
          setBusy(true); void logout().catch(() => setError('Cần có mạng để kết thúc phiên an toàn và đăng nhập lại. Bản đang soạn vẫn được giữ.')).finally(() => setBusy(false));
        }}/>
        {!!error && <InlineError message={error}/>}
      </View>
      </ScrollView>
    </SafeAreaView>
    </Modal>}
  </View>;
}
