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
      vehicles > 20 || fees === null) return null;
  const rental = periods * price * vehicles, total = rental + fees;
  if (!Number.isSafeInteger(total) || total > MAX_PAYMENT_AMOUNT) return null;
  return { vehicle_count: vehicles, period_count: periods, unit_price: price, rental_amount: rental, extra_amount: fees, total_amount: total };
}
