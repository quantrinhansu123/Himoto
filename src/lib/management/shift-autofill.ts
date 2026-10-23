import type { ShiftInput } from './shift-reports';
export const SHIFT_AUTOFILL_SECTIONS = ['information','inventory','batteries','transfers','summary','accounts','safety','ownership'] as const;
export type ShiftAutofillSection = typeof SHIFT_AUTOFILL_SECTIONS[number];
export interface ShiftAutofillResult {
  section: ShiftAutofillSection; store_id: number; date: string;
  values: Partial<ShiftInput>; notices: string[]; sources: string[]; read_at: string;
}
