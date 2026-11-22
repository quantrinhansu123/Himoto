import * as Clipboard from "expo-clipboard";

export async function copyText(value: string): Promise<boolean> {
  if (!value) return false;
  try {
    await Clipboard.setStringAsync(value);
    return true;
  } catch {
    return false;
  }
}
