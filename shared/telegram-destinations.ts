export const OWNERSHIP_TELEGRAM_DESTINATIONS = [
  {route:'ownership_new',label:'Thuê sở hữu · Ký mới, trả xe & điều chuyển'},
  {route:'ownership_renewal',label:'Thuê sở hữu · Gia hạn'},
] as const;
export type OwnershipTelegramRoute = typeof OWNERSHIP_TELEGRAM_DESTINATIONS[number]['route'];
