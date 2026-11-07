import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const listeners = new Set<() => void>();
const passwordProof = new Map<string, number>();
const key = (origin: string, userId: number) => `himoto.biometric.v1.${encodeURIComponent(origin).replace(/%/g, '_')}.${userId}`;
export const biometricLock = {
  notePasswordLogin(origin: string, family: string) { passwordProof.set(`${origin}:${family}`, Date.now()); },
  hasPasswordProof(origin: string, family: string) {
    const at = passwordProof.get(`${origin}:${family}`);
    return at !== undefined && Date.now() - at < 5 * 60 * 1000;
  },
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  async enabled(origin: string, userId: number) {
    return Platform.OS !== 'web' && await SecureStore.getItemAsync(key(origin, userId)) === 'enabled';
  },
  async authenticate() {
    if (Platform.OS === 'web' || !await LocalAuthentication.hasHardwareAsync() || !await LocalAuthentication.isEnrolledAsync())
      throw new Error('Thiết bị chưa có Face ID/vân tay. Thiết lập sinh trắc học trong cài đặt thiết bị trước.');
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Mở khóa Himoto', cancelLabel: 'Hủy', fallbackLabel: 'Dùng mã khóa thiết bị',
      disableDeviceFallback: false, biometricsSecurityLevel: 'strong',
    });
    if (!result.success) throw new Error(result.error === 'user_cancel' || result.error === 'system_cancel' ? 'Đã hủy mở khóa. Dữ liệu đang nhập vẫn được giữ.' : 'Chưa xác thực được. Thử lại hoặc dùng mã khóa thiết bị.');
  },
  async set(origin: string, userId: number, enabled: boolean, family: string) {
    if (enabled || !this.hasPasswordProof(origin, family)) await this.authenticate();
    if (enabled) await SecureStore.setItemAsync(key(origin, userId), 'enabled', { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
    else await SecureStore.deleteItemAsync(key(origin, userId));
    listeners.forEach(listener => listener());
  },
};
