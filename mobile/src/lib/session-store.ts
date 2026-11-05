import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { MobileSession } from "@himoto/mobile-contract";
import { decodeStoredSession } from "./session-codec";

const KEY = "himoto.mobile.session.v1";
let previewSession: string | null = null;
// Native storage is asynchronous. A late delete from a previous session must
// finish before a new login writes its token.
let pending: Promise<unknown> = Promise.resolve();
function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation);
  pending = result.catch(() => {});
  return result;
}
export const sessionStore = {
  async read(origin: string) {
    return serialize(async () =>
      decodeStoredSession(
        Platform.OS === "web"
          ? previewSession
          : await SecureStore.getItemAsync(KEY),
        origin,
      ),
    );
  },
  async save(
    session: Pick<MobileSession, "token" | "expiresAt">,
    origin: string,
  ) {
    const value = JSON.stringify({
      token: session.token,
      expiresAt: session.expiresAt,
      origin,
    });
    return serialize(async () => {
      if (Platform.OS === "web") previewSession = value;
      else
        await SecureStore.setItemAsync(KEY, value, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
    });
  },
  async clear() {
    return serialize(async () => {
      if (Platform.OS === "web") previewSession = null;
      else await SecureStore.deleteItemAsync(KEY);
    });
  },
};
