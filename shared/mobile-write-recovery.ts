import type { MobileWriteReceipt } from "./mobile-contract";

export const MOBILE_WRITE_OPERATION = /^(?:bulk\.(?:staff|stores|customers|vehicles)\.delete|telegram\.(?:contract|transfer):[1-9]\d{0,14}|vimport\.(?:sync|replace|reset):[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|import\.(?:customers|cstores|contracts):[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|integration\.(?:gps-account|gps-enabled|telegram)|correction\.(?:receipts|renewal):[1-9]\d{0,14}|lifecycle\.(?:mark_bad_debt|settle|hold|resume|update_hold|complete_hold):[1-9]\d{0,14}|account\.(?:create|change-password|(?:update|delete|password):[1-9]\d{0,14})|ctype\.(?:create|update)|battery\.(?:create|(?:update|delete|renew|collect_renewal|return):[1-9]\d{0,14})|shift\.(?:create|(?:update|audit|media):[1-9]\d{0,14})|reminder\.send:[1-9]\d{0,14}|cashbook\.delete|draft\.delete:[1-9]\d{0,14}|(customer|draft)\.(create|update:[1-9]\d{0,14})|(?:bank|cash)\.(create|(?:update|status|delete):[1-9]\d{0,14})|(?:store|staff|duty)\.(create|(?:update|delete):[1-9]\d{0,14})|contract\.(finalize|handover|approve|edit|terms|ownership_terms):[1-9]\d{0,14}|payment\.(record|bill|renewal):[1-9]\d{0,14}|renewal\.(bill|record):[1-9]\d{0,14}|return\.(record|swap|recover|correct):[1-9]\d{0,14}|vehicle\.(create|(?:update|status|transfer|receive|reject|cancel):[1-9]\d{0,14})|media\.(contract|vehicle|customer|copy|delete\.(?:contract|vehicle|customer)):[1-9]\d{0,14}|video\.record:[1-9]\d{0,14}|gps\.mapping:[1-9]\d{0,14})$/;
export function isMobileWriteOperation(value: unknown): value is string {
  return typeof value === "string" && MOBILE_WRITE_OPERATION.test(value);
}
export type MobileWriteResolution = {
  key: string;
  operation: string;
} & (
  | { status: "cancelled"; receipt: null }
  | { status: "committed"; receipt: MobileWriteReceipt }
);
