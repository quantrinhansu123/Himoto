import { Platform } from 'react-native';
import { uuid } from 'expo';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { createOfflineStore, type OfflineStore } from './offline-store';
import { offlineStatus } from './offline-status';

let opening: Promise<OfflineStore> | undefined;
export function openOfflineStore(): Promise<OfflineStore> {
  if (Platform.OS === 'web') return Promise.reject(new Error('Offline lưu bền vững chỉ hỗ trợ trên ứng dụng điện thoại.'));
  if (!opening) opening = (async () => {
    const keyName = 'himoto.mobile.offline-key.v1';
    let key = await SecureStore.getItemAsync(keyName);
    if (!key) {
      key = (uuid.v4() + uuid.v4()).replace(/-/g, '');
      await SecureStore.setItemAsync(keyName, key, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
    }
    if (!/^[0-9a-f]{64}$/.test(key)) throw new Error('Không mở được kho dữ liệu offline an toàn.');
    const db = await SQLite.openDatabaseAsync('himoto-offline-v1.db');
    if (!await db.getFirstAsync('PRAGMA cipher_version')) {
      await db.closeAsync();
      throw new Error('Bản ứng dụng chưa có cơ sở dữ liệu offline mã hóa. Cần cài bản Android mới.');
    }
    await db.execAsync(`PRAGMA key = '${key}';`);
    return createOfflineStore(db, () => offlineStatus.changed());
  })().catch(error => { opening = undefined; throw error; });
  return opening;
}
