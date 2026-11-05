import "server-only";
import type { PoolClient } from "pg";
import { parseCustomerRelatives } from "@/lib/management/customer-relatives";
import { validIdentityIssueDate } from "@/lib/management/customer-identity";

export class CustomerWriteError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export class CustomerDuplicateError extends CustomerWriteError {}
export function parseCustomerWrite(input: unknown, mode: "create" | "update") {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new CustomerWriteError("Thông tin khách hàng không hợp lệ.");
  const body = input as Record<string, unknown>;
  const string = (key: string) =>
    typeof body[key] === "string" ? body[key].trim() : "";
  const name = string("name"),
    phone = string("phone"),
    email = string("email"),
    address = string("address");
  const idCard = string("id_card").replace(/\s/g, "").toUpperCase();
  const customerType = body.customer_type === "foreign" ? "foreign" : "vietnam";
  const nationality = string("nationality"),
    contactChannel = string("contact_channel"),
    contactDetail = string("contact_detail");
  const foreign = customerType === "foreign";
  if (
    (body.customer_type !== undefined &&
      (typeof body.customer_type !== "string" ||
        !["", "vietnam", "foreign"].includes(body.customer_type))) ||
    [nationality, contactChannel, contactDetail, phone].some(
      (value) => value.length > 1000,
    ) ||
    (foreign && !phone && !contactDetail)
  )
    throw new CustomerWriteError(
      "Nhập kênh liên hệ hợp lệ của khách nước ngoài.",
    );
  const storeId =
    body.store_id == null || body.store_id === ""
      ? null
      : Number(body.store_id);
  const status = String(body.status || (mode === "create" ? "active" : ""));
  const incomplete =
    mode === "create"
      ? body.allow_incomplete === true && status === "draft"
      : status === "draft";
  if (
    mode === "create" &&
    body.allow_incomplete !== undefined &&
    (typeof body.allow_incomplete !== "boolean" ||
      (body.allow_incomplete && status !== "draft"))
  )
    throw new CustomerWriteError(
      "Hồ sơ tạm cần chọn trạng thái Chưa hoàn tất.",
    );
  const phoneOk =
    foreign ||
    (!phone && incomplete) ||
    /^\+?\d{9,13}$/.test(phone.replace(/[\s.()-]/g, ""));
  const warning = string("warning_note"),
    driverLicenseNumber = string("driver_license_number"),
    driverLicenseIssuedOn = string("driver_license_issued_on");
  const idCardIssuedOn = string("id_card_issued_on"),
    idCardIssuedBy = string("id_card_issued_by");
  if (!validIdentityIssueDate(idCardIssuedOn) || idCardIssuedBy.length > 255)
    throw new CustomerWriteError(
      "Ngày cấp hoặc nơi cấp CCCD/CMND không hợp lệ.",
    );
  let relatives: ReturnType<typeof parseCustomerRelatives> | undefined;
  try {
    relatives =
      mode === "update" && body.relatives === undefined
        ? undefined
        : parseCustomerRelatives(
            mode === "create" ? (body.relatives ?? []) : body.relatives,
          );
  } catch (error) {
    throw new CustomerWriteError(
      error instanceof Error
        ? error.message
        : "Thông tin người thân không hợp lệ.",
    );
  }
  if (
    !name ||
    (mode === "create" && !foreign && !incomplete && !address) ||
    !phoneOk ||
    (idCard
      ? foreign
        ? idCard.length > 100
        : !/^\d{9}$|^\d{12}$/.test(idCard)
      : mode === "create" && !incomplete) ||
    (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
    !["active", "warning", "blacklist", "draft"].includes(status) ||
    !validIdentityIssueDate(driverLicenseIssuedOn) ||
    driverLicenseNumber.length > 100 ||
    (storeId !== null && (!Number.isInteger(storeId) || storeId <= 0))
  )
    throw new CustomerWriteError(
      mode === "create"
        ? "Kiểm tra họ tên, điện thoại, CCCD/CMND, địa chỉ và email."
        : "Kiểm tra họ tên, số điện thoại, giấy tờ, email, cơ sở và trạng thái hồ sơ.",
    );
  return {
    name,
    phone,
    email,
    address,
    idCard,
    customerType,
    nationality,
    contactChannel,
    contactDetail,
    storeId,
    status,
    warning,
    driverLicenseNumber,
    driverLicenseIssuedOn,
    idCardIssuedOn,
    idCardIssuedBy,
    relatives,
    hasIdCardIssuedOn: "id_card_issued_on" in body,
    hasIdCardIssuedBy: "id_card_issued_by" in body,
  };
}
export type CustomerWrite = ReturnType<typeof parseCustomerWrite>;

// Caller owns the transaction. Preserve serialization with Excel imports and
// cross-branch duplicate checks; never run these writes on an owner fallback.
async function lockCustomers(client: PoolClient, key: string) {
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("LOCK TABLE himoto.customers IN SHARE ROW EXCLUSIVE MODE");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    key,
  ]);
}
export async function insertCustomer(client: PoolClient, data: CustomerWrite) {
  await lockCustomers(client, data.idCard);
  const duplicate = await client.query(
    "SELECT id FROM himoto.find_customer_duplicate($1,$2,NULL) AS id WHERE id IS NOT NULL",
    [data.idCard, data.phone.replace(/\D/g, "")],
  );
  if (duplicate.rowCount)
    throw new CustomerDuplicateError(
      "Khách hàng có số giấy tờ hoặc điện thoại này đã tồn tại.",
      409,
    );
  const result = await client.query(
    `INSERT INTO himoto.customers (name, phone, email, address, id_card, status, store_id, warning, driver_license_number, driver_license_issued_on, relatives, id_card_issued_on, id_card_issued_by, customer_type, nationality, contact_channel, contact_detail, created_at, updated_at)
     VALUES ($1,$2,NULLIF($3,''),$4,NULLIF($5,''),$6,$7,$8,NULLIF($9,''),NULLIF($10,'')::date,$11::jsonb,NULLIF($12,'')::date,NULLIF($13,''),$14,$15,$16,$17,now(),now())
     RETURNING id,name,phone,email,address,id_card,driver_license_number,driver_license_issued_on::text AS driver_license_issued_on,
       CASE WHEN status=2 THEN 'bad_debt' WHEN NULLIF(BTRIM(warning),'') IS NOT NULL THEN 'warning' WHEN status=0 THEN 'draft' ELSE 'active' END AS status,
       warning,created_at,xmin::text AS customer_revision,id_card_issued_on,id_card_issued_by,relatives,store_id,customer_type,nationality,contact_channel,contact_detail`,
    [
      data.name,
      data.phone,
      data.email,
      data.address,
      data.idCard,
      data.status === "blacklist" ? 2 : data.status === "draft" ? 0 : 1,
      data.storeId,
      data.status === "blacklist"
        ? data.warning || "Blacklist"
        : data.status === "warning"
          ? data.warning || "Cần lưu ý"
          : null,
      data.driverLicenseNumber,
      data.driverLicenseIssuedOn,
      JSON.stringify(data.relatives ?? []),
      data.idCardIssuedOn,
      data.idCardIssuedBy,
      data.customerType,
      data.nationality,
      data.contactChannel,
      data.contactDetail,
    ],
  );
  return result.rows[0];
}
export async function updateCustomer(
  client: PoolClient,
  id: number,
  data: CustomerWrite,
  options: { revision?: string; updateEmail?: boolean } = {},
) {
  await lockCustomers(client, `customer:${data.idCard || `id:${id}`}`);
  if (options.revision !== undefined) {
    const current = await client.query(
      "SELECT id,xmin::text AS customer_revision FROM himoto.customers WHERE id=$1 FOR UPDATE",
      [id],
    );
    if (!current.rows.length)
      throw new CustomerWriteError(
        "Không tìm thấy khách hàng cần cập nhật.",
        404,
      );
    if (current.rows[0].customer_revision !== options.revision)
      throw new CustomerWriteError(
        "Hồ sơ đã được thay đổi. Tải lại để xem thông tin mới trước khi lưu.",
        409,
      );
  }
  const duplicate = data.idCard
    ? await client.query(
        "SELECT id FROM himoto.find_customer_duplicate($2,'',$1) AS id WHERE id IS NOT NULL",
        [id, data.idCard],
      )
    : { rowCount: 0 };
  if (duplicate.rowCount)
    throw new CustomerDuplicateError(
      "Số CCCD/CMND này đã thuộc hồ sơ khách hàng khác.",
      409,
    );
  const result = await client.query(
    `UPDATE himoto.customers SET name=$2,phone=$3,address=NULLIF($4,''),id_card=NULLIF($5,''),status=$6,warning=$7,store_id=$8,
       driver_license_number=NULLIF($9,''),driver_license_issued_on=NULLIF($10,'')::date,relatives=COALESCE($11::jsonb,relatives),
       id_card_issued_on=CASE WHEN $12::boolean THEN NULLIF($13,'')::date ELSE id_card_issued_on END,
       id_card_issued_by=CASE WHEN $14::boolean THEN NULLIF($15,'') ELSE id_card_issued_by END,
       customer_type=$16,nationality=$17,contact_channel=$18,contact_detail=$19,
       email=CASE WHEN $20::boolean THEN NULLIF($21,'') ELSE email END,updated_at=now()
     WHERE id=$1 RETURNING id,name,email,phone,address,id_card,driver_license_number,driver_license_issued_on::text AS driver_license_issued_on,
       CASE WHEN status=2 THEN 'bad_debt' WHEN NULLIF(BTRIM(warning),'') IS NOT NULL THEN 'warning' WHEN status=0 THEN 'draft' ELSE 'active' END AS status,
       warning AS warning_note,created_at,xmin::text AS customer_revision,id_card_issued_on,id_card_issued_by,relatives,store_id,customer_type,nationality,contact_channel,contact_detail`,
    [
      id,
      data.name,
      data.phone,
      data.address,
      data.idCard,
      data.status === "blacklist" ? 2 : data.status === "draft" ? 0 : 1,
      data.status === "blacklist"
        ? data.warning || "Blacklist"
        : data.status === "warning"
          ? data.warning || "Cần lưu ý"
          : null,
      data.storeId,
      data.driverLicenseNumber,
      data.driverLicenseIssuedOn,
      data.relatives === undefined ? null : JSON.stringify(data.relatives),
      data.hasIdCardIssuedOn,
      data.idCardIssuedOn,
      data.hasIdCardIssuedBy,
      data.idCardIssuedBy,
      data.customerType,
      data.nationality,
      data.contactChannel,
      data.contactDetail,
      options.updateEmail === true,
      data.email,
    ],
  );
  if (!result.rowCount)
    throw new CustomerWriteError(
      "Không tìm thấy khách hàng cần cập nhật.",
      404,
    );
  return result.rows[0];
}
