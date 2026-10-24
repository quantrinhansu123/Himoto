import type { ShiftInput } from './shift-reports';
export const SHIFT_AUTOFILL_SECTIONS = ['information','inventory','batteries','transfers','summary','accounts','safety','ownership'] as const;
export type ShiftAutofillSection = typeof SHIFT_AUTOFILL_SECTIONS[number];
export interface ShiftInventoryCheck {
  started_contracts:number; started_vehicles:number;
  active_contracts:number; active_vehicles:number;
  daily_vehicles:number; monthly_vehicles:number; other_vehicles:number;
  stock_vehicles:number; ready_vehicles_raw:number; ready_conflicts:number; ready_rentals:number;
  missing_vehicle_lines:number; duplicate_vehicles:number;
  issues:{kind:'ready_rental'|'missing_vehicle'|'duplicate_rental';order_id:number;code:string;vehicle_id:number|null;license:string}[];
}
export interface ShiftAutofillResult {
  section: ShiftAutofillSection; store_id: number; date: string;
  values: Partial<ShiftInput>; notices: string[]; sources: string[]; read_at: string;
  inventory?:ShiftInventoryCheck;
}
