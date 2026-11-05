import "server-only";
import { createHash } from "node:crypto";
import { sameRenewalPeriod, type RenewalNotice } from "./contract-notification-content";

const MAX_AMOUNT = 9_999_999_999_999;
type Row = Record<string, unknown>;
const object = (value: unknown): value is Row => !!value && typeof value === "object" && !Array.isArray(value);
const positive = (value: unknown) => (typeof value === "number" || typeof value === "string" && /^[1-9]\d{0,14}$/.test(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
const timestamp = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
  return new Date(value).toISOString();
};

export class RenewalCollectionPeriodError extends Error {
  constructor(message: string) { super(message); }
}
/** The caller queries approved incoming receipts grouped by the original
 * period identity. Group sums keep the projection bounded even after many
 * partial receipts. This helper never changes a rental period or records money.
 */
export function renewalCollectionPeriod(orderId: number, versions: unknown, version: number,
  groups: { version: string; period: Partial<RenewalNotice>; amount: unknown }[]) {
  if (!positive(orderId) || !Number.isSafeInteger(version) || version < 2 || version > 999999999999999)
    throw new RenewalCollectionPeriodError("Hợp đồng hoặc phiên bản gia hạn không hợp lệ.");
  if (!Array.isArray(versions) || versions.length > 10000 || groups.length > 1000)
    throw new RenewalCollectionPeriodError("Lịch sử gia hạn cần đối chiếu trước khi thu theo phiên bản.");
  const matches = versions.filter(row => object(row) && row.kind === "renewal" && Number(row.version) === version);
  if (matches.length !== 1) throw new RenewalCollectionPeriodError("Phiên bản gia hạn bị thiếu hoặc trùng; đối chiếu hồ sơ trước khi thu.");
  const saved = matches[0] as Row;
  const end = timestamp(saved.return_at), before = saved.before_return_at == null ? null : timestamp(saved.before_return_at);
  const created = saved.created_at == null ? null : timestamp(saved.created_at), amount = saved.amount;
  if (!positive(saved.item_id) || !positive(saved.vehicle_id) || !end ||
    (saved.before_return_at != null && !before) || (before !== null && end !== null && Date.parse(end) <= Date.parse(before)) || (saved.created_at != null && !created) ||
    typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0 || amount > MAX_AMOUNT ||
    !sameRenewalPeriod(saved as Partial<RenewalNotice>, saved as Partial<RenewalNotice>))
    throw new RenewalCollectionPeriodError("Kỳ hoặc phí gia hạn chưa đủ rõ để liên kết khoản thu.");
  let collected = 0;
  for (const group of groups) {
    // Match the existing writer's version/period rules; an older corrected
    // coverage interval must never consume this interval's remaining fee.
    if (group.version !== String(version) || !object(group.period) || !sameRenewalPeriod(group.period, saved as Partial<RenewalNotice>)) continue;
    const paid = Number(group.amount);
    if (!(typeof group.amount === "number" || typeof group.amount === "string" && group.amount.length <= 64 && /^(0|[1-9]\d{0,12})(?:\.0+)?$/.test(group.amount)) ||
      !Number.isSafeInteger(paid) || paid < 0 || paid > MAX_AMOUNT || collected + paid > MAX_AMOUNT)
      throw new RenewalCollectionPeriodError("Số tiền đã thu cho kỳ gia hạn cần đối chiếu.");
    collected += paid;
  }
  if (collected > amount) throw new RenewalCollectionPeriodError("Các phiếu đã thu vượt phí gia hạn. Đối chiếu trước khi ghi thêm.");
  const identity = { orderId, version, itemId: Number(saved.item_id), vehicleId: Number(saved.vehicle_id),
    beforeReturnAt: before, returnAt: end, createdAt: created, amount, collected };
  return { ...identity, vehicleName: typeof saved.vehicle_name === "string" ? saved.vehicle_name.slice(0, 4000) : "",
    license: typeof saved.license === "string" ? saved.license.slice(0, 4000) : "", remaining: amount - collected,
    snapshot: createHash("sha256").update(JSON.stringify(identity)).digest("hex") };
}
