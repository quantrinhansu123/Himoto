import {isAttendanceSummary,isAttendanceReceipt,isAttendanceResolution,isMobileGuideFaq} from '../../../shared/mobile-support';
import {isBatteryMedia,type BatteryMedia} from '../../../shared/battery-media';
import {isMobileNotifications, isMobileNotificationList, isMobilePushStatus, isMobilePushTest, type MobileNotificationKind} from '../../../shared/mobile-notifications';
import type { OfflineTransport } from './offline-transport';
import {isMobileActivityPage} from '../../../shared/mobile-activity';
import {isFleetInventory,type MobileFleetInventory} from '../../../shared/mobile-fleet-inventory';
import { isMobileVideoReceipt, isMobileVideoSignature, type MobileVideoReceipt, type MobileVideoUploadSignature, type MobileVideoCloudReceipt } from '../../../shared/mobile-video';
import {isMobileVideoUploadConfig,isMobileVideoDirectResult,isMobileVideoBrowserReceipt,type MobileVideoDirectResult,type MobileVideoBrowserReceipt} from '../../../shared/mobile-video-upload';
import { isMobileCustomerImportPreview, isMobileImportReceipt, type MobileCustomerImportPreview, type MobileCustomerImportInput, type MobileImportReceipt } from '../../../shared/mobile-customer-import';
import { isMobileExportColumns, type MobileExportColumns, type MobileCatalogueExportKind } from '../../../shared/mobile-catalogue-export';
import {isMobileStaffOrganization,type MobileStaffOrganization} from '../../../shared/mobile-staff-organization';
import {isMobileDashboard,type DashboardSummary} from '../../../shared/mobile-dashboard';
import {isMobileStoreContracts,type MobileStoreContracts} from '../../../shared/mobile-store-contracts';
import {isMobileBulkReview,isMobileBulkDeletion,type MobileBulkKind,type MobileBulkReview,type MobileBulkDeletion} from '../../../shared/mobile-bulk-delete';
import { isMobileStoreMatchResult, type CustomerStoreInput, type CustomerStoreResult, type MobileStoreMatchInput, type MobileStoreMatchFilePage } from '../../../shared/mobile-customer-store-import';
import { readStoreMatchStream } from './read-workbook-stream';
import { readWorkbookDownload, WORKBOOK_MIME } from './read-workbook-download';
import { isMobileVehicleWorkbook, isMobileVehicleImportPreview, isMobileVehicleResetPreview, isMobileVehicleImportReceipt, isMobileVehicleImportResolution, isMobileVehicleImportOptions, type MobileVehicleWorkbook, type VehicleImportResult, type VehicleResetPreview, type MobileVehicleImportInput, type MobileVehicleImportReceipt, type MobileVehicleImportResolution, type MobileVehicleImportOptions } from '../../../shared/mobile-vehicle-import';
import { isMobileContractQr, type MobileContractQr } from '../../../shared/mobile-contract-qr';
import { isMobilePrintDocument, type MobilePrintDocument, type MobilePrintKind } from '../../../shared/mobile-print';
import { isMobileRentalTerms, isMobileRentalTermsResult, type MobileRentalTerms, type MobileRentalTermsInput, type MobileRentalTermsResult } from '../../../shared/mobile-rental-terms';
import { isMobileContractHistory, type MobileContractHistory } from '../../../shared/mobile-contract-history';
import { isMobileOwnershipTerms, isMobileOwnershipTermsResult, type MobileOwnershipTerms, type MobileOwnershipTermsInput, type MobileOwnershipTermsResult } from '../../../shared/mobile-ownership-terms';
import { isMobileDraftDeleteReview, isMobileDraftDeleteResult, type MobileDraftDeleteReview, type MobileDraftDeleteInput, type MobileDraftDeleteResult } from '../../../shared/mobile-draft-delete';
import { isMobileReturnCorrectionOptions, isMobileReturnCorrectionProfile, isMobileReturnCorrectionResult, type MobileReturnCorrectionOptions, type MobileReturnCorrectionProfile, type MobileReturnCorrectionInput, type MobileReturnCorrectionResult } from '../../../shared/mobile-return-corrections';
import { isMobileLifecycleContext, isMobileLifecyclePreview, isMobileLifecycleInventory, isMobileLifecycleResult, type MobileLifecycleContext, type MobileLifecycleInput, type MobileLifecyclePreview, type MobileLifecycleInventory, type MobileLifecycleResult } from '../../../shared/mobile-contract-lifecycle';
import { isMobileReceiptCorrections, isMobileRenewalCorrections, isMobileContractCorrectionResult, type MobileCorrectionKind, type MobileReceiptCorrections, type MobileRenewalCorrections, type MobileReceiptCorrectionInput, type MobileRenewalCorrectionInput, type MobileContractCorrectionResult } from '../../../shared/mobile-contract-corrections';
import { isMobileContractEditProfile, isMobileContractEditResult, type MobileContractEditInput, type MobileContractEditProfile, type MobileContractEditResult } from "../../../shared/mobile-contract-edit";
import { isMobileContractApprovalContext, isMobileContractApprovalResult, type MobileContractApprovalContext, type MobileContractApprovalResult } from '../../../shared/mobile-contract-approval';
import { isMobileOperations,type MobileOperations } from '../../../shared/mobile-operations';
import { isIntegrationSettings,isIntegrationReceipt,isIntegrationResult,isIntegrationResolution,type IntegrationSettings,type IntegrationInput,type IntegrationReceipt,type IntegrationResult,type IntegrationResolution,type IntegrationOperation } from '../../../shared/mobile-integrations';
import { isManagedAccountsPage,isManagedAccount,isManagedAccountOptions,isManagedAccountWriteResult,isManagedAccountResult,isManagedPasswordResult,type ManagedAccountsPage,type ManagedAccount,type ManagedAccountOptions,type ManagedAccountWriteResult,type ManagedAccountResult,type ManagedPasswordResult,type ManagedAccountInput } from '../../../shared/mobile-managed-accounts';
import { isContractTypes,isContractTypeReceipt,isContractTypeResult,isContractTypeResolution,type ContractType,type ContractTypeInput,type MobileContractTypeReceipt,type MobileContractTypeResult,type MobileContractTypeResolution,type ContractTypeOperation } from '../../../shared/mobile-contract-types';
import type {
  CatalogueKind,
  MobilePage,
  MobileRecord,
  MobileSession,
  MobileUser,
  MobileWorkspace,
  MobileCustomerInput,
  MobileCustomerProfile,
  MobileWriteReceipt,
  MobileDraftInput,
  MobileDraftOptions,
  MobileDraftProfile,
  MobileDraftInventory,
  MobileDraftCustomer,
  MobileVehicleAvailability,
  MobileDraftStaff,
  MobileContractPreparation,
  MobileContractAction,
  MobileContractIssueInput,
} from "@himoto/mobile-contract";
import { isMobileContractPreparation } from "@himoto/mobile-contract-validation";
import { isVehicleOcr, type MobileVehicleOcr } from "../../../shared/mobile-vehicle-ocr";
import { isVehicleProfile, isVehicleOptions, isVehicleResult, isVehicleHistory, isVehicleContracts, isTransferHistory, type MobileVehicleInput, type MobileVehicleProfile, type MobileVehicleOptions, type MobileVehicleResult, type MobileVehicleHistory, type MobileVehicleContracts, type MobileTransferHistory } from "../../../shared/mobile-vehicles";
import {isMobileContractWorkbook,isMobileContractImportPreview,type MobileContractWorkbook,type MobileContractImportPreview,type MobileContractImportInput} from '../../../shared/mobile-contract-import';
import {isMobileContractTelegram,isMobileTransferTelegram,isMobileTelegramResult,isMobilePendingTelegram,type MobilePendingTelegram,type ContractTelegramState,type MobileTransferTelegram,type MobileTelegramCommand,type MobileTelegramResult} from '../../../shared/mobile-telegram';
import { isDirectoryPage, type MobileDirectoryKind, type MobileDirectoryPage } from "../../../shared/mobile-directory";
import { isMobileCsvExport, isMobileFileExport, type MobileCsvExport, type MobileFileExport, type MobileWorkbookExport } from "../../../shared/mobile-export";
import type {MobileListExportKind} from '../../../shared/mobile-list-export';
import { isSalesReportOptions, isMobileSalesReport, type SalesReportOptions, type MobileSalesReport, type SalesReportKind } from "../../../shared/mobile-reports";
import { isMobileBatteryStaff,type MobileBatteryStaff,isBatteryOptions,isBatteryPage,isBatteryWorkflow,isBatteryResult,isBatteryTelegram,type MobileBatteryOptions,type MobileBatteryPage,type BatteryWorkflowContext,type MobileBatteryResult,type MobileBatteryInput,type MobileBatteryAction,type MobileBatteryPrefill,type MobileBatteryTelegram } from "../../../shared/mobile-battery";
import { isShiftReport,isShiftOptions,isShiftResult,isShiftSnapshot,type ShiftTelegramState,type ShiftReport,type MobileShiftOptions,type MobileShiftSave,type MobileAuditSave,type MobileShiftVideoReview,type ShiftSnapshot,type MobileShiftResult,type ShiftAutofillResult,type ShiftAutofillSection } from "../../../shared/mobile-shift-reports";
import { isRegistrationMonth, isRegistrationRange, isSelfRegistrationWeek, isShiftRegistration, type RegistrationMonth, type RegistrationRange, type SelfRegistrationWeek, type ShiftRegistration, type RegistrationInput, type SelfRegistrationInput } from '../../../shared/mobile-shift-registration';
import { isMobileStaffAccounts, type MobileStaffAccount } from '../../../shared/mobile-staff-accounts';
import { isMobileAttendanceLocations, type MobileAttendanceLocation } from '../../../shared/mobile-attendance-locations';
import { isReminderHistory,isReminderOptions,isReminderContext,isReminderResult,isReminderStatus,type MobileReminderHistory,type MobileReminderOptions,type DebtReminderContext,type MobileReminderResult,type DebtReminderInput,type ReminderStatus } from "../../../shared/mobile-debt-reminders";
import { isVoucherDeleteSelection, isVoucherDeletion, type VoucherDeleteSelection, type VoucherDeletion } from "../../../shared/mobile-cashbook-delete";
import { isStaffProfile, isStaffOptions, isStaffWriteResult, isStaffResult, type MobileStaffProfile, type MobileStaffOptions, type MobileStaffInput, type MobileStaffWriteResult, type MobileStaffResult } from "../../../shared/mobile-staff";
import { isCashbookPage, isCashbookAccount, isCashbookAccounts, isCashbookTransactions, isCashbookAccountResult, type MobileCashbookPage, type MobileCashbookAccount, type MobileCashbookAccounts, type MobileCashbookTransactions, type MobileCashbookAccountResult, type CashbookAccountKind, type CashbookAccountInput } from "../../../shared/mobile-cashbook";
import { isStoreProfile, isStoreResult, isStoreManagers, type MobileStoreProfile, type MobileStoreResult, type MobileStoreManagers, type StoreCreation, type StoreEdits } from "../../../shared/mobile-stores";
import { isDutyRoster, isDutyResult, type MobileDutyInput, type MobileDutyRoster, type MobileDutyResult } from "../../../shared/mobile-duty-roster";
import {isMobileGpsWorkspace,gpsQueryString,type MobileGpsQuery,type MobileGpsWorkspace} from '../../../shared/mobile-gps';
import {isMobilePlateOcr,isMobilePlateMatch,type MobilePlateOcr,type MobilePlateMatch} from '../../../shared/mobile-plate-ocr';
import {isMediaDeleteReceipt,type MobileMediaDeleteReceipt} from '../../../shared/mobile-media-delete';
import {isCustomerPhotoCopyReview,isCustomerPhotoCopyReceipt,type MobileCustomerPhotoCopyReview,type MobileCustomerPhotoCopyReceipt} from '../../../shared/mobile-customer-photo-copy';
import {isGpsMappingPreparation,isGpsMappingCandidates,isGpsMappingReceipt,type MobileGpsMappingPreparation,type MobileGpsMappingCandidates,type MobileGpsMappingInput,type MobileGpsMappingReceipt} from '../../../shared/mobile-gps-mapping';
import { isMobileCustomerMatches, type MobileCustomerMatches, type MobileCustomerMatchQuery } from "../../../shared/mobile-customer-matches";
import {isMobileCustomerOcr,type MobileCustomerOcr,type CustomerOcrKind} from '../../../shared/mobile-customer-ocr';
import type { MobileWriteResolution } from "../../../shared/mobile-write-recovery";
import { isMobileFinanceContext, isMobilePaymentReceipt } from "../../../shared/mobile-finance";
import type { MobileFinanceContext, MobilePaymentInput, MobilePaymentReceipt } from "../../../shared/mobile-finance";
import { isMobileRenewalPreparation } from "../../../shared/mobile-renewals";
import type { MobileRenewalPreparation } from "../../../shared/mobile-renewals";
import { isMobileRenewalReceipt } from "../../../shared/mobile-renewal-write";
import type { MobileRenewalInput, MobileRenewalReceipt } from "../../../shared/mobile-renewal-write";
import { isMobileRenewalCollectionPreparation, isMobileRenewalCollectionReceipt, isMobileRenewalPeriods, type MobileRenewalPeriods, type MobileRenewalCollectionPreparation, type MobileRenewalCollectionInput, type MobileRenewalCollectionReceipt } from "../../../shared/mobile-renewal-collection";
import { isMobileBillInfo, isMobileBillReceipt } from "../../../shared/mobile-bills";
import type { MobileBillInfo, MobileBillReceipt } from "../../../shared/mobile-bills";
import { isMobileReturnPreparation,isMobileReturnPreview,type MobileReturnPreparation,type MobileReturnPreview,type MobileReturnPreviewInput } from "../../../shared/mobile-returns";
import { isMobileReturnSettlementPreview,matchesReturnFees,matchesReturnSettlement,type MobileReturnSettlementPreview,type MobileReturnSettlementInput } from "../../../shared/mobile-return-settlement";
import {isMobileReturnReceipt,type MobileReturnReceipt,type MobileReturnRecordInput} from "../../../shared/mobile-return-write";
import {isMobileSwapPreparation,isMobileSwapCandidates,isMobileSwapPreview,matchesSwapPreview,isMobileSwapReceipt,type MobileSwapPreparation,type MobileSwapCandidates,type MobileSwapPreview,type MobileSwapReceipt,type MobileSwapInput} from "../../../shared/mobile-swaps";
import {isMobileVehicleTransferPreparation,isMobileTransferDestinations,isMobileVehicleTransferPreview,isMobileVehicleTransferReceipt,matchesVehicleTransferPreview,type MobileVehicleTransferPreparation,type MobileTransferDestinations,type MobileVehicleTransferPreview,type MobileVehicleTransferInput,type MobileVehicleTransferRecordInput,type MobileVehicleTransferReceipt} from "../../../shared/mobile-vehicle-transfers";
import {isMobileVehicleStatusPreparation,isMobileVehicleStatusReview,isMobileVehicleStatusReceipt,matchesVehicleStatusReview,type MobileVehicleStatusInput,type MobileVehicleStatusPreparation,type MobileVehicleStatusReview,type MobileVehicleStatusReceipt} from '../../../shared/mobile-vehicle-status';
import {isMobileRecoveryPreparation,isMobileRecoveryPreview,isMobileRecoveryReceipt,matchesRecoveryPreview,type MobileRecoveryPreparation,type MobileRecoveryPreview,type MobileRecoveryInput,type MobileRecoveryRecordInput,type MobileRecoveryReceipt} from '../../../shared/mobile-bad-debt-recovery';
import {isMobileRecordMedia,isMobileMediaIdentity,isMobileMediaPhoto,isMobileMediaReceipt,isMobileMediaSlotInfo,isMobileMediaTargets,matchesMobileMediaTarget,type MobileMediaIdentity,type MobileMediaTarget,type MobileMediaEntity,type MobileMediaPhoto,type MobileRecordMedia,type MobileMediaReceipt,type MobileMediaSlotInfo,type MobileMediaTargets} from '../../../shared/mobile-record-media';
import {
  isMobileDraftOptions,
  isMobileDraftProfile,
  isMobileDraftInventory,
  isMobileDraftCustomers,
  isMobileVehicleAvailability,
  isMobileDraftStaff,
} from "@himoto/mobile-draft-validation";
import {
  isLogin,
  isRefreshSession,
  isLogout,
  isPage,
  isRecord,
  isSession,
  isWorkspace,
  isCustomerProfile,
  isWriteReceipt,
  isReceiptLookup,
} from "./response-validation";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}
export function apiOrigin(value: string | undefined, development = false) {
  if (!value)
    throw new ApiError(
      "Ứng dụng chưa được cấu hình kết nối. Vui lòng liên hệ quản trị viên.",
      0,
      "CONFIGURATION",
    );
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError("Cấu hình kết nối không hợp lệ.", 0, "CONFIGURATION");
  }
  const local =
    /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(
      url.hostname,
    );
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(development && local && url.protocol === "http:"))
  ) {
    throw new ApiError(
      "Ứng dụng yêu cầu địa chỉ máy chủ HTTPS hợp lệ.",
      0,
      "CONFIGURATION",
    );
  }
  return url.origin;
}
function videoReviewHeaders(info:MobileMediaSlotInfo,key:string) {return{'Idempotency-Key':key,'X-Record-Revision':info.target.revision,'X-Reference-Revision':info.target.referenceRevision,'X-Photo-Revision':info.photo?.revision??'0','X-Media-Snapshot':info.target.snapshot??''};}
export function createApi(
  origin: string,
  token?: string,
  expired?: () => void,
  offline?: OfflineTransport,
  access?: { token: (force?: boolean) => Promise<string>; current: () => string },
) {
  let onExpired = expired;
  let expiryNotified = false;
  const authorization = () => {
    const current = access?.current() || token;
    return current ? { Authorization: `Bearer ${current}` } : undefined;
  };
  function request<T>(path: string, validate: (value: unknown) => value is T, options: RequestInit = {}, timeoutMs = 25000): Promise<T> {
    const timeout = timeoutMs;
    const send = () => networkRequest(path, validate, options, timeout);
    return offline ? offline.execute(path, validate, options, send, timeout) : send();
  }
  async function networkRequest<T>(
    path: string,
    validate: (value: unknown) => value is T,
    options: RequestInit = {},
    timeoutMs = 25000,
    refreshed = false,
  ): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener("abort", abort, { once: true });
    let timeout = false;
    const timer = setTimeout(() => {
      timeout = true;
      controller.abort();
    }, timeoutMs);
    try {
      if (access) token = await access.token();
      if (controller.signal.aborted) throw new DOMException('Aborted','AbortError');
      const response = await fetch(`${origin}/api/mobile/v1${path}`, {
        ...options,
        signal: controller.signal,
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          ...(options.body && !(typeof FormData !== 'undefined' && options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
          ...options.headers,
          ...authorization(),
        },
      });
      const binary = response.ok && response.headers?.get('Content-Type')?.split(';')[0] === WORKBOOK_MIME;
      const data = binary ? await readWorkbookDownload(response, controller.signal) : await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401 && access && !refreshed) {
          token = await access.token(true);
          return await networkRequest(path, validate, options, timeoutMs, true);
        }
        throw new ApiError(
          typeof data?.message === "string"
            ? data.message
            : "Không tải được dữ liệu. Vui lòng thử lại.",
          response.status,
          typeof data?.code === "string" ? data.code : "REQUEST_FAILED",
          data?.fields &&
          typeof data.fields === "object" &&
          !Array.isArray(data.fields) &&
          Object.keys(data.fields).length <= 80 &&
          Object.entries(data.fields).every(
            ([key, value]) =>
              /^[a-z0-9_]{1,100}$/.test(key) &&
              typeof value === "string" &&
              value.length <= 1000,
          )
            ? (Object.fromEntries(Object.entries(data.fields)) as Record<
                string,
                string
              >)
            : undefined,
        );
      }
      if (!validate(data))
        throw new ApiError(
          "Dữ liệu phản hồi không hợp lệ. Vui lòng thử lại hoặc cập nhật ứng dụng.",
          502,
          "INVALID_RESPONSE",
        );
      return data;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && token && !expiryNotified) { expiryNotified = true; onExpired?.(); }
      if (error instanceof ApiError || options.signal?.aborted) throw error;
      throw new ApiError(
        timeout
          ? "Máy chủ phản hồi quá lâu. Vui lòng thử lại."
          : "Không kết nối được máy chủ. Kiểm tra kết nối mạng và thử lại.",
        0,
        "NETWORK",
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  }
  return {
    attendance:(params:string,signal?:AbortSignal)=>request(`/attendance?${params}`,isAttendanceSummary,{signal}),
    clockAttendance:(body:FormData)=>request('/attendance',isAttendanceReceipt,{method:'POST',body},45000),
    resolveAttendance:(key:string)=>request(`/attendance?request_id=${encodeURIComponent(key)}`,isAttendanceResolution),
    guideFaq:(params:string,signal?:AbortSignal)=>request(`/guide-faq?${params}`,isMobileGuideFaq,{signal}),
    saveGuideFaq:(body:FormData)=>request<{success:true}>('/guide-faq',(v):v is {success:true}=>!!v&&typeof v==='object'&&'success'in v&&v.success===true,{method:'POST',body},60000),
    supportPhoto:(kind:'attendance'|'guide-faq',id:string,side?:'in'|'out')=>({uri:`${origin}/api/mobile/v1/${kind}?photo=${encodeURIComponent(id)}${side?'&side='+side:''}`,headers:authorization()}),
    refundQr:(id:string,bytes:ArrayBuffer)=>request<{fields:Partial<Record<'recipient_bank'|'recipient_account'|'recipient_name',string>>;warnings:string[]}>(`/contracts/${id}/refund-qr`,(v):v is {fields:Partial<Record<'recipient_bank'|'recipient_account'|'recipient_name',string>>;warnings:string[]}=>!!v&&typeof v==='object'&&'fields'in v&&!!v.fields&&typeof v.fields==='object'&&Object.entries(v.fields).every(([key,value])=>['recipient_bank','recipient_account','recipient_name'].includes(key)&&typeof value==='string'&&value.length<=150)&&'warnings'in v&&Array.isArray(v.warnings)&&v.warnings.every(w=>typeof w==='string'),{method:'POST',headers:{'Content-Type':'image/jpeg'},body:bytes},60000),
    contractTelegram:(id:string,signal?:AbortSignal)=>request<ContractTelegramState>(`/contracts/${id}/telegram`,isMobileContractTelegram,{signal},60000),
    pendingTelegram:(params:string,signal?:AbortSignal)=>request<MobilePendingTelegram>(`/telegram/pending?${params}`,isMobilePendingTelegram,{signal}),
    saveContractTelegram:(id:string,input:MobileTelegramCommand,key:string)=>request<MobileTelegramResult>(`/contracts/${id}/telegram`,(v):v is MobileTelegramResult=>isMobileTelegramResult(v)&&v.key===key&&v.operation===`telegram.contract:${id}`&&v.action===input.action,{method:'POST',body:JSON.stringify(input),headers:{'Idempotency-Key':key}},90000),
    transferTelegram:(id:string,eventId:string,signal?:AbortSignal)=>request<MobileTransferTelegram>(`/vehicles/${id}/transfers/${eventId}/telegram`,(v):v is MobileTransferTelegram=>isMobileTransferTelegram(v)&&String(v.vehicle_id)===id&&String(v.event_id)===eventId,{signal},60000),
    saveTransferTelegram:(id:string,eventId:string,review:string,key:string)=>request<MobileTelegramResult>(`/vehicles/${id}/transfers/${eventId}/telegram`,(v):v is MobileTelegramResult=>isMobileTelegramResult(v)&&v.key===key&&v.operation===`telegram.transfer:${eventId}`&&String(v.id)===id,{method:'POST',body:JSON.stringify({action:'send',review}),headers:{'Idempotency-Key':key}},90000),
    telegramResult:(key:string,signal?:AbortSignal)=>request<{result:MobileTelegramResult|null}>(`/telegram/requests/${key}`,(v):v is {result:MobileTelegramResult|null}=>!!v&&typeof v==='object'&&'result'in v&&(v.result===null||isMobileTelegramResult(v.result)&&v.result.key===key),{signal},60000),
    contractImportOptions:(signal?:AbortSignal)=>request<{namespace:string;stores:{id:number;name:string}[]}>('/contract-import/options',(v):v is {namespace:string;stores:{id:number;name:string}[]}=>!!v&&typeof v==='object'&&'namespace'in v&&v.namespace==='himoto-customer-workbooks-v1'&&'stores'in v&&Array.isArray(v.stores)&&v.stores.every(s=>!!s&&Number.isSafeInteger(s.id)&&s.id>0&&typeof s.name==='string'),{signal}),
    contractImportTemplate:(signal?:AbortSignal)=>request<MobileWorkbookExport>('/contract-import/template',(v):v is MobileWorkbookExport=>isMobileFileExport(v)&&v.mimeType==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',{signal}),
    contractImportWorkbook:(file:{name:string;bytes:Uint8Array<ArrayBuffer>},storeId:number,signal?:AbortSignal)=>request<MobileContractWorkbook>('/contract-import/workbook',isMobileContractWorkbook,{method:'POST',body:file.bytes.buffer,headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','x-file-name':encodeURIComponent(file.name),'x-source-store':String(storeId)},signal},90000),
    contractImportPreview:(files:MobileContractWorkbook[],signal?:AbortSignal)=>request<MobileContractImportPreview>('/contract-import/preview',isMobileContractImportPreview,{method:'POST',body:JSON.stringify({files}),signal},90000),
    importContracts:(input:MobileContractImportInput,key:string)=>request<MobileImportReceipt>(`/contract-import/${input.batchId}`,(v):v is MobileImportReceipt=>isMobileImportReceipt(v)&&v.kind==='contracts'&&v.key===key&&v.batchId===input.batchId&&v.count===input.expectedAdded,{method:'POST',body:JSON.stringify(input),headers:{'Idempotency-Key':key}},120000),
    vehicleOcr: (bytes: ArrayBuffer, requestId: string, signal?: AbortSignal) => request<MobileVehicleOcr>("/vehicles/documents/ocr", (value): value is MobileVehicleOcr => isVehicleOcr(value) && value.requestId === requestId, { method: "POST", body: bytes, headers: { "Content-Type": "image/jpeg", "X-Ocr-Request": requestId }, signal }, 60000),
    vehicleProfile: (id: string, signal?: AbortSignal) => request<MobileVehicleProfile>(`/vehicles/${encodeURIComponent(id)}`, (value): value is MobileVehicleProfile => isVehicleProfile(value) && String(value.id) === id, { signal }),
    vehicleContracts:(id:string,page=1,signal?:AbortSignal)=>request<MobileVehicleContracts>(`/vehicles/${encodeURIComponent(id)}/contracts?page=${page}`,(v):v is MobileVehicleContracts=>isVehicleContracts(v)&&String(v.id)===id,{signal}),
    vehicleOptions: (signal?: AbortSignal) => request<MobileVehicleOptions>("/vehicles/options", isVehicleOptions, { signal }),
    fleetInventory:(query:string,signal?:AbortSignal)=>request<MobileFleetInventory>(`/vehicles/inventory?${query}`,isFleetInventory,{signal}),
    saveVehicle: (id: string | null, input: MobileVehicleInput, key: string) => request<MobileWriteReceipt>(`/vehicles${id === null ? "" : `/${encodeURIComponent(id)}`}`, (value): value is MobileWriteReceipt => isWriteReceipt(value) && (id === null || String(value.id) === id), { method: id === null ? "POST" : "PATCH", body: JSON.stringify(input), headers: { "Idempotency-Key": key } }),
    vehicleResult: (key: string, signal?: AbortSignal) => request<MobileVehicleResult>(`/vehicles/requests/${encodeURIComponent(key)}`, (value): value is MobileVehicleResult => isVehicleResult(value) && value.key === key, { signal }),
    vehicleHistory: (id: string, params: string, signal?: AbortSignal) => request<MobileVehicleHistory>(`/vehicles/${encodeURIComponent(id)}/history?${params}`, (value): value is MobileVehicleHistory => isVehicleHistory(value) && String(value.id) === id, { signal }),
    transferHistory: (params: string, signal?: AbortSignal) => request<MobileTransferHistory>(`/vehicles/transfers?${params}`, isTransferHistory, { signal }),
    directory: (kind: MobileDirectoryKind, params: string, signal?: AbortSignal) => request<MobileDirectoryPage>(`/directory/${kind}?${params}`, isDirectoryPage, { signal }),
    cashbook: (params: string, signal?: AbortSignal) => request<MobileCashbookPage>(`/cashbook?${params}`, isCashbookPage, { signal }),
    reportOptions: (signal?: AbortSignal) => request<SalesReportOptions>("/reports/options", isSalesReportOptions, { signal }),
    batteryOptions:(signal?:AbortSignal)=>request<MobileBatteryOptions>("/battery-contracts/options",isBatteryOptions,{signal}),
    batteryStaff:(signal?:AbortSignal)=>request<MobileBatteryStaff>('/battery-contracts/staff',isMobileBatteryStaff,{signal}),
    batteryMedia:(id:string,eventKey:string,signal?:AbortSignal)=>request<BatteryMedia>(`/battery-contracts/${id}/media/${eventKey}`,(v):v is BatteryMedia=>isBatteryMedia(v)&&String(v.id)===id&&v.eventKey===eventKey,{signal}),
    saveBatteryMedia:(id:string,eventKey:string,fileId:string,bytes:ArrayBuffer,key:string)=>request<MobileWriteReceipt>(`/battery-contracts/${id}/media/${eventKey}/${fileId}`,(v):v is MobileWriteReceipt=>isWriteReceipt(v)&&String(v.id)===id,{method:'PUT',headers:{'Content-Type':'image/jpeg','Idempotency-Key':key},body:bytes}),
    batteryMediaSource:(id:string,eventKey:string,fileId:string)=>({uri:`${origin}/api/mobile/v1/battery-contracts/${id}/media/${eventKey}/${fileId}`,headers:authorization()}),
    batteryTelegram:(id:string,key:string,signal?:AbortSignal)=>request<MobileBatteryTelegram>(`/battery-contracts/${encodeURIComponent(id)}/telegram?request_id=${encodeURIComponent(key)}`,(v):v is MobileBatteryTelegram=>isBatteryTelegram(v)&&String(v.battery_contract_id)===id&&v.request_id===key,{signal}),
    sendBatteryTelegram:(id:string,key:string)=>request<MobileBatteryTelegram>(`/battery-contracts/${encodeURIComponent(id)}/telegram`,(v):v is MobileBatteryTelegram=>isBatteryTelegram(v)&&String(v.battery_contract_id)===id&&v.request_id===key,{method:'POST',body:JSON.stringify({action:'send',request_id:key})}),
    batteries:(params:string,signal?:AbortSignal)=>request<MobileBatteryPage>(`/battery-contracts?${params}`,isBatteryPage,{signal}),
    battery:(id:string,signal?:AbortSignal)=>request<BatteryWorkflowContext>(`/battery-contracts/${encodeURIComponent(id)}`,(v):v is BatteryWorkflowContext=>isBatteryWorkflow(v)&&String(v.contract.id)===id,{signal}),
    batteryPrefill:(id:string,signal?:AbortSignal)=>request<MobileBatteryPrefill>(`/battery-contracts/from-contract/${encodeURIComponent(id)}`,(v):v is MobileBatteryPrefill=>!!v&&typeof v==="object"&&"sourceId" in v&&String(v.sourceId)===id&&"sourceCode" in v&&typeof v.sourceCode==="string"&&"values" in v&&!!v.values&&typeof v.values==="object",{signal}),
    saveBattery:(id:string|null,input:MobileBatteryInput,key:string)=>request<MobileWriteReceipt>(`/battery-contracts${id?`/${encodeURIComponent(id)}`:""}`,(v):v is MobileWriteReceipt=>isWriteReceipt(v)&&(!id||String(v.id)===id),{method:id?"PATCH":"POST",body:JSON.stringify(input),headers:{"Idempotency-Key":key}}),
    batteryAction:(id:string,input:MobileBatteryAction,key:string)=>request<MobileWriteReceipt>(`/battery-contracts/${encodeURIComponent(id)}/actions`,(v):v is MobileWriteReceipt=>isWriteReceipt(v)&&String(v.id)===id,{method:"POST",body:JSON.stringify(input),headers:{"Idempotency-Key":key}}),
    deleteBattery:(id:string,revision:string,key:string)=>request<MobileWriteReceipt>(`/battery-contracts/${encodeURIComponent(id)}`,(v):v is MobileWriteReceipt=>isWriteReceipt(v)&&String(v.id)===id,{method:"DELETE",body:JSON.stringify({revision}),headers:{"Idempotency-Key":key}}),
    batteryResult:(key:string,signal?:AbortSignal)=>request<MobileBatteryResult>(`/battery-contracts/requests/${encodeURIComponent(key)}`,(v):v is MobileBatteryResult=>isBatteryResult(v)&&v.key===key,{signal}),
    registrationMonth:(month:string,signal?:AbortSignal)=>request<RegistrationMonth>(`/duty-roster/registrations?${new URLSearchParams({month})}`,isRegistrationMonth,{signal}),
    registrationRange:(from:string,to:string,signal?:AbortSignal)=>request<RegistrationRange>(`/duty-roster/registrations?${new URLSearchParams({from,to})}`,(v):v is RegistrationRange=>isRegistrationRange(v)&&v.from===from&&v.to===to,{signal}),
    attendanceLocations:(signal?:AbortSignal)=>request<MobileAttendanceLocation[]>('/attendance/locations',isMobileAttendanceLocations,{signal}),
    saveAttendanceLocation:(input:{storeId:string;latitude:number;longitude:number})=>request<{success:true}>('/attendance/locations',(v):v is {success:true}=>!!v&&typeof v==='object'&&'success'in v&&v.success===true,{method:'PUT',body:JSON.stringify(input)}),
    saveRegistration:(input:RegistrationInput)=>request<ShiftRegistration>('/duty-roster/registrations',isShiftRegistration,{method:'PUT',body:JSON.stringify(input)}),
    selfRegistration:(week:string,signal?:AbortSignal)=>request<SelfRegistrationWeek>(`/attendance/shift-registration?${new URLSearchParams({week})}`,isSelfRegistrationWeek,{signal}),
    saveSelfRegistration:(input:SelfRegistrationInput)=>request<SelfRegistrationWeek>('/attendance/shift-registration',isSelfRegistrationWeek,{method:'PUT',body:JSON.stringify(input)}),
    staffAccounts:(id:string,signal?:AbortSignal)=>request<MobileStaffAccount[]>(`/staff/${id}/accounts`,isMobileStaffAccounts,{signal}),
    shiftOptions:(signal?:AbortSignal)=>request<MobileShiftOptions>("/shift-reports/options",isShiftOptions,{signal}),
    shifts:(params:string,signal?:AbortSignal)=>request<{rows:ShiftReport[]}>(`/shift-reports?${params}`,(v):v is {rows:ShiftReport[]}=>!!v&&typeof v==="object"&&"rows" in v&&Array.isArray(v.rows)&&v.rows.every(isShiftReport),{signal}),
    shift:(id:string,signal?:AbortSignal)=>request<ShiftReport>(`/shift-reports/${encodeURIComponent(id)}`,(v):v is ShiftReport=>isShiftReport(v)&&String(v.id)===id,{signal}),
    shiftAutofill:(store:number,date:string,section:ShiftAutofillSection,signal?:AbortSignal)=>request<ShiftAutofillResult>(`/shift-reports/autofill?${new URLSearchParams({store_id:String(store),date,section})}`,(v):v is ShiftAutofillResult=>!!v&&typeof v==="object"&&"store_id" in v&&v.store_id===store&&"date" in v&&v.date===date&&"section" in v&&v.section===section&&"values" in v&&!!v.values&&typeof v.values==="object"&&"notices" in v&&Array.isArray(v.notices)&&v.notices.every(n=>typeof n==="string")&&"sources" in v&&Array.isArray(v.sources)&&v.sources.every(n=>typeof n==="string"),{signal},65000),
    saveShift:(input:MobileShiftSave,key:string)=>request<MobileWriteReceipt>("/shift-reports",isWriteReceipt,{method:"POST",body:JSON.stringify(input),headers:{"Idempotency-Key":key}},90000),
    shiftResult:(key:string,signal?:AbortSignal)=>request<MobileShiftResult>(`/shift-reports/requests/${encodeURIComponent(key)}`,(v):v is MobileShiftResult=>isShiftResult(v)&&v.key===key,{signal}),
    shiftSnapshot:(id:string,signal?:AbortSignal)=>request<ShiftSnapshot>(`/shift-reports/${encodeURIComponent(id)}/audit`,isShiftSnapshot,{signal},65000),
    shiftTelegram:(id:string,signal?:AbortSignal,stage='pgd')=>request<ShiftTelegramState|null>(`/shift-reports/${encodeURIComponent(id)}/telegram${stage==='audit'?'?stage=audit':''}`,(v):v is ShiftTelegramState|null=>v===null||!!v&&typeof v==="object"&&"status" in v&&typeof v.status==="string"&&"message_id" in v&&(v.message_id===null||Number.isSafeInteger(v.message_id))&&"error_code" in v&&(v.error_code===null||typeof v.error_code==="string"),{signal}),
    retryShiftTelegram:(id:string,stage='pgd')=>request<{status:string}>(`/shift-reports/${encodeURIComponent(id)}/telegram${stage==='audit'?'?stage=audit':''}`,(v):v is {status:string}=>!!v&&typeof v==="object"&&"status" in v&&typeof v.status==="string",{method:"POST"}),
    saveShiftAudit:(id:string,input:MobileAuditSave,key:string)=>request<MobileWriteReceipt>(`/shift-reports/${encodeURIComponent(id)}/audit`,isWriteReceipt,{method:"POST",body:JSON.stringify(input),headers:{"Idempotency-Key":key}},65000),
    shiftMediaSource:(id:number,file:string,legacy=false)=>({uri:`${origin}/api/mobile/v1/shift-reports/${id}/${legacy?"photos":"media"}/${encodeURIComponent(file)}`,headers:authorization()}),
    shiftVideoSource:(id:number,file:string,revision:number)=>({uri:`${origin}/api/mobile/v1/shift-reports/${id}/media/${encodeURIComponent(file)}?video=1&revision=${revision}`,headers:authorization(),useCaching:false}),
    shiftVideoConfig:(id:string,review:MobileShiftVideoReview,key:string,signal?:AbortSignal)=>request<{direct:boolean}>(`/shift-reports/${id}/video-upload`,isMobileVideoUploadConfig,{method:'POST',body:JSON.stringify({...review,action:'config',uploadId:key}),headers:{'Idempotency-Key':key},signal}),
    signShiftDirectVideo:(id:string,review:MobileShiftVideoReview,key:string,actor:number,bytes:number,sha256:string,signal?:AbortSignal)=>request<MobileVideoDirectResult>(`/shift-reports/${id}/video-upload`,(v):v is MobileVideoDirectResult=>isMobileVideoDirectResult(v,actor,key,sha256),{method:'POST',body:JSON.stringify({...review,action:'sign',uploadId:key,bytes,sha256}),headers:{'Idempotency-Key':key},signal}),
    verifyShiftDirectVideo:(id:string,review:MobileShiftVideoReview,key:string,ticket:string,signal?:AbortSignal)=>request<{receipt:MobileVideoBrowserReceipt}>(`/shift-reports/${id}/video-upload`,(v):v is {receipt:MobileVideoBrowserReceipt}=>!!v&&typeof v==='object'&&'receipt'in v&&isMobileVideoBrowserReceipt(v.receipt)&&v.receipt.upload_id===key,{method:'POST',body:JSON.stringify({...review,action:'verify',uploadId:key,ticket}),headers:{'Idempotency-Key':key},signal},150000),
    signShiftVideo:(id:string,review:MobileShiftVideoReview,key:string,signal?:AbortSignal)=>request<MobileVideoUploadSignature>(`/shift-reports/${id}/video-upload`,(v):v is MobileVideoUploadSignature=>isMobileVideoSignature(v)&&String(v.params.public_id).endsWith('/'+key),{method:'POST',body:JSON.stringify({...review,action:'conversion',uploadId:key}),headers:{'Idempotency-Key':key},signal}),
    saveShiftVideo:(id:string,mediaId:string,review:MobileShiftVideoReview,cloud:MobileVideoCloudReceipt|MobileVideoBrowserReceipt,key:string)=>request<{revision:number}>(`/shift-reports/${id}/media/${encodeURIComponent(mediaId)}`,(v):v is {revision:number}=>!!v&&typeof v==='object'&&'revision'in v&&Number.isSafeInteger(v.revision)&&Number(v.revision)>review.revision,{method:'PUT',body:JSON.stringify(cloud),headers:{'x-shift-request-id':key,'x-report-revision':String(review.revision),'x-shift-category':review.category,'x-shift-stage':review.stage,'x-file-name':encodeURIComponent(`himoto-${review.stage}-${review.category}-${mediaId}.mp4`)}},180000),
    saveShiftMedia:(id:number,media:string,stage:"pgd"|"audit",category:string,revision:number,bytes:ArrayBuffer,key:string)=>request<{revision:number}>(`/shift-reports/${id}/media/${encodeURIComponent(media)}`,(v):v is {revision:number}=>!!v&&typeof v==="object"&&"revision" in v&&Number.isSafeInteger(v.revision)&&Number(v.revision)>revision,{method:"PUT",body:bytes,headers:{"Content-Type":"image/jpeg","x-shift-request-id":key,"x-report-revision":String(revision),"x-shift-category":category,"x-shift-stage":stage,"x-file-name":encodeURIComponent(`himoto-${category}.jpg`)}},90000),
    deleteShiftMedia:(id:number,media:string,stage:"pgd"|"audit",category:string,revision:number,key:string)=>request<{revision:number}>(`/shift-reports/${id}/media/${encodeURIComponent(media)}`,(v):v is {revision:number}=>!!v&&typeof v==="object"&&"revision" in v&&Number.isSafeInteger(v.revision)&&Number(v.revision)>revision,{method:"DELETE",headers:{"x-shift-request-id":key,"x-report-revision":String(revision),"x-shift-category":category,"x-shift-stage":stage}}),
    reminderOptions: (signal?:AbortSignal)=>request<MobileReminderOptions>("/debt-reminders/options",isReminderOptions,{signal}),
    reminderHistory: (params:string,signal?:AbortSignal)=>request<MobileReminderHistory>(`/debt-reminders?${params}`,isReminderHistory,{signal}),
    reminderContracts: (params:string,signal?:AbortSignal)=>request<MobilePage>(`/debt-reminders/contracts?${params}`,isPage,{signal}),
    reminderContext: (id:string,signal?:AbortSignal)=>request<DebtReminderContext>(`/debt-reminders/context/${encodeURIComponent(id)}`,(v):v is DebtReminderContext=>isReminderContext(v)&&String(v.id)===id,{signal}),
    sendReminder: (input:Omit<DebtReminderInput,"request_id">,key:string)=>request<{request_id:string;status:ReminderStatus;replayed:boolean}>("/debt-reminders",(v):v is {request_id:string;status:ReminderStatus;replayed:boolean}=>!!v&&typeof v==="object"&&"request_id" in v&&v.request_id===key&&"status" in v&&isReminderStatus(v.status)&&"replayed" in v&&typeof v.replayed==="boolean",{method:"POST",body:JSON.stringify(input),headers:{"Idempotency-Key":key}},35000),
    reminderResult: (key:string,signal?:AbortSignal)=>request<MobileReminderResult>(`/debt-reminders/requests/${encodeURIComponent(key)}`,(v):v is MobileReminderResult=>isReminderResult(v)&&v.key===key,{signal}),
    salesReport: async (kind: SalesReportKind, params: string, signal?: AbortSignal) => {
      const validate = (value: unknown): value is MobileSalesReport => isMobileSalesReport(value) && value.kind === kind;
      try { return await request<MobileSalesReport>(`/reports/${kind}?${params}`, validate, { signal }, 70000); }
      catch (error) {
        const legacy = new URLSearchParams(params);
        if (!(error instanceof ApiError) || error.status !== 400 || !legacy.has('section_pages')) throw error;
        legacy.delete('section_pages');
        return request<MobileSalesReport>(`/reports/${kind}?${legacy}`, validate, { signal }, 70000);
      }
    },
    salesReportExport: (kind: SalesReportKind, params: string, signal?: AbortSignal) => request<MobileFileExport>(`/reports/${kind}/export?${params}&format=xlsx`, isMobileFileExport, { signal, headers: { Accept: `${WORKBOOK_MIME}, application/json` } }, 90000),
    cashbookExport: (params: string, signal?: AbortSignal) => request<MobileCsvExport>(`/cashbook/export?${params}`, isMobileCsvExport, { signal }, 70000),
    cashbookExcel: (params:string,signal?:AbortSignal)=>request<MobileFileExport>(`/cashbook/export?${params}&format=xlsx`,isMobileFileExport,{signal,headers:{Accept:`${WORKBOOK_MIME}, application/json`}},70000),
    cashbookDeleteSelection: (params: string, signal?: AbortSignal) => request<VoucherDeleteSelection>(`/cashbook/vouchers/selection?${params}`, isVoucherDeleteSelection, { signal }, 70000),
    deleteCashbookVouchers: (ids: number[], key: string) => request<VoucherDeletion>("/cashbook/vouchers", (value): value is VoucherDeletion => isVoucherDeletion(value) && value.key === key && value.deletedCount === ids.length, { method: "DELETE", body: JSON.stringify({ ids }), headers: { "Idempotency-Key": key } }),
    cashbookDeletion: (key: string, signal?: AbortSignal) => request<VoucherDeletion>(`/cashbook/deletions/requests/${encodeURIComponent(key)}`, (value): value is VoucherDeletion => isVoucherDeletion(value) && value.key === key, { signal }),
    cashbookAccounts: (params: string, signal?: AbortSignal) => request<MobileCashbookAccounts>(`/cashbook/accounts?${params}`, isCashbookAccounts, { signal }),
    cashbookAccount: (kind: CashbookAccountKind, id: string, signal?: AbortSignal) => request<MobileCashbookAccount>(`/cashbook/accounts/${kind}/${encodeURIComponent(id)}`, (value): value is MobileCashbookAccount => isCashbookAccount(value) && value.kind === kind && String(value.id) === id, { signal }),
    cashbookAccountTransactions: (kind: CashbookAccountKind, id: string, params: string, signal?: AbortSignal) => request<MobileCashbookTransactions>(`/cashbook/accounts/${kind}/${encodeURIComponent(id)}/transactions?${params}`, (value): value is MobileCashbookTransactions => isCashbookTransactions(value) && value.kind === kind && String(value.id) === id, { signal }),
    cashbookOptions: (signal?: AbortSignal) => request<{ stores: { id: number; name: string }[] }>("/cashbook/accounts/options", (value): value is { stores: { id: number; name: string }[] } => !!value && typeof value === "object" && Array.isArray((value as { stores: unknown }).stores) && (value as { stores: unknown[] }).stores.every(row => !!row && typeof row === "object" && Number.isSafeInteger((row as { id: unknown }).id) && Number((row as { id: unknown }).id) > 0 && typeof (row as { name: unknown }).name === "string"), { signal }),
    saveCashbookAccount: (kind: CashbookAccountKind, id: string | null, input: CashbookAccountInput | { revision: string; status?: string }, key: string, action: "create" | "update" | "status" | "delete") => request<MobileWriteReceipt>(`/cashbook/accounts/${kind}${id === null ? "" : `/${encodeURIComponent(id)}`}${action === "status" ? "/status" : ""}`, (value): value is MobileWriteReceipt => isWriteReceipt(value) && (id === null || String(value.id) === id), { method: action === "delete" ? "DELETE" : action === "create" ? "POST" : "PATCH", body: JSON.stringify(input), headers: { "Idempotency-Key": key } }),
    cashbookAccountResult: (key: string, signal?: AbortSignal) => request<MobileCashbookAccountResult>(`/cashbook/accounts/requests/${encodeURIComponent(key)}`, (value): value is MobileCashbookAccountResult => isCashbookAccountResult(value) && value.key === key, { signal }),
    staffProfile: (id: string, signal?: AbortSignal) => request<MobileStaffProfile>(`/staff/${encodeURIComponent(id)}`, (value): value is MobileStaffProfile => isStaffProfile(value) && String(value.id) === id, { signal }),
    staffOptions: (signal?: AbortSignal) => request<MobileStaffOptions>("/staff/options", isStaffOptions, { signal }),
    staffOrganization:(filters:string,signal?:AbortSignal)=>request<MobileStaffOrganization>(`/staff/organization?${filters}`,isMobileStaffOrganization,{signal}),
    dashboard:(filters:string,signal?:AbortSignal)=>{const params=new URLSearchParams(filters);return request<DashboardSummary>(`/dashboard?${filters}`,(v):v is DashboardSummary=>isMobileDashboard(v)&&v.from===params.get('from')&&v.to===params.get('to'),{signal},70000);},
    dashboardExport:(filters:string,signal?:AbortSignal)=>request<MobileFileExport>(`/dashboard/export?${filters}&format=xlsx`,isMobileFileExport,{signal,headers:{Accept:`${WORKBOOK_MIME}, application/json`}},70000),
    bulkDeleteReview:(kind:MobileBulkKind,ids:number[],signal?:AbortSignal)=>request<MobileBulkReview>(`/bulk-delete/${kind}/review`,(v):v is MobileBulkReview=>isMobileBulkReview(v)&&v.kind===kind,{method:'POST',body:JSON.stringify({ids}),signal}),
    bulkDelete:(review:MobileBulkReview,key:string)=>request<MobileBulkDeletion>(`/bulk-delete/${review.kind}`,(v):v is MobileBulkDeletion=>isMobileBulkDeletion(v)&&v.key===key&&v.kind===review.kind&&v.deletedCount===review.rows.length,{method:'DELETE',body:JSON.stringify({ids:review.rows.map(r=>r.id),review:review.review}),headers:{'Idempotency-Key':key}}),
    bulkDeletion:(key:string,signal?:AbortSignal)=>request<MobileBulkDeletion>(`/bulk-delete/requests/${encodeURIComponent(key)}`,(v):v is MobileBulkDeletion=>isMobileBulkDeletion(v)&&v.key===key,{signal}),
    storeContracts:(id:string,filters:string,signal?:AbortSignal)=>request<MobileStoreContracts>(`/stores/${encodeURIComponent(id)}/contracts?${filters}`,(v):v is MobileStoreContracts=>isMobileStoreContracts(v)&&String(v.id)===id,{signal},60000),
    saveStaff: (id: string | null, input: MobileStaffInput | { revision: string }, key: string, deleting = false) => request<MobileStaffWriteResult>(`/staff${id === null ? "" : `/${encodeURIComponent(id)}`}`, (value): value is MobileStaffWriteResult => isStaffWriteResult(value) && (id === null || String(value.id) === id), { method: deleting ? "DELETE" : id === null ? "POST" : "PATCH", body: JSON.stringify(input), headers: { "Idempotency-Key": key } }),
    staffResult: (key: string, signal?: AbortSignal) => request<MobileStaffResult>(`/staff/requests/${encodeURIComponent(key)}`, (value): value is MobileStaffResult => isStaffResult(value) && value.key === key, { signal }),
    storeProfile: (id: string, signal?: AbortSignal) => request<MobileStoreProfile>(`/stores/${encodeURIComponent(id)}`, (value): value is MobileStoreProfile => isStoreProfile(value) && String(value.id) === id, { signal }),
    storeManagers: (signal?: AbortSignal) => request<MobileStoreManagers>("/stores/managers", isStoreManagers, { signal }),
    saveStore: (id: string | null, input: StoreCreation | StoreEdits | { revision: string }, key: string, deleting = false) => request<MobileWriteReceipt>(`/stores${id === null ? "" : `/${encodeURIComponent(id)}`}`, (value): value is MobileWriteReceipt => isWriteReceipt(value) && (id === null || String(value.id) === id), { method: deleting ? "DELETE" : id === null ? "POST" : "PATCH", body: JSON.stringify(input), headers: { "Idempotency-Key": key } }),
    storeResult: (key: string, signal?: AbortSignal) => request<MobileStoreResult>(`/stores/requests/${encodeURIComponent(key)}`, (value): value is MobileStoreResult => isStoreResult(value) && value.key === key, { signal }),
    dutyRoster: (params: string, signal?: AbortSignal) => request<MobileDutyRoster>(`/duty-roster?${params}`, isDutyRoster, { signal }),
    saveDuty: (id: number | null, input: MobileDutyInput | { revision: string }, key: string, deleting = false) => request<MobileWriteReceipt>(`/duty-roster${id === null ? "" : `/${id}`}`, (value): value is MobileWriteReceipt => isWriteReceipt(value) && (id === null || value.id === id), { method: deleting ? "DELETE" : id === null ? "POST" : "PATCH", body: JSON.stringify(input), headers: { "Idempotency-Key": key } }),
    dutyResult: (key: string, signal?: AbortSignal) => request<MobileDutyResult>(`/duty-roster/requests/${encodeURIComponent(key)}`, (value): value is MobileDutyResult => isDutyResult(value) && value.key === key, { signal }),
    origin,
    plateOcr:(bytes:ArrayBuffer,key:string,signal?:AbortSignal)=>request<MobilePlateOcr>('/drafts/plate-ocr',(v):v is MobilePlateOcr=>isMobilePlateOcr(v,key),
      {method:'POST',body:bytes,headers:{'Content-Type':'image/jpeg','X-Photo-Kind':'plate','X-Ocr-Request':key},signal},45000),
    plateLookup:(license:string,signal?:AbortSignal)=>request<MobilePlateMatch>(`/drafts/plate-lookup?${new URLSearchParams({license})}`,(v):v is MobilePlateMatch=>isMobilePlateMatch(v,license),{signal}),
    gps:(query:MobileGpsQuery,signal?:AbortSignal)=>request<MobileGpsWorkspace>(`/gps?${gpsQueryString(query)}`,(v):v is MobileGpsWorkspace=>isMobileGpsWorkspace(v,query),{signal}),
    refreshGps:()=>request<{synced:true;observedAt:string}>('/gps/refresh',(v):v is {synced:true;observedAt:string}=>!!v&&typeof v==='object'&&'synced' in v&&v.synced===true&&'observedAt' in v&&typeof v.observedAt==='string'&&Number.isFinite(Date.parse(v.observedAt)),{method:'POST'},65000),
    gpsMapping:(id:string,signal?:AbortSignal)=>request<MobileGpsMappingPreparation>(`/gps/devices/${encodeURIComponent(id)}/mapping`,(v):v is MobileGpsMappingPreparation=>isGpsMappingPreparation(v)&&String(v.device.id)===id,{signal}),
    gpsMappingCandidates:(id:string,search:string,page:number,signal?:AbortSignal)=>request<MobileGpsMappingCandidates>(`/gps/devices/${encodeURIComponent(id)}/candidates?${new URLSearchParams({search,page:String(page)})}`,
      (v):v is MobileGpsMappingCandidates=>isGpsMappingCandidates(v)&&String(v.deviceId)===id&&v.search===search&&v.page===page,{signal}),
    saveGpsMapping:(id:string,input:MobileGpsMappingInput,key:string)=>request<MobileGpsMappingReceipt>(`/gps/devices/${encodeURIComponent(id)}/mapping`,
      (v):v is MobileGpsMappingReceipt=>isGpsMappingReceipt(v)&&String(v.id)===id&&v.requestId===key&&v.beforeSnapshot===input.snapshot&&v.after?.id===(input.vehicleId??undefined)&&(!v.after||v.after.revision===input.vehicleRevision),
      {method:'POST',headers:{'Idempotency-Key':key},body:JSON.stringify(input)}),
    gpsMappingReceipt:(key:string)=>request<{receipt:MobileGpsMappingReceipt|null}>(`/gps/mappings/requests/${encodeURIComponent(key)}`,
      (v):v is {receipt:MobileGpsMappingReceipt|null}=>!!v&&typeof v==='object'&&'receipt' in v&&(v.receipt===null||isGpsMappingReceipt(v.receipt)&&v.receipt.requestId===key)),
    renewalBill: (id: string, version: number, signal?: AbortSignal) =>
      request<MobileBillInfo>(`/contracts/${encodeURIComponent(id)}/renewals/${version}/bill`,
        (value): value is MobileBillInfo => isMobileBillInfo(value) && String(value.id)===id && value.version===version,{signal}),
    uploadRenewalBill: (id: string, version: number, revision: string, expectedPhotoRevision: string | null, bytes: ArrayBuffer, key: string, backfill=false,slot?:string) =>
      request<MobileBillReceipt>(`/contracts/${encodeURIComponent(id)}/renewals/${version}/bill`,
        (value): value is MobileBillReceipt => isMobileBillReceipt(value) && String(value.id)===id && value.version===version && value.slot===(slot??`renewal-${version}-document-1`),
        {method:"PUT",body:bytes,headers:{"Content-Type":"image/jpeg","Idempotency-Key":key,"X-Contract-Revision":revision,"X-Bill-Revision":expectedPhotoRevision??"0",...(slot?{'X-Bill-Slot':slot}:{}),...(backfill?{"X-Renewal-Backfill":"1"}:{})}}),
    billReceipt: (key: string) =>
      request<{receipt:MobileBillReceipt|null}>(`/bills/requests/${encodeURIComponent(key)}`,
        (value): value is {receipt:MobileBillReceipt|null} => !!value && typeof value==="object" && "receipt" in value && (value.receipt===null || isMobileBillReceipt(value.receipt))),
    collectionBill: (id: string, version: number, signal?: AbortSignal) =>
      request<MobileBillInfo>(`/contracts/${encodeURIComponent(id)}/renewals/${version}/collection/bill`,
        (value): value is MobileBillInfo => isMobileBillInfo(value) && String(value.id) === id && value.version === version, { signal }),
    uploadCollectionBill: (id: string, version: number, revision: string, expectedPhotoRevision: string | null, bytes: ArrayBuffer, key: string,slot?:string) =>
      request<MobileBillReceipt>(`/contracts/${encodeURIComponent(id)}/renewals/${version}/collection/bill`,
        (value): value is MobileBillReceipt => isMobileBillReceipt(value) && String(value.id) === id && value.version === version && value.slot===(slot??`renewal-${version}-document-1`),
        { method: "PUT", body: bytes, headers: { "Content-Type": "image/jpeg", "Idempotency-Key": key, "X-Contract-Revision": revision, "X-Bill-Revision": expectedPhotoRevision ?? "0",...(slot?{'X-Bill-Slot':slot}:{}) } }),
    collectionBillReceipt: (key: string) =>
      request<{ receipt: MobileBillReceipt | null }>(`/renewal-collection-bills/requests/${encodeURIComponent(key)}`,
        (value): value is { receipt: MobileBillReceipt | null } => !!value && typeof value === "object" && "receipt" in value && (value.receipt === null || isMobileBillReceipt(value.receipt))),
    renewalPreparation: (id: string, page = 1, search = "", signal?: AbortSignal, backfill=false) =>
      request<MobileRenewalPreparation>(`/contracts/${encodeURIComponent(id)}/renewals?${new URLSearchParams({ page: String(page), search,...(backfill?{backfill:"1"}:{}) })}`,
        (value): value is MobileRenewalPreparation => isMobileRenewalPreparation(value) && String(value.id) === id && !!value.backfill===backfill, { signal }),
    recordRenewal: (id: string, input: MobileRenewalInput, key: string) =>
      request<MobileRenewalReceipt>(`/contracts/${encodeURIComponent(id)}/renewals`,
        (value): value is MobileRenewalReceipt => isMobileRenewalReceipt(value) && String(value.id) === id && value.version === input.expected_version,
        { method: "POST", body: JSON.stringify(input), headers: { "Idempotency-Key": key } }),
    renewalReceipt: (key: string) =>
      request<{ receipt: MobileRenewalReceipt | null }>(`/renewals/requests/${encodeURIComponent(key)}`,
        (value): value is { receipt: MobileRenewalReceipt | null } => !!value && typeof value === "object" && "receipt" in value && (value.receipt === null || isMobileRenewalReceipt(value.receipt))),
    renewalCollection: (id: string, version: number, signal?: AbortSignal) =>
      request<MobileRenewalCollectionPreparation>(`/contracts/${encodeURIComponent(id)}/renewals/${version}/collection`,
        (value): value is MobileRenewalCollectionPreparation => isMobileRenewalCollectionPreparation(value) && String(value.id) === id && value.period.version === version, { signal }),
    recordRenewalCollection: (id: string, version: number, input: MobileRenewalCollectionInput, key: string) =>
      request<MobileRenewalCollectionReceipt>(`/contracts/${encodeURIComponent(id)}/renewals/${version}/collection`,
        (value): value is MobileRenewalCollectionReceipt => isMobileRenewalCollectionReceipt(value) && String(value.id) === id && value.version === version,
        { method: "POST", body: JSON.stringify(input), headers: { "Idempotency-Key": key } }),
    renewalCollectionReceipt: (key: string) =>
      request<{ receipt: MobileRenewalCollectionReceipt | null }>(`/renewal-collections/requests/${encodeURIComponent(key)}`,
        (value): value is { receipt: MobileRenewalCollectionReceipt | null } => !!value && typeof value === "object" && "receipt" in value && (value.receipt === null || isMobileRenewalCollectionReceipt(value.receipt))),
    finance: (id: string, page = 1, signal?: AbortSignal) =>
      request<MobileFinanceContext>(`/contracts/${encodeURIComponent(id)}/finance?page=${page}`,
        (value): value is MobileFinanceContext => isMobileFinanceContext(value) && String(value.id) === id, { signal }),
    recordPayment: (id: string, input: MobilePaymentInput, key: string) =>
      request<MobilePaymentReceipt>(`/contracts/${encodeURIComponent(id)}/payments`,
        (value): value is MobilePaymentReceipt => isMobilePaymentReceipt(value) && String(value.id) === id,
        { method: "POST", body: JSON.stringify(input), headers: { "Idempotency-Key": key } }),
    paymentReceipt: (key: string) =>
      request<{ receipt: MobilePaymentReceipt | null }>(`/payments/requests/${encodeURIComponent(key)}`,
        (value): value is { receipt: MobilePaymentReceipt | null } => !!value && typeof value === "object" && "receipt" in value && (value.receipt === null || isMobilePaymentReceipt(value.receipt))),
    operations: (params:URLSearchParams,signal?:AbortSignal)=>request<MobileOperations>(`/operations?${params}`,isMobileOperations,{signal}),
    integrations: (signal?:AbortSignal)=>request<IntegrationSettings>('/integrations',isIntegrationSettings,{signal}),
    saveIntegration: (input:IntegrationInput,key:string)=>request<IntegrationReceipt>('/integrations',isIntegrationReceipt,{method:'POST',body:JSON.stringify(input),headers:{'Idempotency-Key':key}}),
    integrationResult: (key:string,signal?:AbortSignal)=>request<IntegrationResult>(`/integrations/requests/${encodeURIComponent(key)}`,(v):v is IntegrationResult=>isIntegrationResult(v)&&v.key===key,{signal}),
    resolveIntegration: (key:string,operation:IntegrationOperation)=>request<IntegrationResolution>(`/integrations/requests/${encodeURIComponent(key)}/resolve`,(v):v is IntegrationResolution=>isIntegrationResolution(v)&&v.key===key&&v.operation===operation,{method:'POST',body:JSON.stringify({operation})}),
    managedAccounts: (params:URLSearchParams,signal?:AbortSignal)=>request<ManagedAccountsPage>(`/accounts?${params}`,isManagedAccountsPage,{signal}),
    managedAccount: (id:string,signal?:AbortSignal)=>request<ManagedAccount>(`/accounts/${encodeURIComponent(id)}`,(v):v is ManagedAccount=>isManagedAccount(v)&&String(v.id)===id,{signal}),
    managedAccountOptions: (signal?:AbortSignal)=>request<ManagedAccountOptions>('/accounts/options',isManagedAccountOptions,{signal}),
    saveManagedAccount: (id:string|null,input:ManagedAccountInput,key:string)=>request<ManagedAccountWriteResult>(`/accounts${id?`/${encodeURIComponent(id)}`:''}`,isManagedAccountWriteResult,{method:id?'PATCH':'POST',body:JSON.stringify(input),headers:{'Idempotency-Key':key}}),
    deleteManagedAccount: (id:string,revision:string,key:string)=>request<ManagedAccountWriteResult>(`/accounts/${encodeURIComponent(id)}`,isManagedAccountWriteResult,{method:'DELETE',body:JSON.stringify({revision}),headers:{'Idempotency-Key':key}}),
    managedAccountResult: (key:string,signal?:AbortSignal)=>request<ManagedAccountResult>(`/accounts/requests/${encodeURIComponent(key)}`,(v):v is ManagedAccountResult=>isManagedAccountResult(v)&&v.key===key,{signal}),
    revealManagedPassword: (id:string,key:string)=>request<ManagedPasswordResult>(`/accounts/${encodeURIComponent(id)}/password`,isManagedPasswordResult,{method:'POST',body:JSON.stringify({action:'reveal'}),headers:{'Idempotency-Key':key}}),
    changeOwnPassword: (input:{current:string;password:string;confirmation:string},key:string)=>request<MobileWriteReceipt>('/session/password',isWriteReceipt,{method:'POST',body:JSON.stringify(input),headers:{'Idempotency-Key':key}}),
    contractTypes: (signal?:AbortSignal)=>request<ContractType[]>('/contract-types',isContractTypes,{signal}),
    saveContractType: (editing:boolean,input:ContractTypeInput|{id:string;revision:string;label:string;active:boolean},key:string)=>request<MobileContractTypeReceipt>('/contract-types',isContractTypeReceipt,{method:editing?'PATCH':'POST',body:JSON.stringify(input),headers:{'Idempotency-Key':key}}),
    contractTypeResult: (key:string,signal?:AbortSignal)=>request<MobileContractTypeResult>(`/contract-types/requests/${encodeURIComponent(key)}`,(v):v is MobileContractTypeResult=>isContractTypeResult(v)&&v.key===key,{signal}),
    resolveContractType: (key:string,operation:ContractTypeOperation)=>request<MobileContractTypeResolution>(`/contract-types/requests/${encodeURIComponent(key)}/resolve`,(v):v is MobileContractTypeResolution=>isContractTypeResolution(v)&&v.key===key&&v.operation===operation,{method:'POST',body:JSON.stringify({operation})}),
    resolveWrite: (key: string, operation: string) =>
      request<MobileWriteResolution>(
        `/write-requests/${encodeURIComponent(key)}/resolve`,
        (value): value is MobileWriteResolution => {
          if (!value || typeof value !== "object") return false;
          const result = value as MobileWriteResolution;
          const target = /:(\d+)$/.exec(operation)?.[1];
          return result.key === key && result.operation === operation && (
            (result.status === "cancelled" && result.receipt === null) ||
            (result.status === "committed" && isWriteReceipt(result.receipt) && result.receipt.replayed === true && (!target || Number(target) === result.receipt.id))
          );
        },
        { method: "POST", body: JSON.stringify({ operation }) },
      ),
    onSessionExpired(handler: () => void) {
      onExpired = handler;
      return () => {
        if (onExpired === handler) onExpired = undefined;
      };
    },
    login: (
      email: string,
      password: string,
      platform: "ios" | "android",
      deviceName: string,
    ) =>
      request<MobileSession>("/session", isLogin, {
        method: "POST",
        body: JSON.stringify({ email, password, platform, deviceName, sessionVersion: 2 }),
      }),
    refreshSession: (refreshToken: string, rotationId: string) => request<MobileSession>('/session/refresh', isRefreshSession, { method: 'POST', body: JSON.stringify({ refreshToken, rotationId }) }),
    session: () =>
      request<{ user: MobileUser; expiresAt: string }>("/session", isSession),
    logout: () =>
      request<{ success: true }>("/session", isLogout, { method: "DELETE" }),
    notifications: (signal?: AbortSignal) => request('/notifications', isMobileNotifications, {signal}),
    notificationActivity: (before: number|null, signal?: AbortSignal) => request(`/notifications/activity${before===null?'':`?before=${before}`}`, isMobileActivityPage, {signal}),
    notificationList: (kind: MobileNotificationKind, page: number, signal?: AbortSignal) => request(`/notifications/groups/${kind}?page=${page}`, isMobileNotificationList, {signal}),
    pushStatus: () => request('/notifications/device', isMobilePushStatus),
    enablePush: (token: string) => request('/notifications/device', isMobilePushStatus, {method: 'POST', body: JSON.stringify({token,activity:true})}),
    disablePush: () => request('/notifications/device', isMobilePushStatus, {method: 'DELETE'}),
    testPush: () => request('/notifications/test',isMobilePushTest,{method:'POST',body:'{}'}),
    workspace: (signal?: AbortSignal) =>
      request<MobileWorkspace>("/workspace", isWorkspace, { signal }),
    customer: (id: string, signal?: AbortSignal) =>
      request<MobileCustomerProfile>(
        `/customers/${encodeURIComponent(id)}`,
        (value): value is MobileCustomerProfile => isCustomerProfile(value) && String(value.id) === id,
        { signal },
      ),
    saveCustomer: (
      id: string | null,
      body: MobileCustomerInput & { revision?: string },
      key: string,
    ) =>
      request<MobileWriteReceipt>(
        id === null ? "/customers" : `/customers/${encodeURIComponent(id)}`,
        (value): value is MobileWriteReceipt => isWriteReceipt(value) && (id === null || String(value.id) === id),
        {
          method: id === null ? "POST" : "PATCH",
          body: JSON.stringify(body),
          headers: { "Idempotency-Key": key },
        },
      ),
    customerReceipt: (key: string) =>
      request<{ receipt: MobileWriteReceipt | null }>(
        `/customers/requests/${encodeURIComponent(key)}`,
        isReceiptLookup,
      ),
    customerMatches: (input: MobileCustomerMatchQuery, signal?: AbortSignal) =>
      request<MobileCustomerMatches>("/customers/matches", (value): value is MobileCustomerMatches => isMobileCustomerMatches(value, input),
        { method: "POST", body: JSON.stringify(input), signal }),
    customerOcr:(kind:CustomerOcrKind,body:ArrayBuffer|FormData,requestId:string,expectedIdentity='',signal?:AbortSignal)=>
      request<MobileCustomerOcr>('/customers/documents/ocr',
        (value):value is MobileCustomerOcr=>isMobileCustomerOcr(value,requestId,kind,expectedIdentity),
        {method:'POST',body,signal,headers:{'X-Photo-Kind':kind,'X-Ocr-Request':requestId,'X-Expected-Identity':expectedIdentity,
          ...(body instanceof FormData?{}:{'Content-Type':'image/jpeg'})}},45000),
    draftOptions: (signal?: AbortSignal) =>
      request<MobileDraftOptions>("/drafts/options", isMobileDraftOptions, {
        signal,
      }),
    returnCorrectionOptions: (id: string, page = 1, signal?: AbortSignal) => request<MobileReturnCorrectionOptions>(`/contracts/${encodeURIComponent(id)}/return-corrections?page=${page}`, (v): v is MobileReturnCorrectionOptions => isMobileReturnCorrectionOptions(v) && String(v.id) === id && v.page === Math.min(page, v.pages), { signal }),
    returnCorrection: (id: string, itemId: string, signal?: AbortSignal) => request<MobileReturnCorrectionProfile>(`/contracts/${encodeURIComponent(id)}/return-corrections/${encodeURIComponent(itemId)}`, (v): v is MobileReturnCorrectionProfile => isMobileReturnCorrectionProfile(v) && String(v.id) === id && String(v.anchorItemId) === itemId, { signal }),
    saveReturnCorrection: (id: string, input: MobileReturnCorrectionInput, key: string) => request<MobileReturnCorrectionResult>(`/contracts/${encodeURIComponent(id)}/return-corrections`, (v): v is MobileReturnCorrectionResult => isMobileReturnCorrectionResult(v) && v.key === key && String(v.receipt.id) === id, { method: 'PATCH', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input) }),
    returnCorrectionResult: (key: string, signal?: AbortSignal) => request<{ result: MobileReturnCorrectionResult | null }>(`/return-corrections/requests/${encodeURIComponent(key)}`, (v): v is { result: MobileReturnCorrectionResult | null } => {
      if (!v || typeof v !== 'object' || !('result' in v)) return false;
      return v.result === null || isMobileReturnCorrectionResult(v.result) && v.result.key === key;
    }, { signal }),
    contractLifecycle: (id: string, signal?: AbortSignal) => request<MobileLifecycleContext>(`/contracts/${encodeURIComponent(id)}/lifecycle`, (v): v is MobileLifecycleContext => isMobileLifecycleContext(v) && String(v.id) === id, { signal }),
    lifecyclePreview: (id: string, input: { at: string; resume_end?: string }, signal?: AbortSignal) => request<MobileLifecyclePreview>(`/contracts/${encodeURIComponent(id)}/lifecycle/preview`, (v): v is MobileLifecyclePreview => isMobileLifecyclePreview(v) && String(v.id) === id && v.at === input.at && (!input.resume_end || v.end === input.resume_end), { method: 'POST', body: JSON.stringify(input), signal }),
    lifecycleInventory: (id: string, query: string, signal?: AbortSignal) => request<MobileLifecycleInventory>(`/contracts/${encodeURIComponent(id)}/lifecycle/inventory?${query}`, isMobileLifecycleInventory, { signal }),
    saveContractLifecycle: (id: string, input: MobileLifecycleInput, key: string) => request<MobileLifecycleResult>(`/contracts/${encodeURIComponent(id)}/lifecycle`, (v): v is MobileLifecycleResult => isMobileLifecycleResult(v) && v.key === key && v.operation === `lifecycle.${input.action}:${id}`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input) }),
    lifecycleResult: (key: string, signal?: AbortSignal) => request<{ result: MobileLifecycleResult | null }>(`/contract-lifecycle/requests/${encodeURIComponent(key)}`, (v): v is { result: MobileLifecycleResult | null } => {
      if (!v || typeof v !== 'object' || !('result' in v)) return false;
      return v.result === null || isMobileLifecycleResult(v.result) && v.result.key === key;
    }, { signal }),
    receiptCorrections: (id: string, signal?: AbortSignal) => request<MobileReceiptCorrections>(`/contracts/${encodeURIComponent(id)}/receipt-corrections`, (v): v is MobileReceiptCorrections => isMobileReceiptCorrections(v) && String(v.id) === id, { signal }),
    renewalCorrections: (id: string, signal?: AbortSignal) => request<MobileRenewalCorrections>(`/contracts/${encodeURIComponent(id)}/renewal-corrections`, (v): v is MobileRenewalCorrections => isMobileRenewalCorrections(v) && String(v.id) === id, { signal }),
    saveContractCorrection: (id: string, kind: MobileCorrectionKind, input: MobileReceiptCorrectionInput | MobileRenewalCorrectionInput, key: string) => request<MobileContractCorrectionResult>(`/contracts/${encodeURIComponent(id)}/${kind === 'receipts' ? 'receipt' : 'renewal'}-corrections`, (v): v is MobileContractCorrectionResult => isMobileContractCorrectionResult(v) && v.key === key && v.operation === `correction.${kind}:${id}`, { method: 'PATCH', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input) }),
    contractCorrectionResult: (kind: MobileCorrectionKind, key: string, signal?: AbortSignal) => request<{ result: MobileContractCorrectionResult | null }>(`/contract-corrections/${kind}/requests/${encodeURIComponent(key)}`, (v): v is { result: MobileContractCorrectionResult | null } => {
      if (!v || typeof v !== 'object' || !('result' in v)) return false;
      return v.result === null || isMobileContractCorrectionResult(v.result) && v.result.key === key && v.result.operation.startsWith(`correction.${kind}:`);
    }, { signal }),
    contractEdit: (id: string, signal?: AbortSignal) => request<MobileContractEditProfile>(`/contracts/${encodeURIComponent(id)}/edit`, (v): v is MobileContractEditProfile => isMobileContractEditProfile(v) && String(v.id) === id, { signal }),
    saveContractEdit: (id: string, input: MobileContractEditInput, key: string) => request<MobileContractEditResult>(`/contracts/${encodeURIComponent(id)}/edit`, (v): v is MobileContractEditResult => isMobileContractEditResult(v) && v.key === key && String(v.receipt.id) === id, { method: 'PATCH', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input) }),
    catalogueExportColumns: (kind: MobileCatalogueExportKind, filters: string, signal?: AbortSignal) => request<MobileExportColumns>(`/exports/${kind}/columns?${filters}`, (v): v is MobileExportColumns => isMobileExportColumns(v) && v.kind === kind, { signal }),
    storeMatchTemplate: (signal?: AbortSignal) => request<MobileFileExport>('/imports/customer-stores/template', isMobileFileExport, { signal }, 60000),
    vehicleImportOptions: (signal?: AbortSignal) => request<MobileVehicleImportOptions>('/imports/vehicles/options', isMobileVehicleImportOptions, { signal }),
    vehicleImportTemplate: (input?: MobileVehicleImportInput, signal?: AbortSignal) => request<MobileFileExport>(input ? '/imports/vehicles/normalized' : '/imports/vehicles/template', isMobileFileExport, input ? { method: 'POST', body: JSON.stringify(input), signal } : { signal }, 60000),
    vehicleWorkbook: (name: string, bytes: ArrayBuffer, signal?: AbortSignal) => request<MobileVehicleWorkbook>('/imports/vehicles/file', isMobileVehicleWorkbook, { method: 'POST', body: bytes, headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(name) }, signal }, 90000),
    previewVehicleImport: (input: MobileVehicleImportInput, signal?: AbortSignal) => request<VehicleImportResult>('/imports/vehicles/preview', isMobileVehicleImportPreview, { method: 'POST', body: JSON.stringify(input), signal }, 45000),
    saveVehicleImport: (batch: string, input: MobileVehicleImportInput, key: string) => request<MobileVehicleImportReceipt>(`/imports/vehicles/${batch}`, (v): v is MobileVehicleImportReceipt => isMobileVehicleImportReceipt(v) && v.key === key && v.batchId === batch && v.mode === input.mode, { method: 'POST', body: JSON.stringify(input), headers: { 'Idempotency-Key': key } }, 60000),
    vehicleReset: (signal?: AbortSignal) => request<VehicleResetPreview>('/imports/vehicles/reset', isMobileVehicleResetPreview, { signal }),
    resetVehicles: (batch: string, input: { revision: string; confirmation: string }, key: string) => request<MobileVehicleImportReceipt>(`/imports/vehicles/reset/${batch}`, (v): v is MobileVehicleImportReceipt => isMobileVehicleImportReceipt(v) && v.key === key && v.batchId === batch && v.mode === 'reset', { method: 'DELETE', body: JSON.stringify(input), headers: { 'Idempotency-Key': key } }, 60000),
    vehicleImportResult: (key: string, signal?: AbortSignal) => request<{ receipt: MobileVehicleImportReceipt | null }>(`/imports/vehicles/requests/${key}`, (v): v is { receipt: MobileVehicleImportReceipt | null } => !!v && typeof v === 'object' && 'receipt' in v && (v.receipt === null || isMobileVehicleImportReceipt(v.receipt) && v.receipt.key === key), { signal }),
    resolveVehicleImport: (key: string, operation: string) => request<MobileVehicleImportResolution>(`/imports/vehicles/requests/${key}/resolve`, (v): v is MobileVehicleImportResolution => isMobileVehicleImportResolution(v) && v.key === key && v.operation === operation, { method: 'POST', body: JSON.stringify({ operation }) }),
    vehicleImportBackup: (id: string, signal?: AbortSignal) => request<MobileFileExport>(`/imports/vehicles/backups/${id}`, isMobileFileExport, { signal }, 70000),
    storeMatchFile: async (name: string, bytes: ArrayBuffer, onPart: (part: MobileStoreMatchFilePage) => void, signal: AbortSignal) => readStoreMatchStream(origin, access ? await access.token() : token, name, bytes, onPart, signal, onExpired),
    previewStoreMatch: (rows: CustomerStoreInput[], signal?: AbortSignal) => request<CustomerStoreResult>('/imports/customer-stores/preview', isMobileStoreMatchResult, { method: 'POST', body: JSON.stringify({ rows }), signal }, 45000),
    saveStoreMatch: (batch: string, input: MobileStoreMatchInput, key: string) => request<MobileImportReceipt>(`/imports/customer-stores/${batch}`, (v): v is MobileImportReceipt => isMobileImportReceipt(v) && v.kind === 'customer_stores' && v.batchId === batch && v.key === key, { method: 'POST', body: JSON.stringify(input), headers: { 'Idempotency-Key': key } }, 45000),
    catalogueExport: (kind: MobileCatalogueExportKind, filters: string, columns: string[], signal?: AbortSignal) => { const query = new URLSearchParams(filters); query.set('columns', columns.join(',')); return request<MobileFileExport>(`/exports/${kind}?${query}`, isMobileFileExport, { signal, headers: { Accept: `${WORKBOOK_MIME}, application/json` } }, 70000); },
    catalogueExcel: (kind:MobileCatalogueExportKind,filters:string,columns:string[],signal?:AbortSignal)=>{const query=new URLSearchParams(filters);query.set('columns',columns.join(','));query.set('format','xlsx');return request<MobileFileExport>(`/exports/${kind}?${query}`,isMobileFileExport,{signal,headers:{Accept:`${WORKBOOK_MIME}, application/json`}},70000);},
    listExcel:(kind:MobileListExportKind,filters:string,signal?:AbortSignal)=>request<MobileWorkbookExport>(`/list-exports/${kind}?${filters}`,(v):v is MobileWorkbookExport=>isMobileFileExport(v)&&v.mimeType==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',{signal,headers:{Accept:`${WORKBOOK_MIME}, application/json`}},70000),
    customerImportTemplate: (signal?: AbortSignal) => request<MobileFileExport>('/imports/customers/template', isMobileFileExport, { signal }, 60000),
    previewCustomerFile: (name: string, bytes: ArrayBuffer, allowIncomplete: boolean, signal?: AbortSignal) => request<MobileCustomerImportPreview>('/imports/customers/preview', isMobileCustomerImportPreview, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(name), 'X-Allow-Incomplete': allowIncomplete ? '1' : '0' }, body: bytes, signal }, 90000),
    previewCustomerImport: (preview: MobileCustomerImportPreview, allowIncomplete: boolean, signal?: AbortSignal) => request<MobileCustomerImportPreview>('/imports/customers/preview', (v): v is MobileCustomerImportPreview => isMobileCustomerImportPreview(v) && v.batchId === preview.batchId, { method: 'POST', body: JSON.stringify({ batchId: preview.batchId, filename: preview.filename, sha256: preview.sha256, rows: preview.sourceRows, allowIncomplete }), signal }, 60000),
    importCustomers: (batch: string, input: MobileCustomerImportInput, key: string) => request<MobileImportReceipt>(`/imports/customers/${encodeURIComponent(batch)}`, (v): v is MobileImportReceipt => isMobileImportReceipt(v) && v.kind === 'customers' && v.key === key && v.batchId === batch, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input) }, 45000),
    importResult: (key: string, signal?: AbortSignal) => request<{ receipt: MobileImportReceipt | null }>(`/imports/requests/${encodeURIComponent(key)}`, (v): v is { receipt: MobileImportReceipt | null } => !!v && typeof v === 'object' && 'receipt' in v && (v.receipt === null || isMobileImportReceipt(v.receipt) && v.receipt.key === key), { signal }),
    contractQr: (id: string, params: URLSearchParams, signal?: AbortSignal) => request<MobileContractQr>(`/contracts/${encodeURIComponent(id)}/payment-qr?${params}`, (v): v is MobileContractQr => isMobileContractQr(v) && String(v.id) === id, { signal }),
    printDocument: (kind: MobilePrintKind, id: string, version: string, includeQr: boolean, signal?: AbortSignal) => request<MobilePrintDocument>(`/${kind}/${encodeURIComponent(id)}/print${kind === 'contracts' ? `?${new URLSearchParams({ ...(version ? { version } : {}), qr: includeQr ? '1' : '0' })}` : ''}`, (v): v is MobilePrintDocument => isMobilePrintDocument(v) && String(v.id) === id && v.version === version, { signal }),
    draftDeleteReview: (id: string, signal?: AbortSignal) => request<MobileDraftDeleteReview>(`/drafts/${encodeURIComponent(id)}/delete`, (v): v is MobileDraftDeleteReview => isMobileDraftDeleteReview(v) && String(v.id) === id, { signal }),
    deleteDraft: (id: string, input: MobileDraftDeleteInput, key: string) => request<MobileDraftDeleteResult>(`/drafts/${encodeURIComponent(id)}/delete`, (v): v is MobileDraftDeleteResult => isMobileDraftDeleteResult(v) && v.key === key && v.operation === `draft.delete:${id}`, { method: 'DELETE', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input) }),
    draftDeleteResult: (key: string, signal?: AbortSignal) => request<{ result: MobileDraftDeleteResult | null }>(`/draft-deletions/requests/${encodeURIComponent(key)}`, (v): v is { result: MobileDraftDeleteResult | null } => !!v && typeof v === 'object' && 'result' in v && (v.result === null || isMobileDraftDeleteResult(v.result) && v.result.key === key), { signal }),
    ownershipTerms: (id: string, signal?: AbortSignal) => request<MobileOwnershipTerms>(`/contracts/${encodeURIComponent(id)}/ownership-terms`, (v): v is MobileOwnershipTerms => isMobileOwnershipTerms(v) && String(v.id) === id, { signal }),
    saveOwnershipTerms: (id: string, input: MobileOwnershipTermsInput, key: string) => request<MobileOwnershipTermsResult>(`/contracts/${encodeURIComponent(id)}/ownership-terms`, (v): v is MobileOwnershipTermsResult => isMobileOwnershipTermsResult(v) && v.key === key && v.operation === `contract.ownership_terms:${id}`, { method: 'PATCH', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input) }),
    ownershipTermsResult: (key: string, signal?: AbortSignal) => request<{ result: MobileOwnershipTermsResult | null }>(`/ownership-terms/requests/${encodeURIComponent(key)}`, (v): v is { result: MobileOwnershipTermsResult | null } => !!v && typeof v === 'object' && 'result' in v && (v.result === null || isMobileOwnershipTermsResult(v.result) && v.result.key === key), { signal }),
    rentalTerms: (id: string, signal?: AbortSignal) => request<MobileRentalTerms>(`/contracts/${encodeURIComponent(id)}/rental-terms`, (v): v is MobileRentalTerms => isMobileRentalTerms(v) && String(v.id) === id, { signal }),
    saveRentalTerms: (id: string, input: MobileRentalTermsInput, key: string) => request<MobileRentalTermsResult>(`/contracts/${encodeURIComponent(id)}/rental-terms`, (v): v is MobileRentalTermsResult => isMobileRentalTermsResult(v) && v.key === key && v.operation === `contract.terms:${id}`, { method: 'PATCH', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input) }),
    rentalTermsResult: (key: string, signal?: AbortSignal) => request<{ result: MobileRentalTermsResult | null }>(`/rental-terms/requests/${encodeURIComponent(key)}`, (v): v is { result: MobileRentalTermsResult | null } => !!v && typeof v === 'object' && 'result' in v && (v.result === null || isMobileRentalTermsResult(v.result) && v.result.key === key), { signal }),
    contractHistory: (id: string, params: URLSearchParams, signal?: AbortSignal) => request<MobileContractHistory>(`/contracts/${encodeURIComponent(id)}/history?${params}`, (v): v is MobileContractHistory => isMobileContractHistory(v) && String(v.id) === id, { signal }),
    contractEditResult: (key: string, signal?: AbortSignal) => request<{ result: MobileContractEditResult | null }>(`/contract-edits/requests/${encodeURIComponent(key)}`, (v): v is { result: MobileContractEditResult | null } => {
      if (!v || typeof v !== 'object' || !('result' in v)) return false;
      return v.result === null || isMobileContractEditResult(v.result) && v.result.key === key;
    }, { signal }),
    contractApproval: (id: string, signal?: AbortSignal) => request<MobileContractApprovalContext>(`/contracts/${encodeURIComponent(id)}/approval`, (v): v is MobileContractApprovalContext => isMobileContractApprovalContext(v) && String(v.id) === id, { signal }),
    approveContract: (id: string, revision: string, key: string) => request<MobileContractApprovalResult>(`/contracts/${encodeURIComponent(id)}/approval`, (v): v is MobileContractApprovalResult => isMobileContractApprovalResult(v) && v.key === key && String(v.receipt.id) === id, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ revision }) }),
    contractApprovalResult: (key: string, signal?: AbortSignal) => request<{ result: MobileContractApprovalResult | null }>(`/contract-approvals/requests/${encodeURIComponent(key)}`, (v): v is { result: MobileContractApprovalResult | null } => {
      if (!v || typeof v !== 'object' || !('result' in v)) return false;
      return v.result === null || isMobileContractApprovalResult(v.result) && v.result.key === key;
    }, { signal }),
    contractPreparation: (id: string, signal?: AbortSignal) =>
      request<MobileContractPreparation>(
        `/contracts/${encodeURIComponent(id)}/preparation`,
        (v): v is MobileContractPreparation =>
          isMobileContractPreparation(v) && String(v.id) === id,
        { signal },
      ),
    contractAction: (
      id: string,
      action: MobileContractAction,
      input: MobileContractIssueInput | { revision: string },
      key: string,
    ) =>
      request<MobileWriteReceipt>(
        `/contracts/${encodeURIComponent(id)}/${action}`,
        (value): value is MobileWriteReceipt =>
          isWriteReceipt(value) && value.id === Number(id),
        {
          method: "POST",
          body: JSON.stringify(input),
          headers: { "Idempotency-Key": key },
        },
      ),
    mediaTargets:(entity:MobileMediaEntity,id:string,page=1,signal?:AbortSignal)=>request<MobileMediaTargets>(`/record-media/${entity}/${encodeURIComponent(id)}?page=${page}`,
      (value):value is MobileMediaTargets=>isMobileMediaTargets(value)&&value.entity===entity&&String(value.id)===id&&value.page===page,{signal}),
    mediaHistoryTargets:(id:string,page=1,signal?:AbortSignal)=>request<MobileMediaTargets>(`/record-media/contracts/${encodeURIComponent(id)}/history?page=${page}`,
      (v):v is MobileMediaTargets=>isMobileMediaTargets(v)&&v.entity==='contracts'&&String(v.id)===id&&v.page===page,{signal}),
    recordMedia:async(target:MobileMediaIdentity,page=1,signal?:AbortSignal)=>{
      if(!isMobileMediaIdentity(target)||!Number.isInteger(page)||page<1||page>10000)throw new ApiError('Hồ sơ hoặc trang media không hợp lệ.',400,'INVALID_MEDIA_TARGET');
      return request<MobileRecordMedia>(`/record-media/${target.entity}/${target.id}/${target.kind}/${target.referenceId}?page=${page}`,
        (value):value is MobileRecordMedia=>isMobileRecordMedia(value)&&matchesMobileMediaTarget(value.target,target)&&value.page===page,{signal});
    },
    recordMediaImageSource:(target:MobileMediaIdentity,photo:MobileMediaPhoto)=>{
      if(!isMobileMediaIdentity(target)||!isMobileMediaPhoto(photo,target)||!photo.readable||photo.kind!=='image')throw new ApiError('Ảnh không thuộc hồ sơ hoặc chưa hỗ trợ xem.',400,'INVALID_MEDIA_TARGET');
      return{uri:`${origin}/api/mobile/v1/record-media/${target.entity}/${target.id}/${target.kind}/${target.referenceId}/${encodeURIComponent(photo.slot)}?revision=${encodeURIComponent(photo.revision)}`,
        headers:authorization()};
    },
    vehicleThumbnailSource: (id: number, revision: string) => {
      if (!Number.isSafeInteger(id) || id < 1 || !/^[1-9]\d{0,19}$/.test(revision)) throw new ApiError('Ảnh xe không hợp lệ.',400,'INVALID_MEDIA_TARGET');
      return { uri: `${origin}/api/mobile/v1/vehicles/${id}/thumbnail?revision=${encodeURIComponent(revision)}`, headers: authorization() };
    },
    deleteRecordMedia:(info:MobileMediaSlotInfo,key:string)=>request<MobileMediaDeleteReceipt>(`/record-media/${info.target.entity}/${info.target.id}/${info.target.kind}/${info.target.referenceId}/${encodeURIComponent(info.slot)}`,
      (value):value is MobileMediaDeleteReceipt=>isMediaDeleteReceipt(value)&&value.requestId===key&&matchesMobileMediaTarget(value.target,info.target)&&value.target.revision===info.target.revision&&
        value.target.referenceRevision===info.target.referenceRevision&&value.target.snapshot===info.target.snapshot&&value.photo.slot===info.slot&&value.photo.revision===info.photo?.revision&&
        value.photo.mimeType===info.photo.mimeType&&value.photo.bytes===info.photo.bytes&&value.photo.updatedAt===info.photo.updatedAt,
      {method:'DELETE',body:'{}',headers:{'Idempotency-Key':key,'X-Record-Revision':info.target.revision,'X-Reference-Revision':info.target.referenceRevision,'X-Media-Snapshot':info.target.snapshot??'','X-Photo-Revision':info.photo?.revision??'0'}}),
    mediaDeleteReceipt:(entity:MobileMediaEntity,id:number,key:string)=>request<{receipt:MobileMediaDeleteReceipt|null}>(`/record-media/deletions/${entity}/${id}/${encodeURIComponent(key)}`,
      (value):value is {receipt:MobileMediaDeleteReceipt|null}=>!!value&&typeof value==='object'&&'receipt' in value&&(value.receipt===null||isMediaDeleteReceipt(value.receipt)&&value.receipt.requestId===key&&value.receipt.id===id&&value.receipt.target.entity===entity)),
    customerPhotoCopyReview:(id:number,signal?:AbortSignal)=>request<MobileCustomerPhotoCopyReview>(`/record-media/contracts/${id}/copy-customer`,
      (value):value is MobileCustomerPhotoCopyReview=>isCustomerPhotoCopyReview(value)&&value.id===id,{signal}),
    copyCustomerPhotos:(review:MobileCustomerPhotoCopyReview,key:string)=>request<MobileCustomerPhotoCopyReceipt>(`/record-media/contracts/${review.id}/copy-customer`,
      (value):value is MobileCustomerPhotoCopyReceipt=>isCustomerPhotoCopyReceipt(value)&&value.id===review.id&&value.requestId===key&&value.revision===review.revision&&
        value.customerId===review.customerId&&value.sourceCount===review.sourceCount&&value.presentCount===review.presentCount&&value.copied===review.missingCount,
      {method:'POST',body:'{}',headers:{'Idempotency-Key':key,'X-Record-Revision':review.revision,'X-Customer-Photo-Snapshot':review.snapshot}}),
    customerPhotoCopyReceipt:(id:number,key:string)=>request<{receipt:MobileCustomerPhotoCopyReceipt|null}>(`/record-media/contracts/${id}/copy-customer/${encodeURIComponent(key)}`,
      (value):value is {receipt:MobileCustomerPhotoCopyReceipt|null}=>!!value&&typeof value==='object'&&'receipt' in value&&(value.receipt===null||isCustomerPhotoCopyReceipt(value.receipt)&&value.receipt.id===id&&value.receipt.requestId===key)),
    mediaSlotInfo:(target:MobileMediaIdentity,slot:string,signal?:AbortSignal)=>request<MobileMediaSlotInfo>(`/record-media/${target.entity}/${target.id}/${target.kind}/${target.referenceId}/${encodeURIComponent(slot)}`,
      (value):value is MobileMediaSlotInfo=>isMobileMediaSlotInfo(value)&&matchesMobileMediaTarget(value.target,target)&&value.slot===slot,{signal}),
    uploadRecordMedia:(target:MobileMediaTarget,slot:string,expectedPhotoRevision:string|null,bytes:ArrayBuffer,key:string)=>
      request<MobileMediaReceipt>(`/record-media/${target.entity}/${target.id}/${target.kind}/${target.referenceId}/${encodeURIComponent(slot)}`,
        (value):value is MobileMediaReceipt=>isMobileMediaReceipt(value)&&value.requestId===key&&matchesMobileMediaTarget(value.target,target)&&value.slot===slot&&
          value.target.revision===target.revision&&value.target.referenceRevision===target.referenceRevision&&value.target.snapshot===target.snapshot&&value.bytes===bytes.byteLength,
        {method:'PUT',body:bytes,headers:{'Content-Type':'image/jpeg','Idempotency-Key':key,'X-Record-Revision':target.revision,'X-Reference-Revision':target.referenceRevision,'X-Photo-Revision':expectedPhotoRevision??'0','X-Media-Snapshot':target.snapshot??''}}),
    recordVideoSource:(target:MobileMediaIdentity,photo:MobileMediaPhoto)=>{
      if(!isMobileMediaIdentity(target)||!isMobileMediaPhoto(photo,target)||!photo.readable||photo.kind!=='video')throw new ApiError('Video không thuộc hồ sơ hoặc chưa hỗ trợ xem.',400,'INVALID_MEDIA_TARGET');
      return{uri:`${origin}/api/mobile/v1/record-media/${target.entity}/${target.id}/${target.kind}/${target.referenceId}/${encodeURIComponent(photo.slot)}/video?revision=${encodeURIComponent(photo.revision)}`,headers:authorization(),useCaching:false};
    },
    signRecordVideo:(info:MobileMediaSlotInfo,key:string)=>request<MobileVideoUploadSignature>(`/record-media/${info.target.entity}/${info.target.id}/${info.target.kind}/${info.target.referenceId}/${encodeURIComponent(info.slot)}/video/sign`,
      (v):v is MobileVideoUploadSignature=>isMobileVideoSignature(v)&&String(v.params.public_id).endsWith('/'+key),
      {method:'POST',body:JSON.stringify({uploadId:key}),headers:{'Idempotency-Key':key,'X-Record-Revision':info.target.revision,'X-Reference-Revision':info.target.referenceRevision,'X-Photo-Revision':info.photo?.revision??'0','X-Media-Snapshot':info.target.snapshot??''}}),
    videoUploadConfig:(info:MobileMediaSlotInfo,key:string,signal?:AbortSignal)=>request<{direct:boolean}>(`/record-media/${info.target.entity}/${info.target.id}/${info.target.kind}/${info.target.referenceId}/${encodeURIComponent(info.slot)}/video/direct`,isMobileVideoUploadConfig,{method:'POST',body:JSON.stringify({action:'config',uploadId:key}),headers:videoReviewHeaders(info,key),signal}),
    signDirectVideo:(info:MobileMediaSlotInfo,key:string,actor:number,bytes:number,sha256:string,signal?:AbortSignal)=>request<MobileVideoDirectResult>(`/record-media/${info.target.entity}/${info.target.id}/${info.target.kind}/${info.target.referenceId}/${encodeURIComponent(info.slot)}/video/direct`,
      (v):v is MobileVideoDirectResult=>isMobileVideoDirectResult(v,actor,key,sha256),{method:'POST',body:JSON.stringify({action:'sign',uploadId:key,bytes,sha256}),headers:videoReviewHeaders(info,key),signal}),
    verifyDirectVideo:(info:MobileMediaSlotInfo,key:string,ticket:string,signal?:AbortSignal)=>request<{receipt:MobileVideoBrowserReceipt}>(`/record-media/${info.target.entity}/${info.target.id}/${info.target.kind}/${info.target.referenceId}/${encodeURIComponent(info.slot)}/video/direct`,
      (v):v is {receipt:MobileVideoBrowserReceipt}=>!!v&&typeof v==='object'&&'receipt'in v&&isMobileVideoBrowserReceipt(v.receipt)&&v.receipt.upload_id===key,{method:'POST',body:JSON.stringify({action:'verify',uploadId:key,ticket}),headers:videoReviewHeaders(info,key),signal},150000),
    saveRecordVideo:(info:MobileMediaSlotInfo,cloud:MobileVideoCloudReceipt|MobileVideoBrowserReceipt,key:string)=>request<MobileVideoReceipt>(`/record-media/${info.target.entity}/${info.target.id}/${info.target.kind}/${info.target.referenceId}/${encodeURIComponent(info.slot)}/video`,
      (v):v is MobileVideoReceipt=>isMobileVideoReceipt(v)&&v.requestId===key&&matchesMobileMediaTarget(v.target,info.target)&&v.slot===info.slot&&v.target.revision===info.target.revision&&v.target.referenceRevision===info.target.referenceRevision&&v.target.snapshot===info.target.snapshot,
      {method:'PUT',body:JSON.stringify(cloud),headers:{'Idempotency-Key':key,'X-Record-Revision':info.target.revision,'X-Reference-Revision':info.target.referenceRevision,'X-Photo-Revision':info.photo?.revision??'0','X-Media-Snapshot':info.target.snapshot??''}},180000),
    videoReceipt:(key:string,signal?:AbortSignal)=>request<{receipt:MobileVideoReceipt|null}>(`/record-videos/requests/${encodeURIComponent(key)}`,
      (v):v is {receipt:MobileVideoReceipt|null}=>!!v&&typeof v==='object'&&'receipt' in v&&(v.receipt===null||isMobileVideoReceipt(v.receipt)&&v.receipt.requestId===key),{signal}),
    mediaReceipt:(key:string)=>request<{receipt:MobileMediaReceipt|null}>(`/record-media/requests/${encodeURIComponent(key)}`,
      (value):value is {receipt:MobileMediaReceipt|null}=>!!value&&typeof value==='object'&&'receipt' in value&&(value.receipt===null||isMobileMediaReceipt(value.receipt)&&value.receipt.requestId===key)),
    vehicleStatusPreparation:(id:string,signal?:AbortSignal)=>request<MobileVehicleStatusPreparation>(`/vehicles/${encodeURIComponent(id)}/status`,
      (v):v is MobileVehicleStatusPreparation=>isMobileVehicleStatusPreparation(v)&&String(v.id)===id,{signal}),
    vehicleStatusPreview:(id:string,input:MobileVehicleStatusInput,signal?:AbortSignal)=>request<MobileVehicleStatusReview>(`/vehicles/${encodeURIComponent(id)}/status/preview`,
      (v):v is MobileVehicleStatusReview=>isMobileVehicleStatusReview(v)&&String(v.id)===id&&matchesVehicleStatusReview(v,input),{method:'POST',body:JSON.stringify(input),signal}),
    recordVehicleStatus:(id:string,input:MobileVehicleStatusInput&{review_snapshot:string},key:string)=>request<MobileVehicleStatusReceipt>(`/vehicles/${encodeURIComponent(id)}/status`,
      (v):v is MobileVehicleStatusReceipt=>isMobileVehicleStatusReceipt(v)&&String(v.id)===id&&v.requestId===key&&v.review.snapshot===input.review_snapshot&&matchesVehicleStatusReview(v.review,input),
      {method:'POST',body:JSON.stringify(input),headers:{'Idempotency-Key':key}}),
    vehicleStatusReceipt:(key:string,signal?:AbortSignal)=>request<{receipt:MobileVehicleStatusReceipt|null}>(`/vehicle-status/requests/${encodeURIComponent(key)}`,
      (v):v is {receipt:MobileVehicleStatusReceipt|null}=>!!v&&typeof v==='object'&&'receipt'in v&&(v.receipt===null||isMobileVehicleStatusReceipt(v.receipt)&&v.receipt.requestId===key),{signal}),
    vehicleTransferPreparation:(id:string,signal?:AbortSignal)=>
      request<MobileVehicleTransferPreparation>(`/vehicles/${encodeURIComponent(id)}/transfers`,
        (value):value is MobileVehicleTransferPreparation=>isMobileVehicleTransferPreparation(value)&&String(value.id)===id&&value.vehicle.ownerStoreId!==undefined,{signal}),
    transferDestinations:(id:string,revision:string,search='',page=1,signal?:AbortSignal)=>
      request<MobileTransferDestinations>(`/vehicles/${encodeURIComponent(id)}/transfers/destinations?${new URLSearchParams({revision,search:search.trim(),page:String(page)})}`,
        (value):value is MobileTransferDestinations=>isMobileTransferDestinations(value)&&String(value.id)===id&&value.revision===revision&&value.search===search.trim()&&value.page===page,{signal}),
    vehicleTransferPreview:(id:string,input:MobileVehicleTransferInput,signal?:AbortSignal)=>
      request<MobileVehicleTransferPreview>(`/vehicles/${encodeURIComponent(id)}/transfers/preview`,
        (value):value is MobileVehicleTransferPreview=>isMobileVehicleTransferPreview(value)&&String(value.id)===id&&value.after.ownerStoreId!==undefined&&matchesVehicleTransferPreview(value,input),
        {method:'POST',body:JSON.stringify(input),signal}),
    recordVehicleTransfer:(id:string,input:MobileVehicleTransferRecordInput,key:string)=>
      request<MobileVehicleTransferReceipt>(`/vehicles/${encodeURIComponent(id)}/transfers`,
        (value):value is MobileVehicleTransferReceipt=>isMobileVehicleTransferReceipt(value)&&String(value.id)===id&&value.requestId===key&&value.review.snapshot===input.review_snapshot&&matchesVehicleTransferPreview(value.review,input),
        {method:'POST',body:JSON.stringify(input),headers:{'Idempotency-Key':key}}),
    vehicleTransferReceipt:(key:string)=>
      request<{receipt:MobileVehicleTransferReceipt|null}>(`/vehicle-transfers/requests/${encodeURIComponent(key)}`,
        (value):value is {receipt:MobileVehicleTransferReceipt|null}=>!!value&&typeof value==='object'&&'receipt' in value&&
          (value.receipt===null||isMobileVehicleTransferReceipt(value.receipt)&&value.receipt.requestId===key)),
    swapPreparation:(id:string,page=1,signal?:AbortSignal)=>
      request<MobileSwapPreparation>(`/contracts/${encodeURIComponent(id)}/swaps?page=${page}`,
        (value):value is MobileSwapPreparation=>isMobileSwapPreparation(value)&&String(value.id)===id&&value.items.page===page,{signal}),
    swapCandidates:(id:string,revision:string,itemId:number,itemRevision:string,search='',page=1,signal?:AbortSignal)=>
      request<MobileSwapCandidates>(`/contracts/${encodeURIComponent(id)}/swaps/candidates?${new URLSearchParams({
        revision,item_id:String(itemId),item_revision:itemRevision,search:search.trim(),page:String(page)})}`,
        (value):value is MobileSwapCandidates=>isMobileSwapCandidates(value)&&String(value.id)===id&&value.revision===revision&&
          value.itemId===itemId&&value.itemRevision===itemRevision&&value.search===search.trim()&&value.page===page,{signal}),
    swapPreview:(id:string,input:MobileSwapInput,signal?:AbortSignal)=>
      request<MobileSwapPreview>(`/contracts/${encodeURIComponent(id)}/swaps/preview`,
        (value):value is MobileSwapPreview=>isMobileSwapPreview(value)&&String(value.id)===id&&matchesSwapPreview(value,input),
        {method:'POST',body:JSON.stringify(input),signal}),
    recordSwap:(id:string,input:MobileSwapInput,key:string)=>
      request<MobileSwapReceipt>(`/contracts/${encodeURIComponent(id)}/swaps`,
        (value):value is MobileSwapReceipt=>isMobileSwapReceipt(value)&&String(value.id)===id&&value.requestId===key&&
          value.reviewedRevision===input.revision&&value.reviewedItemRevision===input.item_revision&&value.reviewedVehicleRevision===input.vehicle_revision&&
          value.itemId===input.item_id&&value.to.id===input.vehicle_id,
        {method:'POST',body:JSON.stringify(input),headers:{'Idempotency-Key':key}}),
    swapReceipt:(key:string)=>
      request<{receipt:MobileSwapReceipt|null}>(`/swaps/requests/${encodeURIComponent(key)}`,
        (value):value is {receipt:MobileSwapReceipt|null}=>!!value&&typeof value==='object'&&'receipt' in value&&
          (value.receipt===null||isMobileSwapReceipt(value.receipt)&&value.receipt.requestId===key)),
    recoveryPreparation:(id:string,page=1,signal?:AbortSignal)=>
      request<MobileRecoveryPreparation>(`/contracts/${encodeURIComponent(id)}/recoveries?page=${page}`,
        (value):value is MobileRecoveryPreparation=>isMobileRecoveryPreparation(value)&&String(value.id)===id&&value.items.page===page,{signal}),
    recoveryPreview:(id:string,input:MobileRecoveryInput,signal?:AbortSignal)=>
      request<MobileRecoveryPreview>(`/contracts/${encodeURIComponent(id)}/recoveries/preview`,
        (value):value is MobileRecoveryPreview=>isMobileRecoveryPreview(value)&&String(value.id)===id&&matchesRecoveryPreview(value,input),
        {method:'POST',body:JSON.stringify(input),signal}),
    recordRecovery:(id:string,input:MobileRecoveryRecordInput,key:string)=>
      request<MobileRecoveryReceipt>(`/contracts/${encodeURIComponent(id)}/recoveries`,
        (value):value is MobileRecoveryReceipt=>isMobileRecoveryReceipt(value)&&String(value.id)===id&&value.requestId===key&&value.review.snapshot===input.review_snapshot&&matchesRecoveryPreview(value.review,input),
        {method:'POST',body:JSON.stringify(input),headers:{'Idempotency-Key':key}}),
    recoveryReceipt:(key:string)=>request<{receipt:MobileRecoveryReceipt|null}>(`/recoveries/requests/${encodeURIComponent(key)}`,
      (value):value is {receipt:MobileRecoveryReceipt|null}=>!!value&&typeof value==='object'&&'receipt' in value&&
        (value.receipt===null||isMobileRecoveryReceipt(value.receipt)&&value.receipt.requestId===key)),
    returnPreparation:(id:string,page=1,signal?:AbortSignal)=>
      request<MobileReturnPreparation>(`/contracts/${encodeURIComponent(id)}/returns?page=${page}`,
        (value):value is MobileReturnPreparation=>isMobileReturnPreparation(value)&&String(value.id)===id&&value.items.page===page,{signal}),
    returnPreview:(id:string,input:MobileReturnPreviewInput,signal?:AbortSignal)=>
      request<MobileReturnPreview>(`/contracts/${encodeURIComponent(id)}/returns/preview`,
        (value):value is MobileReturnPreview=>isMobileReturnPreview(value)&&String(value.id)===id&&matchesReturnFees(value,input),
        {method:'POST',body:JSON.stringify(input),signal}),
    returnSettlementPreview:(id:string,input:MobileReturnSettlementInput,signal?:AbortSignal)=>
      request<MobileReturnSettlementPreview>(`/contracts/${encodeURIComponent(id)}/returns/settlement-preview`,
        (value):value is MobileReturnSettlementPreview=>isMobileReturnSettlementPreview(value)&&String(value.id)===id&&matchesReturnSettlement(value,input),
        {method:'POST',body:JSON.stringify(input),signal}),
    recordReturn:(id:string,input:MobileReturnRecordInput,key:string)=>
      request<MobileReturnReceipt>(`/contracts/${encodeURIComponent(id)}/returns`,
        (value):value is MobileReturnReceipt=>isMobileReturnReceipt(value)&&String(value.id)===id&&value.requestId===key&&value.review.snapshot===input.settlement_snapshot&&matchesReturnSettlement(value.review,input),
        {method:'POST',body:JSON.stringify(input),headers:{'Idempotency-Key':key}}),
    returnReceipt:(key:string)=>
      request<{receipt:MobileReturnReceipt|null}>(`/returns/requests/${encodeURIComponent(key)}`,
        (value):value is {receipt:MobileReturnReceipt|null}=>!!value&&typeof value==='object'&&'receipt' in value&&
          (value.receipt===null||isMobileReturnReceipt(value.receipt)&&value.receipt.requestId===key)),
    renewalPeriods: (id: string, page = 1, signal?: AbortSignal) =>
      request<MobileRenewalPeriods>(`/contracts/${encodeURIComponent(id)}/renewals/periods?page=${page}`,
        (value): value is MobileRenewalPeriods => isMobileRenewalPeriods(value) && String(value.id) === id && value.page === page, { signal }),
    contractReceipt: (key: string) =>
      request<{ receipt: MobileWriteReceipt | null }>(
        `/contracts/requests/${encodeURIComponent(key)}`,
        isReceiptLookup,
      ),
    draftStaff: (signal?: AbortSignal) =>
      request<{ rows: MobileDraftStaff[] }>(
        "/drafts/staff",
        isMobileDraftStaff,
        { signal },
      ),
    draft: (id: string, signal?: AbortSignal) =>
      request<MobileDraftProfile>(
        `/drafts/${encodeURIComponent(id)}`,
        (value): value is MobileDraftProfile =>
          isMobileDraftProfile(value) && String(value.id) === id,
        { signal },
      ),
    saveDraft: (id: string | null, input: MobileDraftInput, key: string) =>
      request<MobileWriteReceipt>(
        id === null ? "/drafts" : `/drafts/${encodeURIComponent(id)}`,
        isWriteReceipt,
        {
          method: id === null ? "POST" : "PATCH",
          body: JSON.stringify(input),
          headers: { "Idempotency-Key": key },
        },
      ),
    draftReceipt: (key: string) =>
      request<{ receipt: MobileWriteReceipt | null }>(
        `/drafts/requests/${encodeURIComponent(key)}`,
        isReceiptLookup,
      ),
    draftInventory: (query: string, signal?: AbortSignal) =>
      request<MobileDraftInventory>(
        `/drafts/inventory?${query}`,
        isMobileDraftInventory,
        { signal },
      ),
    draftCustomer: (
      input: { id: number } | { query: string },
      signal?: AbortSignal,
    ) =>
      request<{ rows: MobileDraftCustomer[]; hasMore: boolean }>(
        "/drafts/customer-lookup",
        isMobileDraftCustomers,
        { method: "POST", body: JSON.stringify(input), signal },
      ),
    draftAvailability: (
      input: {
        vehicleIds: number[];
        startsAt: string;
        endsAt: string;
        draftId?: number;
      },
      signal?: AbortSignal,
    ) =>
      request<MobileVehicleAvailability>(
        "/drafts/availability",
        (value): value is MobileVehicleAvailability =>
          isMobileVehicleAvailability(value) &&
          value.startsAt === input.startsAt &&
          value.endsAt === input.endsAt &&
          value.vehicles.length === new Set(input.vehicleIds).size &&
          value.vehicles.every((row) => input.vehicleIds.includes(row.id)),
        { method: "POST", body: JSON.stringify(input), signal },
      ),
    operationContracts: (query:string,signal?:AbortSignal)=>request<MobilePage>(`/operations/contracts?${query}`,isPage,{signal}),
    catalogue: (kind: CatalogueKind, query: string, signal?: AbortSignal) =>
      request<MobilePage>(`/catalogue/${kind}?${query}`, isPage, { signal }),
    record: (kind: CatalogueKind, id: string, signal?: AbortSignal) =>
      request<MobileRecord>(
        `/catalogue/${kind}/${encodeURIComponent(id)}`,
        isRecord,
        { signal },
      ),
  };
}
export type MobileApi = ReturnType<typeof createApi>;
