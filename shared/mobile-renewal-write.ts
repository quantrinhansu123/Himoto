import type { MobileCollectionMethod, MobileWriteReceipt } from "./mobile-contract";

export interface MobileRenewalInput {
  item_id: number;
  item_revision: string;
  order_revision: string;
  expected_version: number;
  return_at: string;
  amount: string;
  expected_amount?: string;
  outside_amount?: string;
  outside_name?: string;
  note: string;
  occurred_at?: string;
  receipt?: {method:MobileCollectionMethod;account_id:number;paid_at:string};
  bill_revision?: string;
}
export interface MobileRenewalReceipt extends MobileWriteReceipt {
  version: number;
  returnAt: string;
  amount: number;
  totalAmount: number | null;
  collected: boolean;
  collection: {method:MobileCollectionMethod;accountId:number;paidAt:string} | null;
  transactionId: number | null;
  outsideAmount: number;
  outsideTransactionId: number | null;
  billRevision: string | null;
  warning: string | null;
  current: boolean;
}
export function isMobileRenewalReceipt(value:unknown):value is MobileRenewalReceipt {
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  const row=value as Record<string,unknown>;
  const positive=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>0;
  const amount=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0&&v<=9999999999999;
  const revision=(v:unknown)=>typeof v==="string"&&/^[1-9]\d{0,19}$/.test(v);
  if(!positive(row.id)||!revision(row.revision)||typeof row.replayed!=="boolean"||!positive(row.version)||row.version<2||row.version>999999999999999||
    typeof row.returnAt!=="string"||!Number.isFinite(Date.parse(row.returnAt))||!amount(row.amount)||!(row.totalAmount===null||amount(row.totalAmount))||
    !amount(row.outsideAmount)||typeof row.collected!=="boolean"||typeof row.current!=="boolean"||
    !(row.transactionId===null||positive(row.transactionId))||!(row.outsideTransactionId===null||positive(row.outsideTransactionId))||
    !(row.billRevision===null||revision(row.billRevision))||!(row.warning===null||(typeof row.warning==="string"&&row.warning.length<=4000))||
    row.amount+row.outsideAmount>9999999999999||(row.transactionId!==null&&row.transactionId===row.outsideTransactionId))return false;
  const collection=row.collection;
  const validCollection=!!collection&&typeof collection==="object"&&!Array.isArray(collection)&&
    ["cash","transfer","company_transfer"].includes(String((collection as Record<string,unknown>).method))&&
    positive((collection as Record<string,unknown>).accountId)&&typeof (collection as Record<string,unknown>).paidAt==="string"&&Number.isFinite(Date.parse(String((collection as Record<string,unknown>).paidAt)));
  return row.collected ? validCollection&&revision(row.billRevision)&&
    (row.amount>0?positive(row.transactionId):row.transactionId===null)&&
    (row.outsideAmount>0?positive(row.outsideTransactionId):row.outsideTransactionId===null)&&
    (row.amount>0||row.outsideAmount>0) : row.collection===null&&row.transactionId===null&&row.outsideTransactionId===null&&row.billRevision===null;
}
