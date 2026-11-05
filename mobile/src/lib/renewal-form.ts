import { validDraftTime } from "@himoto/mobile-draft-validation";
import { validBackfillTime } from '../../../shared/contract-backfill';
import { renewalRateSuggestion } from '../../../shared/renewal-duration';
import { buildRenewalNote } from '../../../shared/renewal-note';
import type { MobileRenewalPreparation } from "../../../shared/mobile-renewals";
import type { MobileRenewalInput } from "../../../shared/mobile-renewal-write";
import type { MobileCollectionMethod } from "@himoto/mobile-contract";

export type RenewalVehicle = MobileRenewalPreparation["items"]["rows"][number];
export const renewalLocalTime = (at: number) => new Date(at + 7 * 3600000).toISOString().slice(0, 16);
const maxAmount = 9_999_999_999_999;
export function renewalSuggestion(item: RenewalVehicle | null, returnAt: string) {
  if (!item?.returnAt || item.dailyPrice === null || !validDraftTime(returnAt)) return null;
  const minutes = Math.ceil((Date.parse(`${returnAt}:00+07:00`) - Date.parse(item.returnAt)) / 60000);
  const expected = Math.ceil(minutes / 1440) * item.dailyPrice;
  return minutes > 0 && Number.isSafeInteger(expected) && expected <= maxAmount ? expected : null;
}
export function reviewRenewal(data: MobileRenewalPreparation, item: RenewalVehicle | null, form: {
  returnAt: string; amount: string; outsideAmount: string; outsideName: string; note: string;
  collected: boolean; method: MobileCollectionMethod; account: string; paidAt: string;
  reviewedBill: { version: number; revision: string } | null;
  occurredAt?: string;
  extraAmount?:string; extraName?:string; unit?:'day'|'hour'; rate?:string;
}, now: number): MobileRenewalInput {
  if (!data.available) throw Error(data.blockedReason || "Hợp đồng chưa thể gia hạn.");
  if (!item) throw Error("Chọn xe đang thuê để gia hạn.");
  if (!validDraftTime(form.returnAt)) throw Error("Chọn ngày giờ hẹn trả mới hợp lệ.");
  if (item.returnAt && Date.parse(`${form.returnAt}:00+07:00`) <= Date.parse(item.returnAt)) throw Error("Hẹn trả mới phải sau hẹn trả hiện tại của xe.");
  if(form.occurredAt!==undefined&&!validBackfillTime(form.occurredAt,now))throw Error("Nhập ngày giờ bắt đầu gia hạn hợp lệ.");
  if(data.backfill){
    const occurred=form.occurredAt||'',at=Date.parse(`${occurred}:00+07:00`);
    if(!validBackfillTime(occurred,now)||item.startedAt&&at<Date.parse(item.startedAt)||item.completedAt&&at>Date.parse(item.completedAt))throw Error('Ngày bắt đầu gia hạn phải từ lúc bắt đầu thuê, không sau lúc trả xe thực tế và không ở tương lai.');
  }
  const parseMoney = (value: string, label: string) => {
    if (!/^(0|[1-9]\d{0,12})$/.test(value)) throw Error(`${label} phải là số nguyên VND từ 0, tối đa 13 chữ số.`);
    return Number(value);
  };
  const extra=parseMoney(form.extraAmount||'0','Phí khác');
  if(extra>0&&!form.extraName?.trim())throw Error('Nhập tên khoản phí khác.');
  const amount = parseMoney(form.amount, "Phí gia hạn")+extra, outside = parseMoney(form.outsideAmount || "0", "Phí thu ngoài");
  if (amount + outside > maxAmount || amount>0&&(data.totalAmount === null || data.totalAmount + amount > maxAmount)) throw Error("Tổng tiền sau gia hạn vượt giới hạn hoặc cần đối chiếu.");
  if (outside > 0 && (!form.outsideName.trim() || form.outsideName.trim().length > 100)) throw Error("Nhập tên phí thu ngoài, tối đa 100 ký tự.");
  if (form.note.trim().length > 2000) throw Error("Ghi chú tối đa 2.000 ký tự.");
  const suggestion=form.rate!==undefined?renewalRateSuggestion(item.returnAt,form.returnAt,form.rate,form.unit||"day"):renewalSuggestion(item, form.returnAt),expected=suggestion===null?null:suggestion+extra;
  const note=buildRenewalNote(form.note,extra,form.extraName||'',outside,form.outsideName);
  if(note.length>2000||expected!==null&&expected>maxAmount)throw Error('Ghi chú phí hoặc số tiền gợi ý vượt giới hạn. Rà soát lại trước khi lưu.');
  const input: MobileRenewalInput = { item_id: item.id, item_revision: item.revision, order_revision: data.revision, expected_version: data.nextVersion,
    return_at: form.returnAt, amount: String(amount), note, ...(form.occurredAt?{occurred_at:form.occurredAt}:{}), ...(expected === null ? {} : { expected_amount: String(expected) }),
    ...(outside > 0 ? { outside_amount: String(outside), outside_name: form.outsideName.trim() } : {}) };
  if (form.collected) {
    if (amount + outside === 0) throw Error("Chưa có khoản tiền để xác nhận đã thu.");
    if (outside > 0 && form.method === "company_transfer") throw Error("Phí thu ngoài chỉ nhận bằng tiền mặt hoặc tài khoản cá nhân.");
    const destination = data.accounts.find(row => `${row.method}:${row.id}` === form.account && row.method === form.method);
    if (!destination) throw Error("Chọn tài khoản đã thực nhận tiền.");
    const paidTime=form.occurredAt||form.paidAt;
    if (!validDraftTime(paidTime) || Date.parse(`${paidTime}:00+07:00`) > now + 5 * 60000) throw Error("Chọn đúng thời điểm thực thu, không chọn ngày giờ tương lai.");
    if (!form.reviewedBill || form.reviewedBill.version !== data.nextVersion || !/^[1-9]\d{0,19}$/.test(form.reviewedBill.revision)) throw Error("Lưu và rà soát bill đúng phiên bản trước khi xác nhận đã thu.");
    input.receipt = { method: form.method, account_id: destination.id, paid_at: paidTime };
    input.bill_revision = form.reviewedBill.revision;
  }
  return input;
}
