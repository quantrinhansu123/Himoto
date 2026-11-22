import "server-only";
import { hasPermission } from "@/lib/management/permissions";
import { mapApiRow } from "@/lib/management/repository";
import { contractStaffStoreId, createContractDraft } from "@/lib/management/contract-document";
import { CONTRACT_LIST_SQL } from "./contract-drafts";
import { contractVehicleDetailsSql } from "./contract-vehicle-reads";
import { readContractHistory } from "./contract-history";
import { mobileContractId } from "./mobile-contracts";
import { withMobileReadData } from "./mobile-context";
import { himotoPool } from "./himoto-database";
import type { SessionUser } from "./management-session";
import { MobileError } from "./mobile-session";
import type { MobileContractDetail } from "../../../shared/mobile-contract";

const text = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown): number | null =>
  v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);

export async function readMobileContractDetail(
  user: SessionUser,
  rawId: string,
): Promise<MobileContractDetail> {
  if (!hasPermission(user, "contracts.read")) {
    throw new MobileError("Tài khoản không có quyền xem chi tiết hợp đồng.", 403, "FORBIDDEN");
  }
  const id = mobileContractId(rawId);
  return withMobileReadData(user, "", async () => {
    const client = await himotoPool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout='20s'");
      const raw = (
        await client.query(
          contractVehicleDetailsSql(`${CONTRACT_LIST_SQL} AND o.id=$1`, "ARRAY[$1::bigint]"),
          [id],
        )
      ).rows[0];
      if (!raw) {
        throw new MobileError("Không tìm thấy hợp đồng trong phạm vi tài khoản.", 404, "NOT_FOUND");
      }
      const row = mapApiRow("contracts", raw);
      const draft = createContractDraft(
        { stores: [], staff: [], customers: [], contracts: [], vehicles: [] },
        "all",
        row,
      );
      const vehicleStoreId = contractStaffStoreId(draft);
      const storeIds = [...new Set([draft.store_id, vehicleStoreId].filter((v) => /^[1-9]\d{0,14}$/.test(v)).map(Number))];
      const storeRows = storeIds.length
        ? (await client.query("SELECT id,store_name FROM himoto.store_directory() WHERE id=ANY($1::bigint[])", [storeIds])).rows
        : [];
      const storeNames = new Map(storeRows.map((s) => [Number(s.id), String(s.store_name)]));

      const history = row.status !== "draft" ? await readContractHistory(client, id) : null;
      const batteryCountRes = await client.query(
        "SELECT count(*)::int AS count FROM himoto.management_battery_contracts WHERE vehicle_contract_id=$1 AND deleted_at IS NULL",
        [id],
      ).catch(() => ({ rows: [{ count: 0 }] }));

      const liveVehicles = JSON.parse(String(row.vehicles_json || "[]")) as Record<string, unknown>[];
      const legacyVehicles = JSON.parse(String(row.legacy_items_json || "[]")) as Record<string, unknown>[];
      const sourceVehicles = row.status !== "draft" && liveVehicles.length ? liveVehicles : legacyVehicles.length ? legacyVehicles : liveVehicles;

      const payload = (raw.draft_payload && typeof raw.draft_payload === "object" ? raw.draft_payload : {}) as Record<string, unknown>;
      const composer = (payload.management_composer && typeof payload.management_composer === "object" ? payload.management_composer : {}) as Record<string, unknown>;
      const approval = (composer.approval && typeof composer.approval === "object" ? composer.approval : null) as Record<string, unknown> | null;
      const lifecycle = (composer.lifecycle && typeof composer.lifecycle === "object" ? composer.lifecycle : null) as Record<string, unknown> | null;
      const badDebtClosure = (lifecycle?.bad_debt_closure && typeof lifecycle.bad_debt_closure === "object" ? lifecycle.bad_debt_closure : null) as Record<string, unknown> | null;

      let billingPlan: Record<string, unknown> | null = null;
      if (row.billing_plan_json) {
        try {
          billingPlan = JSON.parse(String(row.billing_plan_json)) as Record<string, unknown>;
        } catch {
          billingPlan = null;
        }
      }

      const receipts = history?.receipts ?? null;
      const receiptsPaid = receipts
        ? Math.max(receipts.rental_received + receipts.renewal_received - receipts.rental_refunded, 0)
        : null;
      const paymentMismatch =
        receiptsPaid !== null && row.paid_amount != null && receiptsPaid !== Number(row.paid_amount);

      const depositPaid = receipts?.deposit_received ?? num(row.deposit_paid);
      const depositRefunded = receipts?.deposit_refunded ?? num(row.deposit_refunded);
      const depositHeld =
        receipts?.deposit_held ??
        (depositPaid == null || depositRefunded == null ? null : Math.max(depositPaid - depositRefunded, 0));

      await client.query("COMMIT");

      return {
        id,
        code: row.code,
        status: row.status,
        revision: String(raw.draft_revision || ""),
        storeId: num(row.store_id),
        storeName: storeNames.get(Number(draft.store_id)) || text(row.store_name),
        vehicleStoreName: storeNames.get(Number(vehicleStoreId)) || text(row.store_name),
        rentalType: text(row.rental_type),
        contractTypeName: draft.contract_type_name || text(row.contract_type_name),
        ownershipTermMonths: text(draft.ownership_term_months || row.ownership_term_months),
        signedOn: draft.signed_on,
        createdOn: draft.created_on || text(row.created_at).slice(0, 10),
        customerSource: draft.customer_source,
        customerSourceUrl: draft.customer_source_url,
        staffName: draft.staff_name || text(row.staff_name),
        salesStaffName: draft.sales_staff_name || text(row.sales_staff_name),
        collateralDescription: draft.collateral_description,
        notes: text(row.notes),
        authorizationDate: draft.authorization_date,
        startDate: draft.start_date || text(row.start_date),
        endDate: draft.end_date || text(row.end_date),
        totalAmount: num(row.total_amount),
        paidAmount: num(row.paid_amount),
        depositAmount: num(draft.deposit_amount !== "" ? draft.deposit_amount : row.deposit_amount),
        depositPaid,
        depositRefunded,
        depositHeld,
        packageName: draft.package_name || text(row.package_name),
        unitPrice: num(draft.unit_price !== "" ? draft.unit_price : row.unit_price),
        paymentMethod: draft.payment_method,
        depositPaymentMethod: draft.deposit_payment_method,
        extraCharges: (draft.extra_charges || []).map((c) => ({
          name: c.name,
          amount: c.amount,
          method: c.method || "",
        })),
        hasBillingPlan: Boolean(billingPlan),
        billingNextDueAt: text(row.billing_next_due_at),
        billingDueAmount: num(row.billing_due_amount),
        billingOverdueAt: text(row.billing_overdue_at),
        holdUntil: text(row.hold_until),
        heldAt: text(row.held_at),
        completedFromHold: Number(row.completed_from_hold) === 1,
        badDebtClosedAt: text(row.bad_debt_closed_at || badDebtClosure?.at),
        approvalAt: text(approval?.at),
        approvalByName: text(approval?.actor_name),
        paymentMismatch,
        receiptsPaid,
        receipts: receipts
          ? {
              received: receipts.received,
              spent: receipts.spent,
              rentalReceived: receipts.rental_received,
              renewalReceived: receipts.renewal_received,
              otherReceived: receipts.other_received,
              depositReceived: receipts.deposit_received,
              depositRefunded: receipts.deposit_refunded,
              depositHeld: receipts.deposit_held,
              rentalRefunded: receipts.rental_refunded,
              net: receipts.net,
            }
          : null,
        batteryCount: Number(batteryCountRes.rows[0]?.count || 0),
        customer: {
          id: row.customer_id ? Number(row.customer_id) : null,
          name: draft.customer.name || text(row.customer_name),
          phone: draft.customer.phone || text(row.customer_phone),
          email: draft.customer.email,
          address: draft.customer.address,
          idCard: draft.customer.id_card,
          idCardIssuedOn: draft.customer.id_card_issued_on,
          idCardIssuedBy: draft.customer.id_card_issued_by,
          driverLicenseNumber: draft.customer.driver_license_number,
          driverLicenseIssuedOn: draft.customer.driver_license_issued_on,
          customerNote: draft.customer.warning_note,
          relatives: draft.relatives.filter((r) => r.name || r.phone),
        },
        vehicles: draft.vehicles.map((v, index) => {
          const live = sourceVehicles[index] || sourceVehicles.find((s) => String(s.vehicle_id ?? s.id) === v.id) || {};
          return {
            id: v.id,
            name: v.name || text(live.name),
            license: v.license || text(live.license),
            stockStoreName: v.stock_store_name || text(live.store_name),
            color: v.color || text(live.color),
            typeText: v.type_text,
            brand: v.brand || text(live.brand),
            year: v.year || text(live.year),
            driverName: v.driver_name,
            driverLicenseNumber: v.driver_license_number,
            driverLicenseIssuedOn: v.driver_license_issued_on,
            borrowHats: v.borrow_hats || text(live.borrow_hats),
            borrowRaincoats: v.borrow_raincoats || text(live.borrow_raincoats),
            rentAt: text(live.rent_at || v.rent_at || draft.start_date),
            returnAt: text(live.return_at || v.return_at || draft.end_date),
            completedAt: text(live.completed_at),
          };
        }),
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });
}
