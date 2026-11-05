import {plateKey,isMobilePlateMatch} from '../../../shared/mobile-plate-ocr';
import "server-only";
import type { NextRequest } from "next/server";
import { hasPermission } from "@/lib/management/permissions";
import { VEHICLE_TYPES } from "@/lib/management/config";
import { matchesCommissionRole, staffCustomerSourceLabel } from "@/lib/management/staff-positions";
import {
  customerDetails,
  emptyVehicle,
  normalizeCustomerLookup,
  relativesFromRow,
  validCustomerLookup,
} from "@/lib/management/contract-document";
import { mapApiRow } from "@/lib/management/repository";
import { CUSTOMER_PROFILE_SQL, CUSTOMER_SEARCH_SQL } from "./customer-search";
import { ownerDatabase } from "./himoto-database";
import { readDraftVehicleRentals } from "./draft-vehicle-rentals";
import { requireMobileDraft, withMobileDraft } from "./mobile-drafts";
import { localRentalTime } from "./mobile-draft-shape";
import { MobileError } from "./mobile-session";
import { mobileBody } from "./mobile-writes";
import type { SessionUser } from "./management-session";
import type {
  MobileDraftCustomer,
  MobileDraftInventory,
  MobileVehicleAvailability,
  MobileDraftStaff,
} from "../../../shared/mobile-contract";

export async function readMobileDraftStaff(
  user: SessionUser,
): Promise<{ rows: MobileDraftStaff[] }> {
  requireMobileDraft(user);
  const client = await ownerDatabase.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout='15s'");
    const result = await client.query(
      "SELECT id,full_name,position,store_id FROM himoto.staff_profiles WHERE status::text IN ('active','1') ORDER BY full_name,id",
    );
    await client.query("COMMIT");
    return {
      rows: result.rows.map((row) => ({
        id: Number(row.id),
        name: String(row.full_name),
        sourceLabel: staffCustomerSourceLabel(String(row.full_name), row.position),
        position: String(row.position || ''),
        storeId: row.store_id == null ? null : Number(row.store_id),
        roles: [
          "representative" as const,
          ...(matchesCommissionRole(row.position, "NVKD")
            ? ["sales" as const]
            : []),
          ...(matchesCommissionRole(row.position, "TLS")
            ? ["telesales" as const]
            : []),
        ],
      })),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

const text = (value: unknown) =>
  value == null
    ? ""
    : value instanceof Date
      ? value.toISOString()
      : String(value);
const positive = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const folded = (sql: string) =>
  `lower(translate(regexp_replace(normalize(COALESCE(${sql},''),NFD) COLLATE "C",'[\u0300-\u036f]','','g'),'đĐ','dD'))`;
function requireVehicles(user: SessionUser) {
  requireMobileDraft(user);
  if (!hasPermission(user, "vehicles.read"))
    throw new MobileError(
      "Tài khoản không có quyền chọn xe.",
      403,
      "FORBIDDEN",
    );
}
export async function lookupMobileDraftCustomer(
  user: SessionUser,
  request: NextRequest,
): Promise<{ rows: MobileDraftCustomer[]; hasMore: boolean }> {
  requireMobileDraft(user);
  if (!hasPermission(user, "customers.read"))
    throw new MobileError(
      "Tài khoản không có quyền tra cứu khách hàng.",
      403,
      "FORBIDDEN",
    );
  const input = await mobileBody(request, 2048);
  if (Object.keys(input).length !== 1 || !("id" in input || "query" in input))
    throw new MobileError(
      "Chọn khách hàng hoặc nhập thông tin tra cứu chính xác.",
    );
  if ("id" in input && !positive(input.id))
    throw new MobileError("Mã khách hàng không hợp lệ.");
  if (
    "query" in input &&
    (typeof input.query !== "string" ||
      input.query.length > 100 ||
      !validCustomerLookup(input.query))
  )
    throw new MobileError(
      "Nhập đủ số điện thoại, giấy tờ hoặc kênh liên hệ để tra cứu chính xác.",
    );
  // Exact cross-branch lookup has the same purpose as the existing web
  // composer. Numeric selection is limited to the caller's scoped catalogue.
  const result =
    "id" in input
      ? await withMobileDraft(user, "", (client) =>
          client.query(`${CUSTOMER_PROFILE_SQL} WHERE c.id=$1 LIMIT 1`, [
            input.id,
          ]),
        )
      : await (async () => {
          const client = await ownerDatabase.connect();
          try {
            await client.query("BEGIN READ ONLY");
            await client.query("SET LOCAL statement_timeout='15s'");
            const found = await client.query(
              `${CUSTOMER_SEARCH_SQL} LIMIT 11`,
              [normalizeCustomerLookup(String(input.query))],
            );
            await client.query("COMMIT");
            return found;
          } catch (error) {
            await client.query("ROLLBACK").catch(() => {});
            throw error;
          } finally {
            client.release();
          }
        })();
  return {
    hasMore: result.rows.length > 10,
    rows: result.rows.slice(0, 10).map((raw) => {
      const row = mapApiRow("customers", raw);
      return {
        id: row.id,
        storeId: row.store_id == null ? null : Number(row.store_id),
        storeName: text(row.store_name),
        status: row.status,
        details: customerDetails(row),
        relatives: relativesFromRow(row),
      };
    }),
  };
}
export async function readMobileDraftInventory(
  user: SessionUser,
  params: URLSearchParams,
): Promise<MobileDraftInventory> {
  requireVehicles(user);
  for (const key of params.keys())
    if (
      !["search", "store", "page"].includes(key) ||
      params.getAll(key).length !== 1
    )
      throw new MobileError("Bộ lọc xe không hợp lệ.");
  const search = (params.get("search") || "").trim();
  const store = params.get("store") || "";
  const page = params.get("page") || "1";
  if (
    search.length > 120 ||
    (store && !/^[1-9]\d{0,14}$/.test(store)) ||
    !/^[1-9]\d{0,3}$/.test(page)
  )
    throw new MobileError("Bộ lọc xe không hợp lệ.");
  const needle = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  return withMobileDraft(user, "fleet_read", async (client) => {
    const result = await client.query(
      `SELECT stock.id,stock.name,stock.license,stock.type,stock.status,stock.store_id,stock.store_name,v.brand,v.color,v.year
      FROM himoto.vehicle_inventory() stock JOIN himoto.vehicles v ON v.id=stock.id
      WHERE stock.store_id>0 AND v.deleted_at IS NULL AND ($1::bigint IS NULL OR stock.store_id=$1)
        AND ($2='' OR ${folded("stock.name")} LIKE ${folded("$3")} OR stock.license ILIKE $3
          OR ($2 ~ '[0-9]' AND regexp_replace(upper(COALESCE(stock.license,'')),'[^A-Z0-9]','','g') LIKE '%'||regexp_replace(upper($2),'[^A-Z0-9]','','g')||'%'))
      ORDER BY stock.store_name,stock.license,stock.id LIMIT 21 OFFSET $4`,
      [store || null, search, needle, (Number(page) - 1) * 20],
    );
    return {
      page: Number(page),
      hasMore: result.rows.length > 20,
      rows: result.rows.slice(0, 20).map(mapDraftInventoryRow),
    };
  });
}
export async function readMobileDraftAvailability(
  user: SessionUser,
  request: NextRequest,
): Promise<MobileVehicleAvailability> {
  requireVehicles(user);
  const input = await mobileBody(request, 4096);
  if (
    Object.keys(input).some(
      (key) => !["vehicleIds", "startsAt", "endsAt", "draftId"].includes(key),
    ) ||
    !Array.isArray(input.vehicleIds) ||
    !input.vehicleIds.length ||
    input.vehicleIds.length > 50 ||
    !input.vehicleIds.every(positive) ||
    !localRentalTime(input.startsAt) ||
    !localRentalTime(input.endsAt) ||
    input.endsAt <= input.startsAt ||
    (input.draftId !== undefined && !positive(input.draftId))
  )
    throw new MobileError("Chọn xe và khoảng thời gian thuê hợp lệ.");
  const ids = [...new Set(input.vehicleIds)] as number[];
  const start = input.startsAt,
    end = input.endsAt;
  return withMobileDraft(user, "fleet_read", async (client) => {
    if (input.draftId !== undefined) {
      const own = await client.query(
        "SELECT id FROM himoto.orders WHERE id=$1 AND order_status='draft' AND deleted_at IS NULL",
        [input.draftId],
      );
      if (!own.rowCount)
        throw new MobileError(
          "Không tìm thấy bản nháp trong phạm vi được cấp.",
          404,
          "NOT_FOUND",
        );
    }
    const stock = await client.query(
      "SELECT id,status FROM himoto.vehicle_inventory() WHERE id=ANY($1::bigint[]) AND store_id>0",
      [ids],
    );
    if (stock.rowCount !== ids.length)
      throw new MobileError(
        "Có xe không còn trong kho chung. Chọn lại xe.",
        409,
        "VEHICLE_CHANGED",
      );
    // Carry the requested ID through each function call: duplicate licence
    // plates must not associate another vehicle's conflicts with this one.
    const conflicts = await client.query(
      `SELECT requested.id AS vehicle_id,c.code,c.store_name,c.status,c.rent_at,c.return_at,c.severity
      FROM unnest($1::bigint[]) requested(id)
      CROSS JOIN LATERAL himoto.vehicle_window_conflicts(ARRAY[requested.id],$2,$3::timestamptz,$4::timestamptz) c`,
      [ids, input.draftId ?? null, `${start}:00+07:00`, `${end}:00+07:00`],
    );
    const drafts = await readDraftVehicleRentals(client, ids);
    return {
      checkedAt: new Date().toISOString(),
      startsAt: start,
      endsAt: end,
      vehicles: stock.rows.map((row) => {
        const blockers = conflicts.rows.filter(
          (c) => Number(c.vehicle_id) === Number(row.id),
        );
        const holds = drafts.filter(
          (d) =>
            d.vehicle_id === Number(row.id) && d.order_id !== input.draftId,
        );
        return {
          id: Number(row.id),
          status: text(row.status),
          hasHardBlocker: blockers.some(
            (c) => c.severity !== "reservation_overlap",
          ),
          reservationOverlap: blockers.some(
            (c) => c.severity === "reservation_overlap",
          ),
          blockersTotal: blockers.length,
          draftsTotal: holds.length,
          blockers: blockers.slice(0, 20).map((c) => ({
            code: text(c.code),
            storeName: text(c.store_name),
            status: text(c.status),
            startsAt: text(c.rent_at),
            endsAt: text(c.return_at),
            severity:
              c.severity === "reservation_overlap"
                ? ("reservation_overlap" as const)
                : ("hard" as const),
          })),
          drafts: holds.slice(0, 20).map((d) => ({
            code: d.code,
            storeName: d.store_name,
            startsAt: d.rent_at || "",
            endsAt: d.return_at || "",
          })),
        };
      }),
    };
  });
}

export function mapDraftInventoryRow(row:Record<string,unknown>):MobileDraftInventory["rows"][number] {return {
        status: text(row.status),
        storeId: Number(row.store_id),
        storeName: text(row.store_name),
        vehicle: {
          ...emptyVehicle(),
          id: text(row.id),
          name: text(row.name),
          license: text(row.license),
          brand: text(row.brand),
          color: text(row.color),
          year: text(row.year),
          type_text:
            VEHICLE_TYPES.find((type) => type.value === row.type)?.label ||
            text(row.type),
          stock_store_id: text(row.store_id),
          stock_store_name: text(row.store_name),
        },
      };}

export async function lookupMobileDraftPlate(user:SessionUser,params:URLSearchParams) {
  requireVehicles(user);
  const license=params.get('license')||'';
  if([...params.keys()].some(k=>k!=='license'||params.getAll(k).length!==1)||license.length>25||!/^\d{2}[A-Z]{1,2}\d?\d{4,6}$/.test(plateKey(license)))
    throw new MobileError('Biển số cần đối chiếu chưa hợp lệ.',400,'INVALID_PLATE');
  return withMobileDraft(user,'fleet_read',async client=>{
    const rows=(await client.query(`SELECT stock.id,stock.name,stock.license,stock.type,stock.status,stock.store_id,stock.store_name,v.brand,v.color,v.year
      FROM himoto.vehicle_inventory() stock JOIN himoto.vehicles v ON v.id=stock.id
      WHERE stock.store_id>0 AND v.deleted_at IS NULL AND regexp_replace(upper(COALESCE(stock.license,'')),'[^A-Z0-9]','','g')=$1 ORDER BY stock.id LIMIT 2`,[plateKey(license)])).rows;
    const result={license,match:rows.length===1?'unique':rows.length?'ambiguous':'none',vehicle:rows.length===1?mapDraftInventoryRow(rows[0]):null,observedAt:new Date().toISOString()};
    if(!isMobilePlateMatch(result,license))throw new MobileError('Kết quả đối chiếu biển số chưa hợp lệ.',503,'INVALID_PLATE_MATCH');return result;
  });
}
