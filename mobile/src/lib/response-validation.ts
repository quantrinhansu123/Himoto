import type {
  MobileCustomerProfile,
  MobileWriteReceipt,
  MobilePage,
  MobileRecord,
  MobileSession,
  MobileUser,
  MobileWorkspace,
} from "@himoto/mobile-contract";
import { contractWorkspace, isContractMonitoring } from "../../../shared/mobile-contract-workspaces";

export function isWriteReceipt(value: unknown): value is MobileWriteReceipt {
  return (
    object(value) &&
    integer(value.id, 1) &&
    typeof value.revision === "string" &&
    /^[1-9]\d{0,19}$/.test(value.revision) &&
    typeof value.replayed === "boolean"
  );
}
export function isReceiptLookup(
  value: unknown,
): value is { receipt: MobileWriteReceipt | null } {
  return (
    object(value) && (value.receipt === null || isWriteReceipt(value.receipt))
  );
}
export function isCustomerProfile(
  value: unknown,
): value is MobileCustomerProfile {
  return (
    object(value) &&
    integer(value.id, 1) &&
    typeof value.revision === "string" &&
    /^[1-9]\d{0,19}$/.test(value.revision) &&
    (value.store_id === null || integer(value.store_id, 1)) &&
    [
      "name",
      "phone",
      "email",
      "address",
      "id_card",
      "nationality",
      "contact_channel",
      "contact_detail",
      "warning_note",
      "driver_license_number",
      "driver_license_issued_on",
      "id_card_issued_on",
      "id_card_issued_by",
    ].every((key) => typeof value[key] === "string") &&
    (value.customer_type === "vietnam" || value.customer_type === "foreign") &&
    ["active", "warning", "blacklist", "draft"].includes(
      String(value.status),
    ) &&
    Array.isArray(value.relatives) &&
    value.relatives.length <= 2 &&
    value.relatives.every(
      (relative) =>
        object(relative) &&
        ["name", "relationship", "phone"].every(
          (key) => typeof relative[key] === "string",
        ),
    )
  );
}

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown, minimum = 0) =>
  Number.isSafeInteger(value) && Number(value) >= minimum;
const nullableNumber = (value: unknown) =>
  value === null || (typeof value === "number" && Number.isFinite(value));
const expiry = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

export function isMobileUser(value: unknown): value is MobileUser {
  return (
    object(value) &&
    integer(value.id, 1) &&
    ["name", "email", "role"].every((key) => typeof value[key] === "string") &&
    Array.isArray(value.permissions) &&
    value.permissions.every((permission) => typeof permission === "string") &&
    (value.storeId === null || integer(value.storeId, 1)) &&
    typeof value.allStores === "boolean"
  );
}
export function isSession(
  value: unknown,
): value is { user: MobileUser; expiresAt: string } {
  return object(value) && isMobileUser(value.user) && expiry(value.expiresAt);
}
export function isLogin(value: unknown): value is MobileSession {
  return (
    object(value) &&
    (value.refreshToken === undefined && value.refreshExpiresAt === undefined && value.sessionId === undefined || isRefreshSession(value)) &&
    isSession(value) &&
    "token" in value &&
    typeof value.token === "string" &&
    /^hm1_[A-Za-z0-9_-]{43}$/.test(value.token) &&
    Date.parse(value.expiresAt) > Date.now()
  );
}
export function isRefreshSession(value: unknown): value is MobileSession {
  return object(value) && isMobileUser(value.user) && typeof value.token === 'string' && /^hm1_[A-Za-z0-9_-]{43}$/.test(value.token) &&
    expiry(value.expiresAt) && typeof value.refreshToken === 'string' && /^hmr2_[A-Za-z0-9_-]{43}$/.test(value.refreshToken) &&
    typeof value.refreshExpiresAt === 'string' && expiry(value.refreshExpiresAt) && Date.parse(value.refreshExpiresAt) > Date.now() &&
    typeof value.sessionId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.sessionId);
}
export function isRecord(value: unknown): value is MobileRecord {
  return (
    object(value) &&
    (value.monitoring === undefined || isContractMonitoring(value.monitoring)) &&
    (value.reminderEligible === undefined || typeof value.reminderEligible === "boolean") &&
    (value.thumbnailRevision === undefined || value.thumbnailRevision === null || typeof value.thumbnailRevision === 'string' && /^[1-9]\d{0,19}$/.test(value.thumbnailRevision)) &&
    integer(value.id, 1) &&
    [
      "email",
      "address",
      "contactChannel",
      "contactDetail",
      "customerNote",
    ].every(
      (key) => value[key] === undefined || typeof value[key] === "string",
    ) &&
    [
      "code",
      "name",
      "status",
      "storeName",
      "license",
      "vehicleName",
      "phone",
      "startsAt",
      "endsAt",
      "brand",
      "color",
    ].every((key) => typeof value[key] === "string") &&
    (value.storeId === null || integer(value.storeId, 1)) &&
    ["totalAmount", "paidAmount", "odometer"].every((key) =>
      nullableNumber(value[key]),
    )
  );
}
export function isPage(value: unknown): value is MobilePage {
  return (
    object(value) &&
    (value.scope === undefined || !!contractWorkspace(value.scope)) &&
    Array.isArray(value.rows) &&
    value.rows.length <= 50 &&
    value.rows.every(isRecord) &&
    integer(value.total) &&
    (value.tabCount === undefined || integer(value.tabCount)) &&
    integer(value.page, 1) &&
    integer(value.pages, 1) &&
    Number(value.page) <= Number(value.pages) &&
    Array.isArray(value.statusCounts) &&
    value.statusCounts.every(
      (count) =>
        Array.isArray(count) &&
        count.length === 2 &&
        typeof count[0] === "string" &&
        integer(count[1]),
    ) &&
    expiry(value.updatedAt)
  );
}
export function isWorkspace(value: unknown): value is MobileWorkspace {
  return (
    object(value) &&
    isMobileUser(value.user) &&
    Array.isArray(value.stores) &&
    value.stores.every(
      (store) =>
        object(store) && integer(store.id, 1) && typeof store.name === "string",
    )
  );
}
export function isLogout(value: unknown): value is { success: true } {
  return object(value) && value.success === true;
}
