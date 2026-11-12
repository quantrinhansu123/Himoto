/** Public mobile API v1. This module must have no server or framework dependencies. */
import type { MobileContractMonitoring, MobileContractScope } from "./mobile-contract-workspaces";
export type CatalogueKind = "vehicles" | "contracts" | "customers";
export interface MobileUser {
  id: number;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  storeId: number | null;
  allStores: boolean;
}
export interface MobileSession {
  token: string;
  expiresAt: string;
  user: MobileUser;
  refreshToken?: string;
  refreshExpiresAt?: string;
  sessionId?: string;
}
export interface MobileStore {
  id: number;
  name: string;
}
export interface MobileRecord {
  id: number;
  code: string;
  name: string;
  status: string;
  storeId: number | null;
  storeName: string;
  license: string;
  vehicleName: string;
  phone: string;
  startsAt: string;
  endsAt: string;
  totalAmount: number | null;
  paidAmount: number | null;
  brand: string;
  color: string;
  odometer: number | null;
  email?: string;
  address?: string;
  contactChannel?: string;
  contactDetail?: string;
  customerNote?: string;
  monitoring?: MobileContractMonitoring;
  reminderEligible?: boolean;
  /** Present in newer vehicle list responses; null means no readable thumbnail. */
  thumbnailRevision?: string | null;
}
export interface MobilePage {
  rows: MobileRecord[];
  total: number;
  /** Total after store/search/date/customer filters, before selecting a status. */
  tabCount?: number;
  page: number;
  pages: number;
  statusCounts: [string, number][];
  updatedAt: string;
  scope?: MobileContractScope;
}
export interface MobileWorkspace {
  user: MobileUser;
  stores: MobileStore[];
}
export interface MobileFailure {
  message: string;
  code: string;
  fields?: Record<string, string>;
}
export interface MobileCustomerInput {
  name: string;
  phone: string;
  email: string;
  address: string;
  id_card: string;
  customer_type: "vietnam" | "foreign";
  nationality: string;
  contact_channel: string;
  contact_detail: string;
  store_id: number;
  status: "active" | "warning" | "blacklist" | "draft";
  warning_note: string;
  driver_license_number: string;
  driver_license_issued_on: string;
  id_card_issued_on: string;
  id_card_issued_by: string;
  relatives: { name: string; relationship: string; phone: string }[];
  allow_incomplete?: boolean;
}
export interface MobileCustomerProfile
  extends Omit<MobileCustomerInput, "store_id"> {
  id: number;
  store_id: number | null;
  revision: string;
}
export interface MobileWriteReceipt {
  id: number;
  revision: string;
  replayed: boolean;
}
export type MobileContractAction = "finalize" | "handover";
export type MobileCollectionMethod = "cash" | "transfer" | "company_transfer";
export interface MobileInitialCollection {
  purpose: "deposit" | "rental";
  amount: string;
  method: MobileCollectionMethod;
  account_id: number;
  paid_at: string;
}
export interface MobileContractIssueInput {
  revision: string;
  receipts: MobileInitialCollection[];
  reservation?: true;
  acknowledge_reservation_overlap?: true;
}
export interface MobileContractPreparation {
  id: number;
  storeId: number;
  storeName: string;
  code: string;
  status: string;
  revision: string;
  canFinalize: boolean;
  requiresManager: boolean;
  reservation: boolean;
  historical: boolean;
  customerName: string;
  vehicles: { id: number; label: string }[];
  startsAt: string;
  endsAt: string;
  totalAmount: number | null;
  depositAmount: number | null;
  rentalPaid: number | null;
  depositPaid: number;
  accounts: { id: number; label: string; method: MobileCollectionMethod }[];
  issues: {
    rental: Record<string, string>;
    reservation: Record<string, string>;
  };
}

export interface MobileDraftRelative {
  name: string;
  relationship: string;
  phone: string;
}
export type MobileDraftCustomerDetails = Record<
  | "name"
  | "phone"
  | "email"
  | "address"
  | "id_card"
  | "id_card_issued_on"
  | "id_card_issued_by"
  | "driver_license_number"
  | "driver_license_issued_on"
  | "birthday"
  | "relatives_text"
  | "warning_note"
  | "customer_type"
  | "nationality"
  | "contact_channel"
  | "contact_detail",
  string
> & { relatives_json?: string };
export interface MobileDraftVehicle {
  id: string;
  name: string;
  license: string;
  brand: string;
  type_text: string;
  color: string;
  year: string;
  driver_name: string;
  driver_license_number: string;
  driver_license_issued_on: string;
  borrow_hats: string;
  borrow_raincoats: string;
  rent_at: string;
  return_at: string;
  stock_store_id?: string;
  stock_store_name?: string;
}
/** Explicit document projection, independent of server/web runtime modules. */
export interface MobileContractDraft {
  contract_number: string;
  signed_on: string;
  store_id: string;
  staff_id: string;
  staff_name: string;
  vehicle_store_id?: string;
  customer_id: number | null;
  customer: MobileDraftCustomerDetails;
  relatives: [MobileDraftRelative, MobileDraftRelative];
  vehicles: MobileDraftVehicle[];
  start_date: string;
  end_date: string;
  unit_price: string;
  total_amount: string;
  paid_amount: string;
  deposit_amount: string;
  package_name: string;
  payment_method: string;
  deposit_payment_method: string;
  collateral_description: string;
  customer_source: string;
  customer_source_url: string;
  authorization_date: string;
  created_on: string;
  contract_type_id?: string;
  contract_type_name?: string;
  contract_type_months?: string;
  reservation?: boolean;
  ownership?: boolean;
  customer_lookup?: string;
  sales_staff_id?: string;
  sales_staff_name?: string;
  tls_staff_id?: string;
  ownership_term_months?: "6" | "9" | "12" | "18" | "24" | "custom";
  document_requirements?: {
    phone: boolean;
    id_card: boolean;
    address: boolean;
    representative: boolean;
    relatives: 0 | 1 | 2;
  };
  extra_charges?: {
    name: string;
    amount: string;
    method?: "cash" | "transfer" | "company_transfer";
  }[];
  custom_installments?: { due_at: string; amount: string }[];
  backfill?: { note: string; returned_at?: string };
}
export interface MobileDraftInput {
  draft: MobileContractDraft;
  rental_type: string;
  status: "draft";
  notes: string;
  revision?: string;
}
export interface MobileDraftProfile {
  id: number;
  code: string;
  revision: string;
  input: MobileDraftInput;
}
export interface MobileDraftOptions {
  initial: MobileDraftInput;
  stores: MobileStore[];
  vehicleStores: MobileStore[];
  types: {
    id: string;
    label: string;
    rentalType: string;
    termMonths: number | null;
    active: boolean;
  }[];
}
export interface MobileDraftStaff {
  id: number;
  name: string;
  sourceLabel?: string;
  position?: string;
  storeId: number | null;
  roles: ("representative" | "sales" | "telesales")[];
}
export interface MobileDraftCustomer {
  id: number;
  storeId: number | null;
  storeName: string;
  status: string;
  details: MobileDraftCustomerDetails;
  relatives: [MobileDraftRelative, MobileDraftRelative];
}
export interface MobileDraftInventory {
  rows: {
    vehicle: MobileDraftVehicle;
    status: string;
    storeId: number;
    storeName: string;
  }[];
  page: number;
  hasMore: boolean;
}
export interface MobileVehicleAvailability {
  checkedAt: string;
  startsAt: string;
  endsAt: string;
  vehicles: {
    id: number;
    status: string;
    hasHardBlocker: boolean;
    reservationOverlap: boolean;
    blockersTotal: number;
    draftsTotal: number;
    blockers: {
      code: string;
      storeName: string;
      status: string;
      startsAt: string;
      endsAt: string;
      severity: "hard" | "reservation_overlap";
    }[];
    drafts: {
      code: string;
      storeName: string;
      startsAt: string;
      endsAt: string;
    }[];
  }[];
}
