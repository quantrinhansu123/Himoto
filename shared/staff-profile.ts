import { normalizeStaffPosition } from "./staff-positions";
export interface StaffProfileInput {
  name: string; phone: string; email: string; position: string;
  store_id: number | null; status: string; joined_at?: string;
}
export const STAFF_PROFILE_STATUSES = [{ value: "active", label: "Bình thường" }, { value: "inactive", label: "Tạm nghỉ" }, { value: "leave", label: "Đã nghỉ việc" }];
export function staffProfileValues(body: Record<string, unknown>): StaffProfileInput {
  const str = (value: unknown) => typeof value === "string" ? value.trim() : "";
  return { name: str(body.name), phone: str(body.phone), email: str(body.email), position: normalizeStaffPosition(str(body.position)), status: str(body.status), store_id: body.store_id == null || body.store_id === "" ? null : Number(body.store_id) };
}
export function validateStaffProfile(input: StaffProfileInput) {
  const errors: Record<string, string> = {};
  if (!input.name || input.name.length > 191) errors.name = "Nhập họ tên, tối đa 191 ký tự.";
  if (input.position.length > 191) errors.position = "Chức vụ tối đa 191 ký tự.";
  if (!/^\+?\d{9,13}$/.test(input.phone.replace(/[\s.()-]/g, ""))) errors.phone = "Số điện thoại cần 9–13 chữ số.";
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) errors.email = "Email chưa hợp lệ.";
  if (!STAFF_PROFILE_STATUSES.some(row => row.value === input.status)) errors.status = "Chọn trạng thái hợp lệ.";
  if (input.store_id !== null && (!Number.isInteger(input.store_id) || input.store_id <= 0)) errors.store_id = "Chọn cơ sở hợp lệ.";
  if (input.joined_at && !/^\d{4}-\d{2}-\d{2}$/.test(input.joined_at)) errors.joined_at = "Ngày vào làm không hợp lệ.";
  return errors;
}
