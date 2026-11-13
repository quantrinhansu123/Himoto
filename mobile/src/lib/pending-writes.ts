import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

type Scope = {
  origin: string;
  userId: number;
  storeId: number | null;
  allStores: boolean;
};
type Entry = { scope: Scope; operation: string; key: string };
const LEGACY = "himoto.mobile.pending-writes.v1";
const INDEX = "himoto.mobile.pending-writes.v2";
const entryKey = (key: string) => `${INDEX}.${key}`;
const validKey = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  );
const validOperation = (value: unknown): value is string =>
  typeof value === "string" &&
  /^(?:bulk\.(?:staff|stores|customers|vehicles)\.delete|telegram\.(?:contract|transfer):[1-9]\d{0,14}|vimport\.(?:sync|replace|reset):[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|import\.(?:customers|cstores|contracts):[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|integration\.(?:gps-account|gps-enabled|telegram)|correction\.(?:receipts|renewal):[1-9]\d{0,14}|lifecycle\.(?:mark_bad_debt|settle|hold|resume|update_hold|complete_hold):[1-9]\d{0,14}|account\.(?:create|change-password|(?:update|delete|password):[1-9]\d{0,14})|ctype\.(?:create|update)|battery\.(?:create|(?:update|delete|renew|collect_renewal|return|media):[1-9]\d{0,14})|shift\.(?:create|(?:update|audit|media):[1-9]\d{0,14})|reminder\.send:[1-9]\d{0,14}|cashbook\.delete|draft\.delete:[1-9]\d{0,14}|(customer|draft)\.(create|update:[1-9]\d{0,14})|(?:bank|cash)\.(create|(?:update|status|delete):[1-9]\d{0,14})|(?:store|staff|duty)\.(create|(?:update|delete):[1-9]\d{0,14})|contract\.(finalize|handover|approve|edit|terms|ownership_terms):[1-9]\d{0,14}|payment\.(record|bill|renewal):[1-9]\d{0,14}|renewal\.(bill|record):[1-9]\d{0,14}|return\.(record|swap|recover|correct):[1-9]\d{0,14}|vehicle\.(create|(?:update|status|transfer|receive|reject|cancel):[1-9]\d{0,14})|media\.(contract|vehicle|customer|copy|delete\.(?:contract|vehicle|customer)):[1-9]\d{0,14}|video\.record:[1-9]\d{0,14}|gps\.mapping:[1-9]\d{0,14})$/.test(
    value,
  );
function validScope(value: unknown): value is Scope {
  if (!value || typeof value !== "object") return false;
  const scope = value as Scope;
  return (
    typeof scope.origin === "string" &&
    /^https?:\/\//.test(scope.origin) &&
    scope.origin.length <= 512 &&
    Number.isSafeInteger(scope.userId) &&
    scope.userId > 0 &&
    (scope.storeId === null ||
      (Number.isSafeInteger(scope.storeId) && scope.storeId > 0)) &&
    typeof scope.allStores === "boolean"
  );
}
function sameScope(a: Scope, b: Scope) {
  return (
    a.origin === b.origin &&
    a.userId === b.userId &&
    a.storeId === b.storeId &&
    a.allStores === b.allStores
  );
}
function sameActor(a: Scope, b: Scope) {
  return a.origin === b.origin && a.userId === b.userId;
}
const actorScoped = (operation: string) => operation.includes(":") || operation === "cashbook.delete" || operation.startsWith("bulk.") || operation.startsWith("ctype.") || operation.startsWith("account.") || operation.startsWith("integration.");
type WorkGuard={reserve(scope:Scope,operation:string,conflicts:readonly string[],key:string):Promise<void>;complete(scope:Scope,operation:string,key:string):Promise<void>};
let workGuard:WorkGuard|null=null;
const memory = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();
let generation = 0;
function serialize<T>(task: () => Promise<T>) {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}
const get = (key: string) =>
  Platform.OS === "web"
    ? Promise.resolve(memory.get(key) ?? null)
    : SecureStore.getItemAsync(key);
async function put(key: string, value: unknown) {
  const raw = JSON.stringify(value);
  if (Platform.OS === "web") memory.set(key, raw);
  else
    await SecureStore.setItemAsync(key, raw, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
}
async function remove(key: string) {
  if (Platform.OS === "web") memory.delete(key);
  else await SecureStore.deleteItemAsync(key);
}
function unreadable(): never {
  throw new Error(
    "Không đọc được mã lần lưu trước trên thiết bị. Chưa thể gửi lần lưu mới.",
  );
}
async function read(): Promise<Entry[]> {
  try {
    const raw = await get(INDEX);
    if (raw !== null) {
      const keys = JSON.parse(raw);
      if (
        !Array.isArray(keys) ||
        keys.length > 8 ||
        !keys.every(validKey) ||
        new Set(keys).size !== keys.length
      )
        return unreadable();
      const entries: Entry[] = [];
      for (const key of keys) {
        const entry = JSON.parse((await get(entryKey(key))) || "null");
        if (
          !entry ||
          !validScope(entry.scope) ||
          !validOperation(entry.operation) ||
          entry.key !== key ||
          entries.some(
            (old) =>
              sameScope(old.scope, entry.scope) &&
              old.operation === entry.operation,
          )
        )
          return unreadable();
        entries.push(entry);
      }
      return entries;
    }
    // Migrate the earlier single-actor ledger before a request can be sent.
    const legacy = await get(LEGACY);
    if (legacy === null) return [];
    const value = JSON.parse(legacy);
    const requests = value?.requests;
    if (
      !validScope(value) ||
      !requests ||
      typeof requests !== "object" ||
      Array.isArray(requests)
    )
      return unreadable();
    const pairs = Object.entries(requests);
    if (
      pairs.length > 8 ||
      pairs.some(
        ([operation, key]) => !validOperation(operation) || !validKey(key),
      ) ||
      new Set(pairs.map(([, key]) => key)).size !== pairs.length
    )
      return unreadable();
    const scope: Scope = {
      origin: value.origin,
      userId: value.userId,
      storeId: value.storeId,
      allStores: value.allStores,
    };
    const entries = pairs.map(([operation, key]) => ({
      scope,
      operation,
      key: key as string,
    }));
    for (const entry of entries) await put(entryKey(entry.key), entry);
    await put(
      INDEX,
      entries.map((entry) => entry.key),
    );
    await remove(LEGACY).catch(() => {});
    return entries;
  } catch {
    return unreadable();
  }
}
function requireCurrent(current: number) {
  if (current !== generation) throw new Error("Phiên làm việc đã thay đổi.");
}
async function previousEntry(entries: Entry[], scope: Scope, operation: string) {
  // Resource IDs identify the same intent even when that actor's grants/store
  // change. Reuse the UUID; the API still verifies current resource visibility.
  // Creates remain destination-scoped because they have no resource ID yet.
  const matches = entries.filter((entry) => entry.operation === operation &&
    (actorScoped(operation) ? sameActor(entry.scope, scope) : sameScope(entry.scope, scope)));
  if (matches.length > 1)
    throw new Error("Có nhiều mã cho cùng hồ sơ chưa được đối chiếu. Giữ các mã và kiểm tra kết quả trước khi gửi yêu cầu mới.");
  const previous = matches[0];
  if (previous && !sameScope(previous.scope, scope)) {
    const recovered = { ...previous, scope };
    // Persist the same key before it can be returned; storage failure cannot
    // authorize a replacement UUID. No form/token/resource data is moved.
    await put(entryKey(previous.key), recovered);
    return recovered;
  }
  return previous;
}
function bulkFamily(operation:string){
  if(operation.startsWith('bulk.'))return operation.split('.')[1];
  if(operation.startsWith('staff.'))return 'staff';
  if(operation.startsWith('store.'))return 'stores';
  if(/^(customer\.|media\.(?:delete\.)?customer:|import\.(?:customers|cstores):)/.test(operation))return 'customers';
  if(/^(vehicle\.|vimport\.|media\.(?:delete\.)?vehicle:)/.test(operation))return 'vehicles';
  return null;
}
export const pendingWrites = {
  configureWorkGuard(guard:WorkGuard){workGuard=guard;},
  reserveExclusive(scope: Scope, operation: string, conflicts: readonly string[], makeKey: () => string) {
    const current = generation;
    return serialize(async () => {
      requireCurrent(current);
      if (!validScope(scope) || !validOperation(operation) || !conflicts.includes(operation) ||
          conflicts.length > 8 || new Set(conflicts).size !== conflicts.length || !conflicts.every(validOperation))
        throw new Error("Thông tin nhóm thao tác chưa hợp lệ.");
      const entries = await read();
      requireCurrent(current);
      const previous: Entry[] = [];
      for(const entry of entries){
        if((operation.startsWith('bulk.')||entry.operation.startsWith('bulk.'))&&bulkFamily(operation)===bulkFamily(entry.operation)&&sameActor(entry.scope,scope)&&(actorScoped(entry.operation)||sameScope(entry.scope,scope)))previous.push(entry);
      }
      for (const candidate of conflicts) {
        const entry = await previousEntry(entries, scope, candidate);
        if (entry&&!previous.some(old=>old.key===entry.key)) previous.push(entry);
      }
      requireCurrent(current);
      if (previous.length > 1)
        throw new Error("Có nhiều thao tác kho chưa rõ kết quả. Vào Tài khoản để đối chiếu từng mã trước khi tiếp tục.");
      if (previous.length) return { operation: previous[0].operation, key: previous[0].key, created: false };
      if (entries.length >= 8) throw new Error("Còn nhiều lần lưu chưa được xác nhận trên thiết bị. Vào Tài khoản để đối chiếu.");
      const key = makeKey();
      if (!validKey(key) || entries.some(entry => entry.key === key)) throw new Error("Không tạo được mã lần lưu an toàn.");
      await workGuard?.reserve(scope,operation,conflicts,key);
      requireCurrent(current);
      await put(entryKey(key), { scope, operation, key });
      await put(INDEX, [...entries.map(entry => entry.key), key]);
      requireCurrent(current);
      return { operation, key, created: true };
    });
  },
  list(scope: Scope, includeActorResources = false) {
    const current = generation;
    return serialize(async () => {
      const entries = await read();
      requireCurrent(current);
      return entries
        .filter((entry) => sameScope(entry.scope, scope) || includeActorResources && actorScoped(entry.operation) && sameActor(entry.scope,scope))
        .map(({ operation, key }) => ({ operation, key }));
    });
  },
  lookup(scope: Scope, operation: string) {
    const current = generation;
    return serialize(async () => {
      if (!validScope(scope) || !validOperation(operation)) throw new Error("Thông tin lần lưu không hợp lệ.");
      const entries = await read();
      requireCurrent(current);
      const previous = await previousEntry(entries, scope, operation);
      requireCurrent(current);
      return previous?.key ?? null;
    });
  },
  entryScope(scope: Scope, operation: string, key: string) {
    const current = generation;
    return serialize(async () => {
      if (!validScope(scope) || !validOperation(operation) || !validKey(key)) throw new Error("Thông tin yêu cầu không hợp lệ.");
      const entries = await read(); requireCurrent(current);
      const entry = entries.find(row => sameActor(row.scope, scope) && row.operation === operation && row.key === key);
      return entry ? { ...entry.scope } : null;
    });
  },
  reserve(scope: Scope, operation: string, makeKey: () => string) {
    const current = generation;
    return serialize(async () => {
      requireCurrent(current);
      if (!validScope(scope) || !validOperation(operation))
        throw new Error("Thông tin lần lưu không hợp lệ.");
      const entries = await read();
      requireCurrent(current);
      if(entries.some(entry=>entry.operation!==operation&&(operation.startsWith('bulk.')||entry.operation.startsWith('bulk.'))&&bulkFamily(operation)===bulkFamily(entry.operation)&&sameActor(entry.scope,scope)&&(actorScoped(entry.operation)||sameScope(entry.scope,scope))))throw new Error('Còn lượt xóa hoặc lưu hồ sơ chưa rõ kết quả. Vào Tài khoản để đối chiếu mã gốc.');
      const previous = await previousEntry(entries, scope, operation);
      requireCurrent(current);
      if (previous) return previous.key;
      if (entries.length >= 8)
        throw new Error(
          "Còn nhiều lần lưu chưa được xác nhận trên thiết bị. Đăng nhập tài khoản đã lưu, vào Tài khoản và mở Thao tác cần đối chiếu.",
        );
      const key = makeKey();
      if (!validKey(key) || entries.some((entry) => entry.key === key))
        throw new Error("Không tạo được mã lần lưu an toàn.");
      const entry = { scope, operation, key };
      await workGuard?.reserve(scope,operation,[operation],key);
      requireCurrent(current);
      // Entries stay small enough for Keychain; the manifest contains only UUIDs.
      // Both writes must finish before the caller sends anything to the API.
      await put(entryKey(key), entry);
      await put(INDEX, [...entries.map((row) => row.key), key]);
      requireCurrent(current);
      return key;
    });
  },
  complete(scope: Scope, operation: string, key: string) {
    return serialize(async () => {
      await workGuard?.complete(scope,operation,key);
      const entries = await read();
      const index = entries.findIndex(
        (entry) =>
          (actorScoped(operation)?sameActor(entry.scope,scope):sameScope(entry.scope,scope)) &&
          entry.operation === operation &&
          entry.key === key,
      );
      if (index < 0) return;
      entries.splice(index, 1);
      // Keep an empty v2 manifest so a legacy record cannot become authoritative again.
      await put(
        INDEX,
        entries.map((entry) => entry.key),
      );
      await remove(entryKey(key)).catch(() => {});
    });
  },
  detach() {
    // Expiry/logout cancels queued work. Opaque request IDs remain actor-scoped
    // for receipt recovery after reauthentication; no token or form is stored.
    generation++;
  },
};
