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
import type { MobileSession } from "@himoto/mobile-contract";
import { ApiError, apiOrigin, createApi, type MobileApi } from "@/lib/api";
import { sessionStore } from "@/lib/session-store";
import { pendingWrites } from "@/lib/pending-writes";
import {installDraftWorkLedgerGuard} from "@/lib/draft-work-links";
installDraftWorkLedgerGuard(pendingWrites);

interface SessionContextValue {
  session: MobileSession | null;
  api: MobileApi | null;
  restoring: boolean;
  restoreError: string;
  restore: () => Promise<void>;
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
  const expire = useCallback(
    (token?: string) => {
      if (token && currentSession.current?.token !== token) return;
      currentSession.current = null;
      const expiredGeneration = ++generation.current;
      queryClient.clear();
      setSession(null);
      setRestoring(false);
      pendingWrites.detach();
      void sessionStore.clear().catch(() => {
        if (expiredGeneration === generation.current)
          setRestoreError("Không xóa được phiên đã hết hạn. Vui lòng thử lại.");
      });
    },
    [queryClient],
  );
  const restore = useCallback(
    async (quiet = false) => {
      const current = ++generation.current;
      if (!quiet) {
        setRestoring(true);
        setRestoreError("");
      }
      try {
        if (origin.error) throw new Error(origin.error);
        const stored = await sessionStore.read(origin.value);
        if (current !== generation.current) return;
        if (!stored) {
          await sessionStore.clear();
          currentSession.current = null;
          queryClient.clear();
          setSession(null);
          return;
        }
        const fresh = await createApi(origin.value, stored.token).session();
        if (current !== generation.current) return;
        if (
          JSON.stringify(currentSession.current?.user) !==
          JSON.stringify(fresh.user)
        )
          queryClient.clear();
        const restored = { ...fresh, token: stored.token };
        currentSession.current = restored;
        setSession(restored);
      } catch (error) {
        if (current !== generation.current) return;
        if (error instanceof ApiError && error.status === 401) expire();
        else if (!quiet) setRestoreError((error as Error).message);
      } finally {
        if (!quiet && current === generation.current) setRestoring(false);
      }
    },
    [origin, queryClient, expire],
  );
  const restoreRef = useRef(restore);
  useEffect(() => {
    restoreRef.current = restore;
  }, [restore]);
  useEffect(() => {
    void restoreRef.current();
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
    const timer = setTimeout(
      () => expire(session.token),
      Math.max(0, Date.parse(session.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [session, expire]);
  const api = useMemo(
    () => (session ? createApi(origin.value, session.token) : null),
    [origin.value, session],
  );
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
      queryClient.clear();
      setRestoreError("");
      setSession(next);
    },
    [origin, queryClient],
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
