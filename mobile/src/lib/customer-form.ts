import type {
  MobileCustomerInput,
  MobileCustomerProfile,
} from "@himoto/mobile-contract";
export const customerStatuses = [
  { value: "draft", label: "Chưa hoàn tất" },
  { value: "active", label: "Bình thường" },
  { value: "warning", label: "Cần lưu ý" },
  { value: "blacklist", label: "Blacklist (khách nợ xấu)" },
] as const;
export function emptyCustomer(storeId: number | null, incomplete = false): MobileCustomerInput {
  return {
    name: "",
    phone: "",
    email: "",
    address: "",
    id_card: "",
    customer_type: "vietnam",
    nationality: "",
    contact_channel: "",
    contact_detail: "",
    store_id: storeId || 0,
    status: incomplete ? "draft" : "active",
    warning_note: "",
    driver_license_number: "",
    driver_license_issued_on: "",
    id_card_issued_on: "",
    id_card_issued_by: "",
    relatives: [],
  };
}
export function customerInput(
  profile: MobileCustomerProfile,
): MobileCustomerInput {
  const { id: _id, revision: _revision, ...fields } = profile;
  return { ...fields, store_id: profile.store_id || 0 };
}
export type CustomerErrors = Partial<Record<keyof MobileCustomerInput, string>>;
export function customerErrors(
  value: MobileCustomerInput,
  creating: boolean,
): CustomerErrors {
  const errors: CustomerErrors = {};
  const complete = value.status !== "draft",
    foreign = value.customer_type === "foreign";
  if (!value.name.trim()) errors.name = "Nhập họ và tên khách hàng.";
  if (!value.store_id) errors.store_id = "Chọn cơ sở quản lý khách hàng.";
  if (
    !foreign &&
    ((!value.phone.trim() && complete) ||
      (value.phone.trim() &&
        !/^\+?\d{9,13}$/.test(value.phone.replace(/[\s.()-]/g, ""))))
  )
    errors.phone = "Nhập số điện thoại có 9–13 chữ số.";
  if (foreign && !value.phone.trim() && !value.contact_detail.trim())
    errors.contact_detail = "Nhập điện thoại hoặc thông tin liên hệ.";
  if (creating && complete && !foreign && !value.address.trim())
    errors.address = "Nhập địa chỉ khách hàng.";
  const identity = value.id_card.replace(/\s/g, "");
  if (
    (creating && complete && !identity) ||
    (identity && !foreign && !/^\d{9}$|^\d{12}$/.test(identity))
  )
    errors.id_card = foreign
      ? "Nhập số hộ chiếu."
      : "CCCD/CMND cần có 9 hoặc 12 chữ số.";
  if (
    value.email.trim() &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim())
  )
    errors.email = "Email chưa đúng định dạng.";
  for (const key of [
    "id_card_issued_on",
    "driver_license_issued_on",
  ] as const) {
    const date = value[key];
    if (
      date &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
        new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)
    )
      errors[key] = "Ngày đã chọn không hợp lệ.";
  }
  if (
    value.relatives.some(
      (relative) =>
        (!relative.name.trim() && (relative.relationship || relative.phone)) ||
        (relative.phone &&
          !/^\+?\d{9,13}$/.test(relative.phone.replace(/[\s.()-]/g, ""))),
    )
  )
    errors.relatives =
      "Kiểm tra tên và số điện thoại người thân (9–13 chữ số).";
  return errors;
}
