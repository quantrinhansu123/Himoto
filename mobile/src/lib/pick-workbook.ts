import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { requireOptionalNativeModule } from 'expo';
export interface PickedWorkbook { name: string; bytes: Uint8Array<ArrayBuffer> }
export async function pickWorkbook(): Promise<PickedWorkbook | null> {
  if (Platform.OS !== 'web' && !requireOptionalNativeModule('ExpoDocumentPicker')) throw Error('Cập nhật Himoto để chọn file Excel.');
  const Picker = await import('expo-document-picker'), result = await Picker.getDocumentAsync({ type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0]; let owned: File | null = null;
  try {
    if (!asset.name || !/\.xlsx$/i.test(asset.name)) throw Error('Chỉ nhận file Excel .xlsx.');
    if (asset.size !== undefined && (asset.size <= 0 || asset.size > 5 * 1024 * 1024)) throw Error('File phải có dữ liệu và không vượt quá 5 MB.');
    let bytes: Uint8Array;
    if (Platform.OS === 'web') { if (!asset.file) throw Error('Chọn lại file Excel từ thiết bị.'); bytes = new Uint8Array(await asset.file.arrayBuffer()); }
    else { const source = new File(asset.uri); if (source.uri.startsWith(Paths.cache.uri + 'DocumentPicker/')) owned = source; if (!source.exists || source.size <= 0 || source.size > 5 * 1024 * 1024) throw Error('File phải có dữ liệu và không vượt quá 5 MB.'); bytes = await source.bytes(); }
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw Error('File phải có dữ liệu và không vượt quá 5 MB.');
    return { name: asset.name, bytes: Uint8Array.from(bytes) };
  } finally { try { owned?.delete(); } catch { /* Only an app-owned picker cache copy can be removed. */ } }
}
