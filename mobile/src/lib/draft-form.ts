import type { MobileContractFormInput } from "../../../shared/mobile-contract-edit";
import { contractBackfillErrors } from '../../../shared/contract-backfill';
import type {
  MobileContractDraft,
  MobileDraftCustomer,
  MobileDraftInput,
  MobileDraftOptions,
  MobileDraftVehicle,
} from "@himoto/mobile-contract";
import { validDraftTime } from "@himoto/mobile-draft-validation";

export const draftSteps = [
  "Hợp đồng & pháp lý",
  "Khách hàng",
  "Phương tiện",
  "Chi phí",
  "Ký kết & ghi chú",
] as const;
export type DraftErrors = Record<string, string>;
export function emptyDraftVehicle(): MobileDraftVehicle {
  return {
    id: "",
    name: "",
    license: "",
    brand: "",
    type_text: "",
    color: "",
    year: "",
    driver_name: "",
    driver_license_number: "",
    driver_license_issued_on: "",
    borrow_hats: "02",
    borrow_raincoats: "02",
    rent_at: "",
    return_at: "",
  };
}
export function chooseDraftType<T extends MobileContractFormInput>(
  input: T,
  type: MobileDraftOptions["types"][number],
): T {
  const monthly = /^(monthly|ownership)/.test(type.rentalType);
  return {
    ...input,
    rental_type: type.rentalType,
    draft: {
      ...input.draft,
      contract_type_id: type.id,
      contract_type_name: type.label,
      contract_type_months:
        type.termMonths === null ? "" : String(type.termMonths),
      ownership: type.rentalType === "ownership",
      package_name: monthly
        ? "Theo tháng"
        : ["Theo ngày", "Theo tuần"].includes(input.draft.package_name)
          ? input.draft.package_name
          : "Theo ngày",
      ...(type.rentalType === "ownership" && !input.draft.ownership_term_months
        ? { ownership_term_months: "custom" as const }
        : {}),
    },
  };
}
export function newDraftInput(options: MobileDraftOptions): MobileDraftInput {
  const input = JSON.parse(JSON.stringify(options.initial)) as MobileDraftInput;
  const type =
    options.types.find(
      (row) => row.active && row.rentalType === input.rental_type,
    ) || options.types.find((row) => row.active);
  return type ? chooseDraftType(input, type) : input;
}
export function restoreDraftType<T extends MobileContractFormInput>(
  input: T,
  options: MobileDraftOptions,
): T {
  if (input.draft.contract_type_id) return input;
  const type = options.types.find((row) => row.id === input.rental_type);
  if (!type) return input;
  return {
    ...input,
    draft: {
      ...input.draft,
      contract_type_id: type.id,
      contract_type_name: input.draft.contract_type_name || type.label,
      contract_type_months:
        input.draft.contract_type_months ??
        (type.termMonths === null ? "" : String(type.termMonths)),
    },
  };
}
export function chooseDraftCustomer<T extends MobileContractFormInput>(
  input: T,
  customer: MobileDraftCustomer,
): T {
  const before = input.draft.customer;
  return {
    ...input,
    draft: {
      ...input.draft,
      customer_id: customer.id,
      customer_lookup: "",
      customer: { ...customer.details },
      relatives: customer.relatives.map((row) => ({
        ...row,
      })) as MobileContractDraft["relatives"],
      vehicles: input.draft.vehicles.map((vehicle) => ({
        ...vehicle,
        ...driverForCustomer(vehicle, before, customer.details),
      })),
    },
  };
}
function driverForCustomer(
  vehicle: MobileDraftVehicle,
  before: MobileContractDraft["customer"],
  after: MobileContractDraft["customer"],
) {
  const manual = (
    [
      ["driver_name", "name"],
      ["driver_license_number", "driver_license_number"],
      ["driver_license_issued_on", "driver_license_issued_on"],
    ] as const
  ).some(([field, key]) => !!vehicle[field] && vehicle[field] !== before[key]);
  return manual
    ? {
        driver_name: vehicle.driver_name,
        driver_license_number: vehicle.driver_license_number,
        driver_license_issued_on: vehicle.driver_license_issued_on,
      }
    : {
        driver_name: after.name,
        driver_license_number: after.driver_license_number,
        driver_license_issued_on: after.driver_license_issued_on,
      };
}
export function addDraftVehicle<T extends MobileContractFormInput>(
  input: T,
  vehicle: MobileDraftVehicle,
): T {
  if (input.draft.vehicles.some((row) => row.id && row.id === vehicle.id))
    throw Error("Xe này đã có trên bản nháp.");
  const lines = input.draft.vehicles,
    index = lines.findIndex((row) => !row.id);
  if (index < 0 && lines.length >= 50)
    throw Error("Mỗi bản nháp tối đa 50 xe.");
  const customer = input.draft.customer;
  const before = index < 0 ? emptyDraftVehicle() : lines[index];
  const chosen = {
    ...vehicle,
    ...driverForCustomer(before, customer, customer),
    borrow_hats: before.borrow_hats,
    borrow_raincoats: before.borrow_raincoats,
    rent_at: before.rent_at || input.draft.start_date,
    return_at: before.return_at || input.draft.end_date,
  };
  return {
    ...input,
    draft: {
      ...input.draft,
      vehicles:
        index < 0
          ? [...lines, chosen]
          : lines.map((row, i) => (i === index ? chosen : row)),
    },
  };
}
export function changeDraftTime<T extends MobileContractFormInput>(
  input: T,
  key: "start_date" | "end_date",
  value: string,
): T {
  const lineKey = key === "start_date" ? "rent_at" : "return_at",
    before = input.draft[key];
  return {
    ...input,
    draft: {
      ...input.draft,
      [key]: value,
      vehicles: input.draft.vehicles.map((row) =>
        !row[lineKey] || row[lineKey] === before
          ? { ...row, [lineKey]: value }
          : row,
      ),
    },
  };
}
export function validDraftDay(value: string) {
  return (
    value === "" ||
    (/^\d{4}-\d{2}-\d{2}$/.test(value) && validDraftTime(`${value}T12:00`))
  );
}
export function draftErrors(input: MobileDraftInput): DraftErrors {
  const d = input.draft,
    errors: DraftErrors = {};
  if (!/^[1-9]\d{0,14}$/.test(d.store_id))
    errors.store_id = "Chọn cơ sở ghi nhận hợp đồng.";
  if (!d.contract_type_id)
    errors.contract_type_id = "Chọn loại hợp đồng đang sử dụng.";
  for (const key of ["start_date", "end_date"] as const)
    if (!validDraftTime(d[key], true))
      errors[key] = "Nhập đủ ngày và giờ hợp lệ (giờ Việt Nam).";
  if (
    d.start_date &&
    d.end_date &&
    validDraftTime(d.start_date) &&
    validDraftTime(d.end_date) &&
    d.end_date <= d.start_date
  )
    errors.end_date = "Ngày giờ hẹn trả phải sau ngày giờ nhận xe.";
  for (const key of ["unit_price", "total_amount", "deposit_amount"] as const)
    if (
      d[key] &&
      (!/^\d+$/.test(d[key]) || !Number.isSafeInteger(Number(d[key])))
    )
      errors[key] = "Nhập số tiền nguyên không âm bằng VND.";
  for (const key of ["signed_on", "authorization_date", "created_on"] as const)
    if (!validDraftDay(d[key])) errors[key] = "Ngày chưa hợp lệ.";
  for (const key of [
    "id_card_issued_on",
    "driver_license_issued_on",
    "birthday",
  ] as const)
    if (!validDraftDay(d.customer[key]))
      errors[key] = "Ngày trong hồ sơ khách chưa hợp lệ.";
  const ids = new Set<string>();
  d.vehicles.forEach((row, index) => {
    if (row.id && ids.has(row.id))
      errors[`vehicle_${index}`] = "Xe này đã có trên bản nháp.";
    ids.add(row.id);
    for (const key of ["borrow_hats", "borrow_raincoats"] as const)
      if (
        row[key] &&
        (!/^\d+$/.test(row[key]) || !Number.isSafeInteger(Number(row[key])))
      )
        errors[`vehicle_${index}_${key}`] = "Nhập số nguyên không âm.";
    if (!validDraftDay(row.driver_license_issued_on))
      errors[`vehicle_${index}_driver_license_issued_on`] =
        "Ngày cấp GPLX chưa hợp lệ.";
  });
  for (const [index, row] of (d.extra_charges || []).entries())
    if (row.amount && !/^\d{1,13}$/.test(row.amount))
      errors[`charge_${index}`] =
        "Phí khác phải là số tiền nguyên không âm, tối đa 13 chữ số.";
  for (const [index, row] of (d.custom_installments || []).entries())
    if (
      (row.amount && !/^\d{1,13}$/.test(row.amount)) ||
      !validDraftTime(row.due_at, true)
    )
      errors[`installment_${index}`] = "Kiểm tra ngày giờ và số tiền của kỳ.";
  return {...errors,...contractBackfillErrors(d.backfill,d.start_date)};
}
export function errorDraftStep(errors: DraftErrors) {
  const key = Object.keys(errors)[0] || "";
  return /^vehicle_|^vehicles/.test(key)
    ? 2
    : key === "authorization_date"
      ? 4
    : /^(start_date|end_date|rental_days)/.test(key)
      ? 2
    : /^(name|phone|email|address|id_card|driver_license|birthday|relative_)/.test(
          key,
        )
      ? 1
      : /^(unit_price|total_amount|deposit_amount|charge_|installment_|extra_charges|custom_installments)/.test(
            key,
          )
        ? 3
        : 0;
}
export function changeDraftField<K extends keyof MobileContractDraft>(
  input: MobileDraftInput,
  key: K,
  value: MobileContractDraft[K],
): MobileDraftInput {
  return { ...input, draft: { ...input.draft, [key]: value } };
}
