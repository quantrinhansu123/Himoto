import "server-only";
import type { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import type {
  MobileContractAction,
  MobileContractPreparation,
  MobileContractDraft,
} from "../../../shared/mobile-contract";
import {
  draftWindowDifferences,
  validDraftTime,
} from "../../../shared/mobile-draft-validation";
import type { ContractDraft } from "@/lib/management/contract-document";
import {
  validateOperationalDraft,
  validateReservationDraft,
} from "@/lib/management/contract-document";
import type { ManagementDataset, ManagementRow } from "@/lib/management/types";
import {
  canFinalizeRentalContract,
  requiresOwnershipApproval,
} from "@/lib/management/contract-approval";
import { hasPermission } from "@/lib/management/permissions";
import { MAX_PAYMENT_AMOUNT } from "@/lib/management/contract-payments";
import type { SessionUser } from "./management-session";
import { MobileError } from "./mobile-session";
import { withMobileData } from "./mobile-context";
import { himotoPool } from "./himoto-database";
import { mobileDraftDocument, parseMobileDraft } from "./mobile-draft-shape";
import {
  ContractFinalizeError,
  finalizeContractDraft,
  parseFinalizeInput,
} from "./contract-finalize";
import { handoverReservation, parseHandoverInput } from "./contract-handover";
import { readPaymentContext, ContractPaymentError } from "./contract-payments";
import { queueContractNotification } from "./contract-notifications";
import {
  idempotentMobileWrite,
  mobileBody,
  mobileRequestKey,
} from "./mobile-writes";

export function requireMobileContractAction(user: SessionUser) {
  if (
    !hasPermission(user, "contracts.read") ||
    !hasPermission(user, "contracts.finalize")
  )
    throw new MobileError(
      "Tài khoản không có quyền phát hành hoặc giao xe.",
      403,
      "FORBIDDEN",
    );
}
async function transaction<T>(
  user: SessionUser,
  write: boolean,
  task: (client: PoolClient) => Promise<T>,
) {
  requireMobileContractAction(user);
  return withMobileData(user, "", async () => {
    const client = await himotoPool.connect();
    try {
      await client.query(
        write ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );
      await client.query("SET LOCAL statement_timeout='20s'");
      await client.query("SET LOCAL lock_timeout='5s'");
      const result = await task(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (
        error instanceof ContractFinalizeError ||
        error instanceof ContractPaymentError
      )
        throw new MobileError(
          error.message,
          error.status,
          error instanceof ContractFinalizeError && error.code
            ? error.code
            : error.status === 409
              ? "CONTRACT_CHANGED"
              : "INVALID_CONTRACT",
        );
      throw error;
    } finally {
      client.release();
    }
  });
}
const validId = (id: number) => Number.isSafeInteger(id) && id > 0;
export function mobileContractId(value: string) {
  const id = Number(value);
  if (!/^[1-9]\d{0,14}$/.test(value) || !validId(id))
    throw new MobileError("Mã hợp đồng không hợp lệ.");
  return id;
}
const amount = (value: unknown): number | null =>
  typeof value === "string" &&
  /^\d+$/.test(value) &&
  Number.isSafeInteger(Number(value)) &&
  Number(value) <= MAX_PAYMENT_AMOUNT
    ? Number(value)
    : value === ""
      ? 0
      : null;
async function contractRow(client: PoolClient, id: number, lock = false) {
  if (!validId(id)) throw new MobileError("Mã hợp đồng không hợp lệ.");
  const row = (
    await client.query(
      `SELECT id,order_status,store_id,customer_id,order_type,contract_number,draft_reference,draft_payload,xmin::text AS revision,
      (SELECT s.store_name FROM himoto.stores s WHERE s.id=himoto.orders.store_id) AS store_name
    FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL${lock ? " FOR UPDATE" : ""}`,
      [id],
    )
  ).rows[0];
  if (!row)
    throw new MobileError(
      "Không tìm thấy hợp đồng trong phạm vi được cấp.",
      404,
      "NOT_FOUND",
    );
  return row;
}
function snapshot(raw: Record<string, unknown>) {
  try {
    const payload = raw.draft_payload as {
      management_composer?: { draft?: ContractDraft; rental_type?: string };
    } | null;
    const composer = payload?.management_composer;
    const parsed = parseMobileDraft({
      draft: mobileDraftDocument(composer?.draft as ContractDraft),
      rental_type: String(composer?.rental_type || raw.order_type || "daily"),
      status: "draft",
      notes: "",
    });
    if (
      (raw.customer_id == null ? null : Number(raw.customer_id)) !==
      parsed.draft.customer_id
    )
      throw new Error("Customer identity differs from the persisted order");
    return parsed;
  } catch {
    throw new MobileError(
      "Hồ sơ cần được đối chiếu trên web trước khi phát hành hoặc giao xe.",
      409,
      "DATA_REVIEW_REQUIRED",
    );
  }
}
async function validation(
  client: PoolClient,
  draft: MobileContractDraft,
  storeId: number,
) {
  const stores = await client.query(
    "SELECT id,store_name FROM himoto.store_directory() ORDER BY store_name,id",
  );
  const ids = draft.vehicles.map((row) => Number(row.id)).filter(validId);
  const vehicles = await client.query(
    "SELECT id,status FROM himoto.vehicle_inventory() WHERE id=ANY($1::bigint[]) AND store_id>0",
    [ids],
  );
  const row = (id: number): ManagementRow => ({
    id,
    code: String(id),
    name: "",
    status: "active",
  });
  const dataset: ManagementDataset = {
    stores: stores.rows.map((s) => row(Number(s.id))),
    vehicles: vehicles.rows.map((v) => row(Number(v.id))),
    customers: [],
    contracts: [],
    staff: [],
  };
  const issues = {
    rental: validateOperationalDraft(
      draft as ContractDraft,
      dataset,
      [],
      "api",
    ),
    reservation: validateReservationDraft(
      draft as ContractDraft,
      dataset,
      [],
      "api",
    ),
  };
  for (const fields of [issues.rental, issues.reservation]) {
    if (Number(draft.store_id) !== storeId)
      fields.store_id =
        "Cơ sở ghi trên mẫu khác cơ sở của hợp đồng. Đối chiếu và lưu nháp lại.";
    if (draftWindowDifferences(draft).length)
      fields.vehicle_times =
        "Có dòng xe lưu thời gian cũ. Mở bản nháp, đối chiếu và đồng bộ với lịch hợp đồng.";
    const entries = Object.entries(fields);
    if (entries.length > 80) {
      for (const key of Object.keys(fields)) delete fields[key];
      Object.assign(fields, Object.fromEntries(entries.slice(0, 79)), {
        more_issues: `Còn ${entries.length - 79} mục cần bổ sung sau các mục trên.`,
      });
    }
  }
  return issues;
}
export async function readMobileContractPreparation(
  user: SessionUser,
  id: number,
): Promise<MobileContractPreparation> {
  return transaction(user, false, async (client) => {
    const raw = await contractRow(client, id);
    const input = snapshot(raw),
      d = input.draft;
    const approvalType = requiresOwnershipApproval(raw.order_type)
      ? raw.order_type
      : input.rental_type;
    const context = await readPaymentContext(client, id);
    const issues =
      raw.order_status === "draft"
        ? await validation(client, d, Number(raw.store_id))
        : { rental: {}, reservation: {} };
    return {
      id,
      storeId: Number(raw.store_id),
      storeName: String(raw.store_name || ""),
      code: context.code,
      status: context.status,
      revision: context.revision,
      canFinalize: canFinalizeRentalContract(user, approvalType),
      requiresManager: requiresOwnershipApproval(approvalType),
      reservation: d.reservation === true,
      historical: !!d.backfill?.returned_at,
      customerName: d.customer.name,
      vehicles: d.vehicles
        .filter((row) => row.id)
        .map((row) => ({
          id: Number(row.id),
          label: `${row.license} · ${row.name}`,
        })),
      startsAt: d.start_date,
      endsAt: d.end_date,
      totalAmount: amount(d.total_amount),
      depositAmount: amount(d.deposit_amount),
      rentalPaid: context.paid_amount,
      depositPaid: context.deposit_paid,
      accounts: context.accounts.map((account) => ({
        id: account.id,
        label: account.label,
        method:
          account.kind === "cash"
            ? ("cash" as const)
            : account.owner_type === "company"
              ? ("company_transfer" as const)
              : ("transfer" as const),
      })),
      issues,
    };
  });
}
export async function writeMobileContractAction(
  user: SessionUser,
  request: NextRequest,
  id: number,
  action: MobileContractAction,
) {
  requireMobileContractAction(user);
  if (!validId(id) || !["finalize", "handover"].includes(action))
    throw new MobileError("Thao tác hợp đồng không hợp lệ.");
  const key = mobileRequestKey(request.headers.get("idempotency-key"));
  const body = await mobileBody(request, 32768);
  let input;
  try {
    if (action === "handover") input = parseHandoverInput(body);
    else {
      const parsed = parseFinalizeInput(body);
      if (!("receipts" in parsed))
        throw new MobileError("Nhập danh sách các khoản tiền thực nhận.");
      if (parsed.receipts.some((row) => !validDraftTime(row.paid_at)))
        throw new MobileError("Ngày giờ thực nhận tiền không hợp lệ.");
      input = parsed;
    }
  } catch (error) {
    if (error instanceof ContractFinalizeError)
      throw new MobileError(error.message, error.status, "INVALID_CONTRACT");
    throw error;
  }
  if (!/^[1-9]\d{0,19}$/.test(input.revision))
    throw new MobileError("Thiếu phiên bản hợp đồng hợp lệ.");
  return transaction(user, true, async (client) => {
    const receipt = await idempotentMobileWrite(
      client,
      user.id,
      key,
      `contract.${action}:${id}`,
      { id, input },
      async () => {
        const raw = await contractRow(client, id, true);
        if (String(raw.revision) !== input.revision)
          throw new MobileError(
            "Hợp đồng đã thay đổi. Tải lại trước khi xác nhận.",
            409,
            "CONTRACT_CHANGED",
          );
        const saved = snapshot(raw);
        if (
          !canFinalizeRentalContract(
            user,
            requiresOwnershipApproval(raw.order_type)
              ? raw.order_type
              : saved.rental_type,
          )
        )
          throw new MobileError(
            "Hợp đồng thuê sở hữu cần quản lý duyệt.",
            403,
            "FORBIDDEN",
          );
        if (action === "finalize") {
          if (raw.order_status !== "draft")
            throw new MobileError(
              "Hợp đồng không còn là bản nháp. Mở hồ sơ để kiểm tra.",
              409,
              "CONTRACT_CHANGED",
            );
          const issues = await validation(
            client,
            saved.draft,
            Number(raw.store_id),
          );
          const fields =
            "reservation" in input && input.reservation
              ? issues.reservation
              : issues.rental;
          if (Object.keys(fields).length)
            throw new MobileError(
              "Bổ sung thông tin bản nháp trước khi phát hành.",
              409,
              "DRAFT_INCOMPLETE",
              fields,
            );
          await finalizeContractDraft(
            client,
            id,
            user.id,
            input as ReturnType<typeof parseFinalizeInput>,
          );
        } else await handoverReservation(client, id, user.id, input.revision);
        const updated = await contractRow(client, id);
        return { id, revision: String(updated.revision) };
      },
    );
    await contractRow(client, receipt.id); // Replayed receipts must retain current visibility.
    return receipt;
  });
}
export async function readMobileContractReceipt(
  user: SessionUser,
  key: string,
) {
  requireMobileContractAction(user);
  mobileRequestKey(key);
  return transaction(user, false, async (client) => {
    const row = (
      await client.query(
        "SELECT operation,resource_id,resource_revision FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2",
        [user.id, key],
      )
    ).rows[0];
    if (
      !row ||
      row.resource_id == null ||
      !/^contract\.(finalize|handover):[1-9]\d{0,14}$/.test(
        String(row.operation),
      )
    )
      return { receipt: null };
    const id = Number(row.resource_id);
    if (!String(row.operation).endsWith(`:${id}`))
      throw new MobileError(
        "Kết quả lần lưu cần được đối chiếu.",
        409,
        "INVALID_WRITE_RECEIPT",
      );
    await contractRow(client, id);
    return {
      receipt: { id, revision: String(row.resource_revision), replayed: true },
    };
  });
}
// Existing notifications are manual outbox entries, never an automatic send.
// Queue after the financial transaction; retries share the same event key.
export async function queueMobileContractEvent(
  user: SessionUser,
  id: number,
  action: MobileContractAction,
) {
  try {
    await transaction(user, true, async (client) => {
      await client.query("SET LOCAL statement_timeout='60s'");
      const row = await contractRow(client, id);
      const composer = row.draft_payload?.management_composer;
      const code = String(
        composer?.finalized?.contract_number || row.contract_number || "",
      );
      if (
        (action === "finalize" && !composer?.finalized) ||
        (action === "handover" && !composer?.handover)
      )
        return;
      const kind =
        action === "handover"
          ? "handover"
          : composer?.reservation
            ? "reservation"
            : "rental";
      await queueContractNotification(
        client,
        id,
        kind,
        action === "handover" ? `handover:${id}` : `finalize:${id}:${code}`,
        user.id,
        action === "handover" ? "handover" : "rental",
      );
    });
  } catch {
    console.error("Mobile contract manual notification queue unavailable");
  }
}
