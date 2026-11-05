import { isMobileFileExport, type MobileFileExport } from "../../../shared/mobile-export";
export type CsvSaveResult = "saved" | "shared" | "cancelled";
export async function saveCsvFile(file: MobileFileExport, isCurrent: () => boolean): Promise<CsvSaveResult> {
  if (!isMobileFileExport(file)) throw Error("Nội dung file xuất chưa hợp lệ.");
  if (!isCurrent()) return "cancelled";
  const content = "contentBase64" in file ? Uint8Array.from(atob(file.contentBase64), character => character.charCodeAt(0)) : file.content;
  const url = URL.createObjectURL(new Blob([content], { type: file.mimeType === "text/csv" ? "text/csv;charset=utf-8" : file.mimeType }));
  try {
    const link = document.createElement("a"); link.href = url; link.download = file.filename; link.click();
    return "saved";
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
