import type { ShiftRegistration } from './shift-registration';

export interface SelfRegistrationWeek {
  week: string;
  today: string;
  dates: string[];
  staff: { id: number; name: string; store_id: number; store_name: string };
  registrations: ShiftRegistration[];
}
