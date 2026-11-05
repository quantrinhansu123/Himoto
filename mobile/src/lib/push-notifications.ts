import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { MobileApi } from './api';
export const nativePushConfigured = Platform.OS === 'android' && Constants.expoConfig?.extra?.androidPushConfigured === true;
// Lazy loading lets the existing development binary keep running until the
// owner-configured native release has been built and installed.
export const notificationsModule = () => import('expo-notifications');
export async function enableNativePush(api: MobileApi, requestPermission: boolean) {
  if (!nativePushConfigured) throw new Error('Bản cài này chưa hỗ trợ thông báo đẩy. Vui lòng cập nhật Himoto.');
  const n = await notificationsModule();
  await n.setNotificationChannelAsync('himoto-work', {name: 'Công việc Himoto', importance: n.AndroidImportance.DEFAULT,
    lockscreenVisibility: n.AndroidNotificationVisibility.PRIVATE});
  let permission = await n.getPermissionsAsync();
  if (!permission.granted && requestPermission && permission.canAskAgain) permission = await n.requestPermissionsAsync();
  if (!permission.granted) throw new Error('Chưa được phép thông báo. Mở Cài đặt điện thoại → Himoto → Thông báo để bật.');
  let token: Awaited<ReturnType<typeof n.getDevicePushTokenAsync>>;
  try {token = await n.getDevicePushTokenAsync();}
  catch {throw new Error('Chưa kết nối được dịch vụ thông báo. Kiểm tra mạng và thử lại.');}
  if (token.type !== 'android' || typeof token.data !== 'string') throw new Error('Chưa đăng ký được thiết bị. Vui lòng thử lại.');
  return api.enablePush(token.data);
}
