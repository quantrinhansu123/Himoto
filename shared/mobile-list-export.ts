export const MOBILE_LIST_EXPORTS = ['transfers', 'gps', 'battery', 'accounts', 'shifts', 'duties', 'reminders', 'work-shifts', 'shift-registrations'] as const;
export type MobileListExportKind = typeof MOBILE_LIST_EXPORTS[number];
export function isMobileListExportKind(value: string): value is MobileListExportKind {
  return (MOBILE_LIST_EXPORTS as readonly string[]).includes(value);
}
