import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { nativePushConfigured, notificationsModule } from './push-notifications';

const channelId = 'himoto-sepay';
const soundKey = (userId: number) => `himoto.mobile.sepay-sound.v1.${userId}`;

export async function readSePaySound(userId: number) {
  return nativePushConfigured && await SecureStore.getItemAsync(soundKey(userId)) === 'on';
}

export async function setSePaySound(userId: number, enabled: boolean) {
  if (!enabled) {
    await SecureStore.deleteItemAsync(soundKey(userId));
    return;
  }
  const notifications = await notificationsModule();
  await notifications.setNotificationChannelAsync(channelId, {
    name: 'Tiền về SePay', importance: notifications.AndroidImportance.DEFAULT, sound: 'default',
    lockscreenVisibility: notifications.AndroidNotificationVisibility.PRIVATE,
  });
  let permission = await notifications.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) permission = await notifications.requestPermissionsAsync();
  if (!permission.granted) throw Error('Bật quyền thông báo cho Himoto trong cài đặt điện thoại.');
  await SecureStore.setItemAsync(soundKey(userId), 'on');
}

export async function notifySePaySound(userId: number, signal: AbortSignal) {
  if (!await readSePaySound(userId)) return;
  const notifications = await notificationsModule();
  if (!(await notifications.getPermissionsAsync()).granted || signal.aborted || AppState.currentState !== 'active') return;
  await notifications.scheduleNotificationAsync({
    identifier: 'himoto-sepay-receipt',
    content: { title: 'Tiền về SePay', body: 'Mở Himoto để xem giao dịch.', sound: 'default', data: { screen: 'payment-events' } },
    trigger: { channelId },
  });
}
