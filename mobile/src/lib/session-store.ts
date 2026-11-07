import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { MobileSession } from "@himoto/mobile-contract";
import { decodeStoredSession } from "./session-codec";
import type { StoredSession } from './session-codec';

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
const get = () => Platform.OS === 'web' ? Promise.resolve(previewSession) : SecureStore.getItemAsync(KEY);
async function put(value: string) {
  if (Platform.OS === 'web') previewSession = value;
  else await SecureStore.setItemAsync(KEY, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
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
    session: Pick<MobileSession, "token" | "expiresAt"> & Partial<MobileSession>,
    origin: string,
  ) {
    const value = JSON.stringify({
      token: session.token,
      expiresAt: session.expiresAt,
      origin,
      ...(session.user ? { user: session.user, verifiedAt: Date.now() } : {}),
      ...(session.refreshToken ? { refreshToken: session.refreshToken, refreshExpiresAt: session.refreshExpiresAt, sessionId: session.sessionId } : {}),
    });
    return serialize(async () => {
      await put(value);
    });
  },
  /** Compare-and-set prevents a late refresh from restoring a logged-out actor. */
  update(origin: string, expectedToken: string, session: MobileSession) {
    return serialize(async () => {
      const current = decodeStoredSession(await get(), origin);
      if (!current || current.token !== expectedToken) return false;
      await put(JSON.stringify({ ...session, origin, verifiedAt: Date.now(),
        ...(session.token === expectedToken && current.rotationId ? { rotationId: current.rotationId } : {}),
      }));
      return true;
    });
  },
  rotation(origin: string, expectedToken: string, makeId: () => string): Promise<StoredSession | null> {
    return serialize(async () => {
      const current = decodeStoredSession(await get(), origin);
      if (!current || current.token !== expectedToken || !current.refreshToken) return null;
      const reserved = { ...current, rotationId: current.rotationId || makeId() };
      await put(JSON.stringify(reserved));
      return reserved;
    });
  },
  clearFamily(origin: string, family: string) {
    return serialize(async () => {
      const current = decodeStoredSession(await get(), origin);
      if (!current || (current.sessionId || current.token) !== family) return false;
      if (Platform.OS === 'web') previewSession = null;
      else await SecureStore.deleteItemAsync(KEY);
      return true;
    });
  },
  async clear() {
    return serialize(async () => {
      if (Platform.OS === "web") previewSession = null;
      else await SecureStore.deleteItemAsync(KEY);
    });
  },
};
