import "server-only";
import {resolveMobileBulkDelete} from './mobile-bulk-delete';
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { SessionUser } from "./management-session";
import type { MobileWriteResolution } from "../../../shared/mobile-write-recovery";
import { isMobileWriteOperation } from "../../../shared/mobile-write-recovery";
import { hasPermission,isAdminAccount,canSendDebtReminder } from "@/lib/management/permissions";
import { himotoPool,ownerDatabase } from "./himoto-database";
import { withMobileData } from "./mobile-context";
import { MobileError } from "./mobile-session";
import { mobileBody, mobileRequestKey } from "./mobile-writes";
import { requireStaffAccountScope } from "./staff-accounts";
import { AccountAccessError } from "./account-management";
import { requireMobileLifecycle } from './mobile-contract-lifecycle';
import { requireMobileCorrection } from './mobile-contract-corrections';
import { canApproveOwnershipContract } from '@/lib/management/contract-approval';
import { requireMobileOwnershipTerms } from './mobile-ownership-terms';
import { requireMobileCustomerImport } from './mobile-customer-import';
import {resolveMobileTelegram} from './mobile-telegram';

// Use the existing unique actor/key constraint, exactly like idempotentMobileWrite.
// A tombstone's different operation also blocks writes from older server versions.
// Never expire/delete these rows without a coordinated retry-expiry protocol.
export async function resolveMobileWrite(
  user: SessionUser,
  key: string,
  request: NextRequest,
): Promise<MobileWriteResolution> {
  mobileRequestKey(key);
  const body = await mobileBody(request, 1024);
  if (Object.keys(body).some((name) => name !== "operation") || !isMobileWriteOperation(body.operation))
    throw new MobileError("Loại thao tác cần đối chiếu không hợp lệ.", 400, "INVALID_OPERATION");
  const operation = body.operation;
  const family = operation.split(".")[0];
  if(family==='bulk')return resolveMobileBulkDelete(user,key,operation);
  if(family==='telegram')return resolveMobileTelegram(user,key,operation);
  if (family === 'vimport') throw new MobileError('Đối chiếu Excel xe qua màn hình nhập xe.', 400, 'INVALID_OPERATION');
  const customerImport=family==='import';
  if(operation.startsWith('import.contracts:')&&!isAdminAccount(user))throw new MobileError('Chỉ quản trị viên được đối chiếu nhập nháp hợp đồng.',403,'FORBIDDEN');
  const video=family==='video';
  if(video&&!hasPermission(user,'contracts.read'))throw new MobileError('Không có quyền đối chiếu video hồ sơ.',403,'FORBIDDEN');
  if(customerImport)requireMobileCustomerImport(user);
  const lifecycle=family==='lifecycle';
  if(lifecycle)requireMobileLifecycle(user,operation.split('.')[1].split(':')[0]);
  const correction=family==='correction';
  if(correction)requireMobileCorrection(user,operation.startsWith('correction.receipts:')?'receipts':'renewal');
  const ownershipTerms=operation.startsWith('contract.ownership_terms:');
  if(ownershipTerms)requireMobileOwnershipTerms(user,true);
  if(operation.startsWith('contract.approve:')&&!canApproveOwnershipContract(user))throw new MobileError('Tài khoản không có quyền đối chiếu duyệt hợp đồng sở hữu.',403,'FORBIDDEN');
  if(family==='integration')throw new MobileError('Đối chiếu cấu hình qua màn hình tích hợp.',400,'INVALID_OPERATION');
  const managedAccount=family==='account',ownPassword=operation==='account.change-password';
  if(managedAccount&&!ownPassword&&!isAdminAccount(user))throw new MobileError('Chỉ quản trị viên được đối chiếu quản lý tài khoản.',403,'FORBIDDEN');
  if(operation.startsWith('account.password:')&&(!isAdminAccount(user)||![145,160].includes(user.id)))throw new MobileError('Tài khoản không có quyền đối chiếu xem mật khẩu.',403,'FORBIDDEN');
  if(operation.startsWith("ctype."))throw new MobileError("Đối chiếu loại hợp đồng qua màn hình danh mục.",400,"INVALID_OPERATION");
  const battery=family==='battery';
  if(battery&&(!hasPermission(user,'contracts.read')||(operation.startsWith('battery.media:')?!['contracts.draft','contracts.return','contracts.renew'].some(p=>hasPermission(user,p as 'contracts.draft'|'contracts.return'|'contracts.renew')):!hasPermission(user,/^battery[.](create|update:|delete:)/.test(operation)?'contracts.draft':operation.startsWith('battery.return:')?'contracts.return':'contracts.renew'))))throw new MobileError('Không có quyền đối chiếu hợp đồng pin / sạc.',403,'FORBIDDEN');
  const reminder=family==='reminder';
  const shift=family==='shift';
  if(shift&&(!hasPermission(user,'contracts.read')||!(operation.startsWith('shift.audit:')?hasPermission(user,'shift.review'):hasPermission(user,'contracts.draft')||hasPermission(user,'finance.write')||operation.startsWith('shift.media:')&&hasPermission(user,'shift.review'))))throw new MobileError('Không có quyền đối chiếu báo cáo ca.',403,'FORBIDDEN');
  if(reminder&&!canSendDebtReminder(user))throw new MobileError('Không có quyền đối chiếu gửi nhắc nợ.',403,'FORBIDDEN');
  const voucherBulk = operation === 'cashbook.delete';
  const cashAccount=family==='bank'||family==='cash';
  const storeWrite=family==='store';
  if(storeWrite&&!hasPermission(user,'settings.write'))throw new MobileError('Không có quyền đối chiếu thay đổi cơ sở.',403,'FORBIDDEN');
  const gpsMapping=family==='gps';
  if(gpsMapping&&!isAdminAccount(user))throw new MobileError('Chỉ quản trị được đối chiếu thao tác ghép GPS.',403,'FORBIDDEN');
  const vehicleMedia=operation.startsWith('media.vehicle:')||operation.startsWith('media.delete.vehicle:');
  const customerMedia=operation.startsWith('media.customer:')||operation.startsWith('media.delete.customer:');
  const read = cashAccount||voucherBulk ? "finance.read" : family === "duty"||family === "staff" ? "hr.read" : family === "vehicle"||vehicleMedia ? "vehicles.read" : family === "customer"||customerMedia ? "customers.read" : "contracts.read";
  const write = voucherBulk ? "settings.write" : cashAccount ? "finance.write" : family === "duty"||family === "staff" ? "hr.write" : family === "customer" ? "customers.write" : family === "draft" || (operation.startsWith("contract.edit:") || operation.startsWith("contract.terms:")) ? "contracts.draft" : family === "payment" ? "finance.write" : family === "renewal" ? "contracts.renew" : family === "return" ? "contracts.return" : "contracts.finalize";
  const vehicleProfile=operation==='vehicle.create'||operation.startsWith('vehicle.update:')||operation.startsWith('vehicle.status:');
  const neededWrite=vehicleProfile?'vehicles.write':customerMedia?'customers.write':family==='media'?'vehicles.read':family==="vehicle" ? (/^vehicle\.(transfer|cancel):/.test(operation)?"vehicles.transfer":"vehicles.receive") : write;
  if (!video&&!customerImport&&!ownershipTerms&&!lifecycle&&!correction&&!managedAccount&&!storeWrite&&!gpsMapping&&!reminder&&!shift&&!battery&&family!=='media'&&(!hasPermission(user, read) || !hasPermission(user, neededWrite)))
    throw new MobileError("Tài khoản không có quyền đối chiếu thao tác này.", 403, "FORBIDDEN");
  return withMobileData(user, gpsMapping||family==="vehicle"||vehicleMedia?"fleet_read":"", async () => {
    const client = await (gpsMapping||family==='staff'||managedAccount&&!ownPassword?ownerDatabase:himotoPool).connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout='20s'");
      await client.query("SET LOCAL lock_timeout='5s'");
      const cancelled = `cancelled:${operation}`;
      await client.query(
        `INSERT INTO himoto.management_mobile_requests(user_id,request_id,operation,fingerprint)
        VALUES($1,$2,$3,$4) ON CONFLICT(user_id,request_id) DO NOTHING`,
        [user.id, key, cancelled, createHash("sha256").update(cancelled).digest("hex")],
      );
      const row = (await client.query(
        `SELECT operation,resource_id,resource_revision FROM himoto.management_mobile_requests
        WHERE user_id=$1 AND request_id=$2 FOR UPDATE`,
        [user.id, key],
      )).rows[0];
      if (!row) throw new MobileError("Chưa đối chiếu được thao tác. Giữ mã và thử lại.", 503);
      if (row.operation !== operation && row.operation !== cancelled)
        throw new MobileError("Mã thao tác không khớp. Giữ mã để đối chiếu.", 409, "REQUEST_KEY_REUSED");
      let result: MobileWriteResolution;
      if (row.operation === cancelled && row.resource_id == null) {
        result = { key, operation, status: "cancelled", receipt: null };
      } else {
        const id = Number(row.resource_id), revision = String(row.resource_revision);
        const target = /:(\d+)$/.exec(operation)?.[1];
        if(customerImport&&(id!==user.id||Number(revision)>1001))throw new MobileError('Kết quả nhập không thuộc tài khoản hoặc vượt giới hạn.',409,'INVALID_WRITE_RECEIPT');
        if(ownPassword&&id!==user.id)throw new MobileError('Mã đổi mật khẩu không thuộc tài khoản này.',403,'FORBIDDEN');
        if (voucherBulk && (id > 500 || revision !== '1')) throw new MobileError('Xác nhận xóa phiếu chưa hợp lệ.', 409, 'INVALID_WRITE_RECEIPT');
        if (row.operation !== operation || !Number.isSafeInteger(id) || id <= 0 || !/^[1-9]\d{0,19}$/.test(revision) || (target && Number(target) !== id))
          throw new MobileError("Kết quả thao tác cần được kiểm tra. Giữ mã để đối chiếu.", 409, "INVALID_WRITE_RECEIPT");
        // A successful hard delete leaves only this actor's immutable receipt.
        // Other store writes must still resolve a currently visible scoped row.
        const deletedStaff=family==='staff'&&operation.startsWith('staff.delete:');
        if(family==='staff'&&!deletedStaff){
          const staff=(await client.query('SELECT store_id FROM himoto.staff_profiles WHERE id=$1',[id])).rows[0];
          if(!staff)throw new MobileError('Nhân sự không còn trong phạm vi truy cập. Giữ mã để đối chiếu.',403,'FORBIDDEN');
          requireStaffAccountScope(user,staff.store_id);
        }
        const visible = customerImport||voucherBulk||cashAccount&&operation.includes('.delete:')||deletedStaff||storeWrite&&operation.startsWith('store.delete:') ? {rowCount:1} : await client.query(
          managedAccount ? "SELECT id FROM himoto.users WHERE id=$1" : battery ? "SELECT id FROM himoto.battery_contracts WHERE id=$1" : shift ? "SELECT id FROM himoto.management_shift_reports WHERE id=$1" : cashAccount ? `SELECT id FROM himoto.${family==='bank'?'banks':'cash'} WHERE id=$1` : family==='staff' ? "SELECT id FROM himoto.staff_profiles WHERE id=$1" : storeWrite ? "SELECT id FROM himoto.stores WHERE id=$1" : family === "duty" ? "SELECT id FROM himoto.store_duty_schedules WHERE id=$1" : gpsMapping?"SELECT device_id FROM himoto.management_mobile_gps_mappings WHERE device_id=$1 AND user_id=$2 AND request_id=$3":family === "customer"||customerMedia
            ? "SELECT id FROM himoto.customers WHERE id=$1"
            : family === "vehicle"||vehicleMedia ? "SELECT id FROM himoto.vehicles WHERE id=$1"
            : operation.startsWith('return.recover:')||operation.startsWith('draft.delete:')||family==='media'||video?"SELECT id FROM himoto.orders WHERE id=$1"
            : "SELECT id FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL",
          gpsMapping?[id,user.id,key]:[id],
        );
        if (!visible.rowCount)
          throw new MobileError("Hồ sơ đã ra ngoài phạm vi truy cập hiện tại.", 403, "FORBIDDEN");
        result = { key, operation, status: "committed", receipt: { id, revision, replayed: true } };
      }
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if(error instanceof AccountAccessError)throw new MobileError(error.message,error.status,error.status===403?'FORBIDDEN':'INVALID_REQUEST');
      throw error;
    } finally {
      client.release();
    }
  });
}
