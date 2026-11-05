import { Platform, Share } from "react-native";
import { uuid } from "expo";
import * as FileSystem from "expo-file-system/legacy";
import { isMobileFileExport, type MobileFileExport } from "../../../shared/mobile-export";
export type CsvSaveResult = "saved" | "shared" | "cancelled";
export async function saveCsvFile(file: MobileFileExport, isCurrent: () => boolean): Promise<CsvSaveResult> {
  if (!isMobileFileExport(file)) throw Error("Nội dung file xuất chưa hợp lệ.");
  const content = "contentBase64" in file ? file.contentBase64 : file.content, encoding = "contentBase64" in file ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8;
  if (!isCurrent()) return "cancelled";
  if (Platform.OS === "android") {
    let destination: Awaited<ReturnType<typeof FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync>>;
    try {
      // Android 9's Downloads provider can return a readable but unwritable raw tree.
      // Start in the device storage provider; the user still chooses the destination.
      destination = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(FileSystem.StorageAccessFramework.getUriForDirectoryInRoot("Download"));
    } catch { throw Error("Chưa mở được bộ chọn thư mục. Thử lại."); }
    if (!destination.granted || !isCurrent()) return "cancelled";
    let created: string | null = null;
    try {
      created = await FileSystem.StorageAccessFramework.createFileAsync(destination.directoryUri, file.filename, file.mimeType);
      if (!isCurrent()) return "cancelled";
      await FileSystem.writeAsStringAsync(created, content, { encoding });
      if (await FileSystem.readAsStringAsync(created, { encoding }) !== content) throw Error("Chưa xác minh được nội dung file đã lưu.");
      created = null;
      return "saved";
    } catch { throw Error("Chưa lưu được file vào thư mục này. Chọn thư mục khác trong Bộ nhớ trong và thử lại."); }
    finally {
      // Only the just-created file is removed on cancellation/failure, never its folder.
      if (created) await FileSystem.deleteAsync(created, { idempotent: true }).catch(() => {});
    }
  }
  if (Platform.OS !== "ios" || !FileSystem.cacheDirectory) throw Error("Thiết bị chưa hỗ trợ lưu file xuất.");
  const directory = FileSystem.cacheDirectory + `himoto-exports/${uuid.v4().toLowerCase()}/`, uri = directory + file.filename;
  try {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    if (!isCurrent()) return "cancelled";
    await FileSystem.writeAsStringAsync(uri, content, { encoding });
    if (!isCurrent()) return "cancelled";
    const result = await Share.share({ url: uri, title: file.filename });
    return result.action === Share.dismissedAction ? "cancelled" : "shared";
  } catch { throw Error("Chưa chia sẻ được file xuất. Kiểm tra nơi nhận file và thử lại."); }
  finally { await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}); await FileSystem.deleteAsync(directory, { idempotent: true }).catch(() => {}); }
}
