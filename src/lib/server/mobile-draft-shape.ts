import "server-only";
import {
  CUSTOMER_FIELDS,
  emptyVehicle,
  type ContractDraft,
} from "@/lib/management/contract-document";
import { validIdentityIssueDate } from "@/lib/management/customer-identity";
import { DraftSaveError, parseDraftEdits } from "./contract-drafts";
import { MobileError } from "./mobile-session";
import type {
  MobileContractDraft,
  MobileDraftInput,
} from "../../../shared/mobile-contract";
import {
  draftDocumentKeys as draftKeys,
  validDraftTime,
} from "../../../shared/mobile-draft-validation";
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
function keys(value: unknown, allowed: readonly string[]) {
  if (
    !object(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw new MobileError(
      "Biểu mẫu chứa thông tin không được hỗ trợ. Giữ dữ liệu và tải lại phiên bản ứng dụng.",
      400,
      "INVALID_DRAFT",
    );
}
export const localRentalTime = validDraftTime;
export function parseMobileDraft(input: unknown): MobileDraftInput {
  keys(input, ["draft", "rental_type", "status", "notes", "revision"]);
  const body = input as Record<string, unknown>;
  keys(body.draft, draftKeys);
  const draft = body.draft as Record<string, unknown>;
  keys(draft.customer, [...CUSTOMER_FIELDS, "relatives_json"]);
  if (
    object(draft.customer) &&
    draft.customer.relatives_json !== undefined &&
    (typeof draft.customer.relatives_json !== "string" ||
      draft.customer.relatives_json.length > 16000)
  )
    throw new MobileError(
      "Thông tin người thân không hợp lệ.",
      400,
      "INVALID_DRAFT",
    );
  for (const field of ["start_date", "end_date"] as const)
    if (!localRentalTime(draft[field], true))
      throw new MobileError("Ngày giờ thuê chưa hợp lệ.", 400, "INVALID_DRAFT");
  for (const field of [
    "signed_on",
    "authorization_date",
    "created_on",
  ] as const)
    if (
      typeof draft[field] !== "string" ||
      !validIdentityIssueDate(draft[field])
    )
      throw new MobileError("Ngày hồ sơ chưa hợp lệ.", 400, "INVALID_DRAFT");
  if (Array.isArray(draft.vehicles))
    for (const vehicle of draft.vehicles) {
      keys(vehicle, [
        ...Object.keys(emptyVehicle()),
        "stock_store_id",
        "stock_store_name",
      ]);
      const row = vehicle as Record<string, unknown>;
      if (
        !localRentalTime(row.rent_at, true) ||
        !localRentalTime(row.return_at, true) ||
        typeof row.driver_license_issued_on !== "string" ||
        !validIdentityIssueDate(row.driver_license_issued_on)
      )
        throw new MobileError(
          "Kiểm tra ngày giờ và giấy phép lái xe của dòng xe.",
          400,
          "INVALID_DRAFT",
        );
    }
  if (Array.isArray(draft.relatives))
    for (const relative of draft.relatives)
      keys(relative, ["name", "relationship", "phone"]);
  try {
    const parsed = parseDraftEdits(input);
    return { ...parsed, status: "draft" };
  } catch (error) {
    if (error instanceof DraftSaveError)
      throw new MobileError(error.message, error.status, "INVALID_DRAFT");
    throw error;
  }
}

/** Reject schema drift before editing; never silently discard an unknown saved field. */
export function mobileDraftDocument(draft: ContractDraft): MobileContractDraft {
  const derived = new Set(["collections", "deposit_paid_amount"]);
  if (
    Object.keys(draft).some(
      (key) =>
        !draftKeys.includes(key as (typeof draftKeys)[number]) &&
        !derived.has(key),
    )
  )
    throw new MobileError(
      "Bản nháp có dữ liệu cần phiên bản ứng dụng mới hơn. Mở trên web để kiểm tra.",
      409,
      "DATA_REVIEW_REQUIRED",
    );
  return Object.fromEntries(
    draftKeys
      .filter((key) => draft[key] !== undefined)
      .map((key) => [key, draft[key]]),
  ) as unknown as MobileContractDraft;
}
