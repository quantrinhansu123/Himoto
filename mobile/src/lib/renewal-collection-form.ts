import { validDraftTime } from "@himoto/mobile-draft-validation";
import type { MobileCollectionMethod } from "@himoto/mobile-contract";
import type { MobileRenewalCollectionInput, MobileRenewalCollectionPreparation } from "../../../shared/mobile-renewal-collection";

export function reviewRenewalCollection(data: MobileRenewalCollectionPreparation, form: {
  amount: string; method: MobileCollectionMethod; account: string; paidAt: string; note: string;
  reviewedBill: { version: number; revision: string } | null;
}, now: number): MobileRenewalCollectionInput {
  if (!data.canWrite || !data.available) throw Error(data.blockedReason || "Tài khoản chưa thể ghi khoản thu theo kỳ.");
  if (!/^[1-9]\d{0,12}$/.test(form.amount)) throw Error("Nhập số tiền nguyên dương bằng VND, tối đa 13 chữ số.");
  if (Number(form.amount) > data.period.remaining) throw Error("Số tiền nhập vượt phần phí còn thiếu của kỳ đã chọn.");
  const account = data.accounts.find(row => row.method === form.method && `${row.method}:${row.id}` === form.account);
  if (!account) throw Error("Chọn đúng tài khoản đã thực nhận tiền.");
  if (!validDraftTime(form.paidAt) || Date.parse(`${form.paidAt}:00+07:00`) > now + 5 * 60000) throw Error("Chọn đúng thời điểm thực thu, không chọn ngày giờ tương lai.");
  if (form.note.trim().length > 2000) throw Error("Nội dung thu tối đa 2.000 ký tự.");
  if (!form.reviewedBill || form.reviewedBill.version !== data.period.version || !/^[1-9]\d{0,19}$/.test(form.reviewedBill.revision))
    throw Error("Lưu và rà soát bill đúng kỳ gia hạn trước khi xác nhận đã thu.");
  if (data.totalAmount === null || data.rentalRemaining === null) throw Error("Số liệu hợp đồng cần đối chiếu trước khi thu theo kỳ.");
  return { version: data.period.version, snapshot: data.period.snapshot, revision: data.revision,
    expected_total: data.totalAmount, expected_remaining: data.rentalRemaining, amount: form.amount, method: form.method,
    account_id: account.id, paid_at: form.paidAt, note: form.note.trim(), bill_revision: form.reviewedBill.revision,
    ...(Number(form.amount) > data.rentalRemaining ? { acknowledge_overpayment: true } : {}) };
}
