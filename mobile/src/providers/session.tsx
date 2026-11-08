import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState, Platform } from "react-native";
import * as Device from "expo-device";
import * as Network from 'expo-network';
import type { MobileSession } from "@himoto/mobile-contract";
import { ApiError, apiOrigin, createApi, type MobileApi } from "@/lib/api";
import { sessionStore } from "@/lib/session-store";
import { pendingWrites } from "@/lib/pending-writes";
import {installDraftWorkLedgerGuard} from "@/lib/draft-work-links";
import { openOfflineStore } from '@/lib/offline-native';
import { createOfflineTransport } from '@/lib/offline-transport';
import { offlineScopeKey, OFFLINE_TTL } from '@/lib/offline-policy';
import { offlineStatus } from '@/lib/offline-status';
import { syncOffline } from '@/lib/offline-sync';
import { registerOfflineBackground } from '@/lib/offline-background';
import type { OfflineStore } from '@/lib/offline-store';
import type { StoredSession } from '@/lib/session-codec';
import { freshSession, rememberAccess, sessionAccess, sessionFamily } from '@/lib/session-refresh';
import { offlineAccessGuard } from '@/lib/offline-auth';
import { biometricLock } from '@/lib/biometric-lock';
import { cachedMobileSession } from '@/lib/session-bootstrap';
import { restoreLookupQueries, persistLookupQueries } from '@/lib/query-persistence';
import { Image } from 'expo-image';
installDraftWorkLedgerGuard(pendingWrites);

interface SessionContextValue {
  session: MobileSession | null;
  api: MobileApi | null;
  restoring: boolean;
  restoreError: string;
  restore: (quiet?: boolean) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}
const Context = createContext<SessionContextValue | null>(null);
export function SessionProvider({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            networkMode: 'always',
            staleTime: 30000,
            gcTime: 300000,
            refetchOnWindowFocus: true,
            retry: (count, error) =>
              count < 1 &&
              error instanceof ApiError &&
              (error.status === 0 || error.status >= 500),
          },
        },
      }),
  );
  const [session, setSession] = useState<MobileSession | null>(null);
  const [offlineStore, setOfflineStore] = useState<OfflineStore | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState("");
  const generation = useRef(0);
  const origin = useMemo(() => {
    try {
      return {
        value: apiOrigin(process.env.EXPO_PUBLIC_API_URL, __DEV__),
        error: "",
      };
    } catch (error) {
      return { value: "", error: (error as Error).message };
    }
  }, []);
  const currentSession = useRef(session);
  const lookupScope = useRef<string | null>(null);
  const stopPersistence = useRef<(() => void) | null>(null);
  const lastVerified = useRef(0);
  const activateLookups = useCallback(async (user: MobileSession['user'], local: OfflineStore, active: () => boolean) => {
    const scope = offlineScopeKey({ origin: origin.value, user });
    if (lookupScope.current === scope) return;
    stopPersistence.current?.();
    lookupScope.current = scope;
    queryClient.clear();
    void Image.clearMemoryCache().catch(() => {});
    await restoreLookupQueries(queryClient, local, scope, () => active() && lookupScope.current === scope);
    if (active() && lookupScope.current === scope)
      stopPersistence.current = persistLookupQueries(queryClient, local, scope, () => lookupScope.current === scope);
  }, [origin.value, queryClient]);
  useEffect(() => () => { stopPersistence.current?.(); }, []);
  const expire = useCallback(
    (token?: string) => {
      if (token && currentSession.current?.token !== token) return;
      const previous = currentSession.current;
      lookupScope.current = null;
      stopPersistence.current?.();
      void Image.clearMemoryCache().catch(() => {});
      if (previous) void openOfflineStore().then(store => store.clearCache(offlineScopeKey({ origin: origin.value, user: previous.user }))).catch(() => {});
      offlineStatus.update({ cachedAt: null, verifying: false });
      currentSession.current = null;
      const expiredGeneration = ++generation.current;
      queryClient.clear();
      setSession(null);
      setRestoring(false);
      pendingWrites.detach();
      void (previous ? sessionStore.clearFamily(origin.value, sessionFamily(previous)) : sessionStore.clear()).catch(() => {
        if (expiredGeneration === generation.current)
          setRestoreError("Không xóa được phiên đã hết hạn. Vui lòng thử lại.");
      });
    },
    [queryClient, origin.value],
  );
  const restore = useCallback(
    async (quiet = false) => {
      const current = ++generation.current;
      if (!quiet) {
        setRestoring(true);
        setRestoreError("");
      }
      let stored: StoredSession | null = null;
      let local: OfflineStore | null = null;
      try {
        if (origin.error) throw new Error(origin.error);
        if (Platform.OS !== 'web') {
          local = await openOfflineStore().catch(error => {
            offlineStatus.update({ error: (error as Error).message }); return null;
          });
          if (current !== generation.current) return;
          setOfflineStore(local);
        }
        stored = await sessionStore.read(origin.value);
        if (current !== generation.current) return;
        if (!stored) {
          lookupScope.current = null;
          stopPersistence.current?.();
          await sessionStore.clear();
          currentSession.current = null;
          queryClient.clear();
          setSession(null);
          return;
        }
        const bootstrap = cachedMobileSession(stored);
        if (bootstrap && !currentSession.current) {
          if (local) await activateLookups(bootstrap.user, local, () => current === generation.current);
          if (current !== generation.current) return;
          currentSession.current = bootstrap;
          setSession(bootstrap);
          setRestoring(false);
          offlineStatus.update({ verifying: true });
        }
        if (bootstrap && !offlineStatus.get().connected) {
          offlineStatus.update({ cachedAt: stored.verifiedAt!, verifying: false });
          return;
        }
        const credentials = await freshSession(origin.value, sessionFamily(stored));
        const fresh = await createApi(origin.value, credentials.token, undefined, undefined, sessionAccess(origin.value, credentials)).session();
        if (current !== generation.current) return;
        if (
          JSON.stringify(currentSession.current?.user ?? stored.user) !==
          JSON.stringify(fresh.user)
        )
          { queryClient.clear(); await openOfflineStore().then(store => store.clearCache()).catch(() => {}); }
        const latest = await sessionStore.read(origin.value);
        if (!latest || sessionFamily(latest) !== sessionFamily(credentials)) return;
        const updated = { ...latest, ...fresh };
        if (!await sessionStore.update(origin.value, latest.token, updated)) return;
        const previous = currentSession.current;
        const restored: MobileSession = { user: updated.user, expiresAt: updated.expiresAt,
          token: previous && sessionFamily(previous) === sessionFamily(updated) ? previous.token : updated.token,
          ...(updated.refreshToken ? { refreshToken: updated.refreshToken, refreshExpiresAt: updated.refreshExpiresAt, sessionId: updated.sessionId } : {}),
        };
        if (local) await activateLookups(restored.user, local, () => current === generation.current);
        if (current !== generation.current) return;
        lastVerified.current = Date.now();
        currentSession.current = restored;
        setSession(previous => JSON.stringify(previous) === JSON.stringify(restored) ? previous : restored);
        setRestoreError('');
        const recovering = !offlineStatus.get().connected || offlineStatus.get().cachedAt !== null;
        offlineStatus.update({ connected: true, verifying: false });
        if (recovering) {
          const cacheEpoch = offlineStatus.get().cacheEpoch;
          void queryClient.invalidateQueries().then(() => {
            if (cacheEpoch === offlineStatus.get().cacheEpoch && offlineStatus.get().connected) offlineStatus.update({ cachedAt: null });
          });
        }
      } catch (error) {
        if (current !== generation.current) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) expire();
        else if (error instanceof ApiError && (error.status === 0 || error.status >= 500) && stored?.user && stored.verifiedAt && Date.now() - stored.verifiedAt < OFFLINE_TTL) {
          const previous = currentSession.current;
          const restored: MobileSession = { user: stored.user, expiresAt: stored.expiresAt,
            token: previous && sessionFamily(previous) === sessionFamily(stored) ? previous.token : stored.token,
            ...(stored.refreshToken ? { refreshToken: stored.refreshToken, refreshExpiresAt: stored.refreshExpiresAt, sessionId: stored.sessionId } : {}),
          };
          currentSession.current = restored;
          setSession(previous => JSON.stringify(previous) === JSON.stringify(restored) ? previous : restored);
          setRestoreError('');
          offlineStatus.update({ connected: false, verifying: false, cachedAt: stored.verifiedAt });
        }
        else if (stored?.verifiedAt && Date.now() - stored.verifiedAt >= OFFLINE_TTL) setRestoreError('Đã quá 24 giờ chưa xác thực phiên. Kết nối mạng và thử lại để tiếp tục; bản đang soạn vẫn được giữ.');
        else if (!quiet) setRestoreError((error as Error).message);
      } finally {
        if (current === generation.current) offlineStatus.update({ verifying: false });
        if (!quiet && current === generation.current) setRestoring(false);
      }
    },
    [origin, queryClient, expire, activateLookups],
  );
  const restoreRef = useRef(restore);
  useEffect(() => {
    restoreRef.current = restore;
  }, [restore]);
  useEffect(() => {
    void restoreRef.current();
  }, []);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let alive = true;
    const update = (state: Network.NetworkState) => {
      if (!alive) return;
      const connected = state.isConnected !== false;
      offlineStatus.update({ connected });
      if (connected && currentSession.current && !offlineStatus.get().verifying) void restoreRef.current(true);
    };
    void Network.getNetworkStateAsync().then(update).catch(() => {});
    const subscription = Network.addNetworkStateListener(update);
    return () => { alive = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = AppState.addEventListener("change", (state) => {
      focusManager.setFocused(state === "active");
      if (state === "active" && currentSession.current)
        void restoreRef.current(true);
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => {
      if (Date.parse(session.refreshExpiresAt || session.expiresAt) <= Date.now()) expire(session.token);
    }, 30000);
    return () => clearInterval(timer);
  }, [session, expire]);
  const api = useMemo(() => {
    if (!session) return null;
    const scope = offlineScopeKey({ origin: origin.value, user: session.user });
    const active = offlineAccessGuard(origin.value, session);
    return createApi(origin.value, session.token, undefined, offlineStore ? createOfflineTransport(offlineStore, scope, active) : undefined, sessionAccess(origin.value, session));
  }, [origin.value, session, offlineStore]);
  useEffect(() => {
    if (!session || !offlineStore) return;
    let alive = true;
    let inFlight = false;
    void registerOfflineBackground().catch(() => offlineStatus.update({ error: 'Chưa bật được đồng bộ nền. App vẫn đồng bộ khi đang mở.' }));
    const sync = async () => {
      if (!alive || inFlight || AppState.currentState !== 'active' || offlineStatus.get().verifying) return;
      if (!offlineStatus.get().connected) {
        inFlight = true;
        try {
          if (currentSession.current) await restoreRef.current(true);
        } catch {
          // Still offline, retry on next interval
        } finally {
          inFlight = false;
        }
        return;
      }
      inFlight = true;
      const before = offlineStatus.get().revision;
      try {
        const rows = await offlineStore.listActor(origin.value, session.user.id);
        if (rows.some(row => row.state === 'queued' || row.state === 'sending')) await syncOffline(origin.value);
        if (alive && currentSession.current?.token === session.token) {
          if (offlineStatus.get().revision !== before) void queryClient.invalidateQueries();
          if (offlineStatus.get().revision !== before || Date.now() - lastVerified.current > 60_000) await restoreRef.current(true);
        }
      } finally { inFlight = false; }
    };
    void sync();
    const timer = setInterval(() => { void sync(); }, 10000);
    const unsubscribe = offlineStatus.subscribe(() => {
      if (offlineStatus.get().connected) void sync();
    });
    return () => { alive = false; clearInterval(timer); unsubscribe(); };
  }, [session, offlineStore, origin.value, queryClient]);
  useEffect(
    () => api?.onSessionExpired(() => expire(session?.token)),
    [api, expire, session?.token],
  );
  const login = useCallback(
    async (email: string, password: string) => {
      if (origin.error) throw new Error(origin.error);
      const current = ++generation.current;
      const next = await createApi(origin.value).login(
        email,
        password,
        Platform.OS === "ios" ? "ios" : "android",
        (Device.modelName || "Himoto").slice(0, 100),
      );
      if (current !== generation.current) return;
      try {
        await sessionStore.save(next, origin.value);
        rememberAccess(origin.value, { ...next, origin: origin.value });
      } catch {
        await createApi(origin.value, next.token)
          .logout()
          .catch(() => {});
        throw new Error(
          "Không lưu được phiên đăng nhập an toàn. Vui lòng thử lại.",
        );
      }
      if (current !== generation.current) return;
      currentSession.current = next;
      lastVerified.current = Date.now();
      biometricLock.notePasswordLogin(origin.value, sessionFamily(next));
      const local = Platform.OS === 'web' ? null : await openOfflineStore().catch(() => null);
      if (current !== generation.current) return;
      if (local) { setOfflineStore(local); await activateLookups(next.user, local, () => current === generation.current); }
      else queryClient.clear();
      if (current !== generation.current) return;
      offlineStatus.update({ connected: true, cachedAt: null });
      setRestoreError("");
      setSession(next);
    },
    [origin, queryClient, activateLookups],
  );
  const logout = useCallback(async () => {
    if (!api) return;
    const token = session?.token;
    try {
      await api.logout();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) throw error;
    }
    expire(token);
  }, [api, expire, session?.token]);
  return (
    <QueryClientProvider client={queryClient}>
      <Context.Provider
        value={{
          session,
          api,
          restoring,
          restoreError,
          restore,
          login,
          logout,
        }}
      >
        {children}
      </Context.Provider>
    </QueryClientProvider>
  );
}
export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error("SessionProvider is missing");
  return value;
}
