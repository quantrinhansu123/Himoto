import { billingInterval, rentalPeriodCount } from './contract-billing';
import { chargeTotal } from './contract-charges';
import { MAX_PAYMENT_AMOUNT } from './contract-payments';

export function selectedRentalVehicleCount(vehicles: readonly { id?: unknown }[]) {
  return new Set(vehicles.map(vehicle => String(vehicle.id ?? '').trim()).filter(Boolean)).size;
}

export function rentalQuote(draft: {
  start_date: string; end_date: string; package_name: string; unit_price: string;
  vehicles: readonly { id?: unknown }[]; extra_charges?: unknown;
}) {
  const interval = billingInterval(draft.package_name);
  const periods = interval ? rentalPeriodCount(draft.start_date, draft.end_date, interval) : 0;
  const vehicles = selectedRentalVehicleCount(draft.vehicles);
  const price = Number(draft.unit_price), fees = chargeTotal(draft.extra_charges);
  if (!periods || !/^\d+$/.test(draft.unit_price) || !Number.isSafeInteger(price) || price > MAX_PAYMENT_AMOUNT ||
      vehicles > 50 || fees === null) return null;
  // Contract rate covers the whole rental for one period; days/unit update total even before a vehicle is picked.
  const rental = periods * price, total = rental + fees;
  if (!Number.isSafeInteger(total) || total > MAX_PAYMENT_AMOUNT) return null;
  return { vehicle_count: vehicles, period_count: periods, unit_price: price, rental_amount: rental, extra_amount: fees, total_amount: total };
}

/** Allocate a contract rate to rental lines without multiplying or losing dong. */
export function rentalLineRate(rate:number,count:number,index:number) {
  if(!Number.isSafeInteger(rate)||rate<0||!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(index)||index<0||index>=count)throw new Error('Đơn giá hoặc dòng xe không hợp lệ.');
  return Math.floor(rate/count)+(index<rate%count?1:0);
}
