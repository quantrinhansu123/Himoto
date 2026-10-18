export const OWNERSHIP_TELEGRAM_DESTINATIONS = [
  {route:'ownership_new',label:'Thuê sở hữu · Hợp đồng mới'},
  {route:'ownership_renewal',label:'Thuê sở hữu · Gia hạn'},
] as const;
export type OwnershipTelegramRoute = typeof OWNERSHIP_TELEGRAM_DESTINATIONS[number]['route'];
