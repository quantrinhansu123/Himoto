import type {
  MobileContractDraft,
  MobileDraftInput,
  MobileDraftProfile,
  MobileDraftOptions,
  MobileDraftInventory,
  MobileDraftCustomer,
  MobileVehicleAvailability,
  MobileDraftStaff,
} from "./mobile-contract";

// Pricing, printing and issuance share the contract window. Preserve imported
// line metadata until an editor explicitly confirms aligning it to that window.
export function draftWindowDifferences(draft: MobileContractDraft): number[] {
  return draft.vehicles.flatMap((row, index) =>
    row.id &&
    ((row.rent_at && row.rent_at !== draft.start_date) ||
      (row.return_at && row.return_at !== draft.end_date))
      ? [index]
      : [],
  );
}
export function alignDraftWindow(
  draft: MobileContractDraft,
): MobileContractDraft {
  return {
    ...draft,
    vehicles: draft.vehicles.map((row) => ({
      ...row,
      rent_at: draft.start_date,
      return_at: draft.end_date,
    })),
  };
}

export function validDraftTime(value: unknown, blank = false): value is string {
  if (value === "" && blank) return true;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ||
    Number(value.slice(0, 4)) < 1
  )
    return false;
  const time = Date.parse(`${value}:00+07:00`);
  return (
    Number.isFinite(time) &&
    new Date(time + 7 * 3600000).toISOString().slice(0, 16) === value
  );
}

export function isMobileDraftStaff(
  value: unknown,
): value is { rows: MobileDraftStaff[] } {
  return (
    object(value) &&
    Array.isArray(value.rows) &&
    value.rows.every(
      (row) =>
        object(row) &&
        positive(row.id) &&
        text(row.name) &&
        (row.sourceLabel === undefined || typeof row.sourceLabel === 'string' && row.sourceLabel.length <= 4000) &&
        (row.position === undefined || typeof row.position === 'string' && row.position.length <= 4000) &&
        (row.storeId === null || positive(row.storeId)) &&
        Array.isArray(row.roles) &&
        row.roles.length <= 3 &&
        row.roles.every((role) =>
          ["representative", "sales", "telesales"].includes(String(role)),
        ),
    )
  );
}

export const draftStrings = [
  "contract_number",
  "signed_on",
  "store_id",
  "staff_id",
  "staff_name",
  "start_date",
  "end_date",
  "unit_price",
  "total_amount",
  "paid_amount",
  "deposit_amount",
  "package_name",
  "payment_method",
  "deposit_payment_method",
  "collateral_description",
  "customer_source",
  "customer_source_url",
  "authorization_date",
  "created_on",
] as const;
export const draftOptionalStrings = [
  "vehicle_store_id",
  "contract_type_id",
  "contract_type_name",
  "contract_type_months",
  "customer_lookup",
  "sales_staff_id",
  "sales_staff_name",
  "tls_staff_id",
  "ownership_term_months",
] as const;
export const draftCustomerStrings = [
  "name",
  "phone",
  "email",
  "address",
  "id_card",
  "id_card_issued_on",
  "id_card_issued_by",
  "driver_license_number",
  "driver_license_issued_on",
  "birthday",
  "relatives_text",
  "warning_note",
  "customer_type",
  "nationality",
  "contact_channel",
  "contact_detail",
] as const;
export const draftVehicleStrings = [
  "id",
  "name",
  "license",
  "brand",
  "type_text",
  "color",
  "year",
  "driver_name",
  "driver_license_number",
  "driver_license_issued_on",
  "borrow_hats",
  "borrow_raincoats",
  "rent_at",
  "return_at",
] as const;
export const draftDocumentKeys = [
  ...draftStrings,
  ...draftOptionalStrings,
  "customer_id",
  "customer",
  "relatives",
  "vehicles",
  "reservation",
  "ownership",
  "document_requirements",
  "extra_charges",
  "custom_installments",
  "backfill",
] as const;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const positive = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const text = (v: unknown, max = 4000): v is string =>
  typeof v === "string" && v.length <= max;
const known = (v: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(v).every((key) => keys.includes(key));
const revision = (v: unknown): v is string =>
  typeof v === "string" && /^[1-9]\d{0,19}$/.test(v);
const strings = (v: Record<string, unknown>, keys: readonly string[]) =>
  keys.every((key) => text(v[key]));
const stamp = (v: unknown): v is string =>
  text(v, 40) && Number.isFinite(Date.parse(v));
const relatives = (v: unknown) =>
  Array.isArray(v) &&
  v.length === 2 &&
  v.every(
    (row) =>
      object(row) &&
      known(row, ["name", "relationship", "phone"]) &&
      strings(row, ["name", "relationship", "phone"]),
  );
const customer = (v: unknown) =>
  object(v) &&
  known(v, [...draftCustomerStrings, "relatives_json"]) &&
  strings(v, draftCustomerStrings) &&
  (v.relatives_json === undefined || text(v.relatives_json, 16000));
const vehicle = (v: unknown) =>
  object(v) &&
  known(v, [...draftVehicleStrings, "stock_store_id", "stock_store_name"]) &&
  strings(v, draftVehicleStrings) &&
  (v.id === "" || /^[1-9]\d{0,14}$/.test(String(v.id))) &&
  ["stock_store_id", "stock_store_name"].every(
    (key) => v[key] === undefined || text(v[key], 255),
  );

export function isMobileContractDraft(v: unknown): v is MobileContractDraft {
  if (
    !object(v) ||
    !known(v, draftDocumentKeys) ||
    !strings(v, draftStrings) ||
    !customer(v.customer) ||
    !relatives(v.relatives) ||
    !(v.customer_id === null || positive(v.customer_id)) ||
    !Array.isArray(v.vehicles) ||
    !v.vehicles.length ||
    v.vehicles.length > 50 ||
    !v.vehicles.every(vehicle) ||
    !draftOptionalStrings.every(
      (key) => v[key] === undefined || text(v[key]),
    ) ||
    !["reservation", "ownership"].every(
      (key) => v[key] === undefined || typeof v[key] === "boolean",
    )
  )
    return false;
  if (
    v.ownership_term_months !== undefined &&
    !["6", "9", "12", "18", "24", "custom"].includes(
      String(v.ownership_term_months),
    )
  )
    return false;
  if (v.document_requirements !== undefined) {
    const row = v.document_requirements;
    if (
      !object(row) ||
      Object.keys(row).length !== 5 ||
      !["phone", "id_card", "address", "representative"].every(
        (key) => typeof row[key] === "boolean",
      ) ||
      ![0, 1, 2].includes(Number(row.relatives)) ||
      typeof row.relatives !== "number"
    )
      return false;
  }
  if (
    v.extra_charges !== undefined &&
    (!Array.isArray(v.extra_charges) ||
      v.extra_charges.length > 20 ||
      !v.extra_charges.every(
        (row) =>
          object(row) &&
          known(row, ["name", "amount", "method"]) &&
          text(row.name, 100) &&
          text(row.amount, 13) &&
          /^\d*$/.test(row.amount) &&
          (row.method === undefined ||
            ["cash", "transfer", "company_transfer"].includes(
              String(row.method),
            )),
      ))
  )
    return false;
  if (
    v.custom_installments !== undefined &&
    (!Array.isArray(v.custom_installments) ||
      v.custom_installments.length > 3659 ||
      !v.custom_installments.every(
        (row) =>
          object(row) &&
          known(row, ["due_at", "amount"]) &&
          text(row.due_at, 16) &&
          text(row.amount, 13) &&
          /^\d*$/.test(row.amount),
      ))
  )
    return false;
  if (
    v.backfill !== undefined &&
    (!object(v.backfill) ||
      !known(v.backfill, ["note", "returned_at"]) ||
      !text(v.backfill.note, 1000) ||
      (v.backfill.returned_at !== undefined &&
        !text(v.backfill.returned_at, 16)))
  )
    return false;
  return true;
}
export function isMobileDraftInput(v: unknown): v is MobileDraftInput {
  return (
    object(v) &&
    known(v, ["draft", "rental_type", "status", "notes", "revision"]) &&
    v.status === "draft" &&
    text(v.rental_type, 80) &&
    !!v.rental_type &&
    text(v.notes) &&
    (v.revision === undefined || revision(v.revision)) &&
    isMobileContractDraft(v.draft)
  );
}
export function isMobileDraftProfile(v: unknown): v is MobileDraftProfile {
  return (
    object(v) &&
    positive(v.id) &&
    text(v.code, 200) &&
    revision(v.revision) &&
    isMobileDraftInput(v.input) &&
    v.input.revision === v.revision
  );
}
export function isMobileDraftOptions(v: unknown): v is MobileDraftOptions {
  const stores = (rows: unknown) =>
    Array.isArray(rows) &&
    rows.every(
      (row) => object(row) && positive(row.id) && text(row.name, 4000),
    );
  return (
    object(v) &&
    isMobileDraftInput(v.initial) &&
    stores(v.stores) &&
    stores(v.vehicleStores) &&
    Array.isArray(v.types) &&
    v.types.every(
      (row) =>
        object(row) &&
        text(row.id, 80) &&
        /^[a-z0-9_-]+$/.test(row.id) &&
        text(row.label, 80) &&
        text(row.rentalType, 80) &&
        (row.termMonths === null ||
          (positive(row.termMonths) && row.termMonths <= 120)) &&
        typeof row.active === "boolean",
    )
  );
}
export function isMobileDraftInventory(v: unknown): v is MobileDraftInventory {
  return (
    object(v) &&
    positive(v.page) &&
    typeof v.hasMore === "boolean" &&
    Array.isArray(v.rows) &&
    v.rows.length <= 20 &&
    v.rows.every(
      (row) =>
        object(row) &&
        vehicle(row.vehicle) &&
        text(row.status) &&
        positive(row.storeId) &&
        text(row.storeName),
    )
  );
}
export function isMobileDraftCustomers(
  v: unknown,
): v is { rows: MobileDraftCustomer[]; hasMore: boolean } {
  return (
    object(v) &&
    typeof v.hasMore === "boolean" &&
    Array.isArray(v.rows) &&
    v.rows.length <= 10 &&
    v.rows.every(
      (row) =>
        object(row) &&
        positive(row.id) &&
        (row.storeId === null || positive(row.storeId)) &&
        text(row.storeName) &&
        text(row.status) &&
        customer(row.details) &&
        relatives(row.relatives),
    )
  );
}
export function isMobileVehicleAvailability(
  v: unknown,
): v is MobileVehicleAvailability {
  const info = (row: unknown) =>
    object(row) &&
    ["code", "storeName", "startsAt", "endsAt"].every((key) => text(row[key]));
  return (
    object(v) &&
    stamp(v.checkedAt) &&
    text(v.startsAt, 16) &&
    text(v.endsAt, 16) &&
    Array.isArray(v.vehicles) &&
    v.vehicles.length <= 50 &&
    new Set(v.vehicles.map((row) => (object(row) ? row.id : null))).size ===
      v.vehicles.length &&
    v.vehicles.every(
      (row) =>
        object(row) &&
        positive(row.id) &&
        text(row.status) &&
        typeof row.hasHardBlocker === "boolean" &&
        typeof row.reservationOverlap === "boolean" &&
        Number.isSafeInteger(row.blockersTotal) &&
        Number(row.blockersTotal) >= 0 &&
        Number.isSafeInteger(row.draftsTotal) &&
        Number(row.draftsTotal) >= 0 &&
        Array.isArray(row.blockers) &&
        row.blockers.length <= 20 &&
        row.blockers.length <= Number(row.blockersTotal) &&
        row.blockers.every(
          (item) =>
            info(item) &&
            object(item) &&
            text(item.status) &&
            ["hard", "reservation_overlap"].includes(String(item.severity)),
        ) &&
        Array.isArray(row.drafts) &&
        row.drafts.length <= 20 &&
        row.drafts.length <= Number(row.draftsTotal) &&
        row.drafts.every(info),
    )
  );
}
