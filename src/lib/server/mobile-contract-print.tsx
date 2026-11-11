import 'server-only';
import { mobilePrintHtml } from './mobile-print-html';
import { ContractPrintBody } from '@/components/contracts/ContractPrintBody';
import { ContractPaymentQrMarkup } from '@/components/management/ContractPaymentQrMarkup';
import type { ContractQrData } from '@/lib/management/sepay';
import { buildContractDocument, contractStaffStoreId, createContractDraft } from '@/lib/management/contract-document';
import { mapApiRow } from '@/lib/management/repository';
import { hasPermission } from '@/lib/management/permissions';
import type { SessionUser } from './management-session';
import { withMobileData } from './mobile-context';
import { himotoPool } from './himoto-database';
import { mobileContractId } from './mobile-contracts';
import { MobileError } from './mobile-session';
import { CONTRACT_LIST_SQL } from './contract-drafts';
import { contractVehicleDetailsSql } from './contract-vehicle-reads';
import { readContractHistory } from './contract-history';
import { readContractQr, SePayError } from './sepay';
import { ContractPaymentError } from './contract-payments';
import { mobilePrintQrImage } from './mobile-print-qr';

/** Web's legal template and draft builder, rendered without client effects. */
export async function readMobileContractPrint(user: SessionUser, value: string, params: URLSearchParams) {
  if (!hasPermission(user, 'contracts.read')) throw new MobileError('Tài khoản chưa được cấp quyền xem hợp đồng.', 403, 'FORBIDDEN');
  const id = mobileContractId(value), version = params.get('version') || '', qrRequested = params.get('qr') !== '0';
  if ([...params.keys()].some(k => !['version', 'qr'].includes(k) || params.getAll(k).length !== 1) || !/^[a-zA-Z0-9:_-]{0,100}$/.test(version) || params.has('qr') && !['0', '1'].includes(params.get('qr')!)) throw new MobileError('Phiên bản in chưa hợp lệ.');
  const prepared = await withMobileData(user, '', async () => {
    const client = await himotoPool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); await client.query("SET LOCAL statement_timeout='20s'");
      const raw = (await client.query(contractVehicleDetailsSql(`${CONTRACT_LIST_SQL} AND o.id=$1`,'ARRAY[$1::bigint]'), [id])).rows[0];
      if (!raw) throw new MobileError('Không tìm thấy hợp đồng trong phạm vi tài khoản.', 404, 'NOT_FOUND');
      const row = mapApiRow('contracts', raw);
      const history = await readContractHistory(client, id);
      const choices = history.changes.filter(c => c.kind === 'created' || c.kind === 'swap' || c.version).map(c => ({ id: c.id, label: c.version?.label || c.title, at: c.at }));
      const change = version ? history.changes.find(c => c.id === version && (c.kind === 'created' || c.kind === 'swap' || c.version)) : null;
      if (version && !change) throw new MobileError('Phiên bản hợp đồng không còn trong hồ sơ hiện tại. Tải lại trước khi in.', 409, 'PRINT_VERSION_CHANGED');
      // Match web version printing: historical totals/deadline on current identity/vehicles.
      if (change?.version) {
        if (change.version.return_at) row.end_date = change.version.return_at;
        if (change.version.total !== null) row.total_amount = change.version.total;
        if (change.version.paid !== null) row.paid_amount = change.version.paid;
      }
      const draft = createContractDraft({ stores: [], staff: [], customers: [], contracts: [], vehicles: [] }, 'all', row);
      const store = (await client.query('SELECT id,store_name,store_address,store_phone FROM himoto.store_directory() WHERE id=$1', [Number(contractStaffStoreId(draft))])).rows[0];
      if (!store) throw new MobileError('Không tìm thấy cơ sở phụ trách để tạo mẫu in. Đối chiếu cơ sở của hồ sơ.', 409, 'PRINT_STORE_REVIEW');
      const branch = { id: Number(store.id), code: '', status: 'active', name: String(store.store_name), address: String(store.store_address || ''), phone: String(store.store_phone || '') };
      const representative = { id: Number(draft.staff_id) || -1, code: '', status: 'active', name: draft.staff_name || '', position: '' };
      const document = buildContractDocument(draft, branch, representative);
      let qr: ContractQrData | null = null;
      const notices = ['Mẫu web hiện tại có dấu bản nháp chưa phát hành.', ...(version ? ['Bản theo lịch sử dùng tiền/hẹn trả của phiên bản; thông tin khách và xe lấy từ hồ sơ hiện tại, giống luồng in web.'] : [])];
      if (qrRequested) {
        await client.query('SAVEPOINT print_qr');
        try { qr = await readContractQr(client, id); if (!qr.configured) notices.push(qr.configuration_message || 'Chưa có tài khoản mặc định hợp lệ để kèm QR.'); }
        catch (error) { await client.query('ROLLBACK TO SAVEPOINT print_qr'); notices.push(error instanceof SePayError || error instanceof ContractPaymentError ? `Không kèm QR: ${error.message}` : 'Chưa đọc được QR thanh toán; có thể in giấy và xem QR riêng sau.'); }
        finally { await client.query('RELEASE SAVEPOINT print_qr'); }
      }
      await client.query('COMMIT');
      return { document, qr, notices, meta: { id, code: row.code, revision: String(raw.draft_revision), version, versionLabel: change?.version?.label || change?.title || 'Hợp đồng hiện tại', versions: choices, preview: document.is_preview, portrait: false } };
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  });
  // The provider image is fetched after releasing the scoped DB transaction.
  let image: string | undefined;
  if (prepared.qr?.configured && prepared.qr.qr_url) {
    try { image = await mobilePrintQrImage(prepared.qr.qr_url); prepared.notices.push('QR dùng tài khoản và công nợ hiện tại của hợp đồng.'); }
    catch { prepared.notices.push('Chưa tải được ảnh QR; mẫu giấy không kèm QR. Có thể tạo lại giấy hoặc mở QR riêng.'); }
  }
  if (!qrRequested) prepared.notices.push('Mẫu giấy không kèm QR theo lựa chọn.');
  const html = await mobilePrintHtml(`Himoto · ${prepared.meta.code}`, <ContractPrintBody doc={prepared.document} paymentQr={image && prepared.qr ? <ContractPaymentQrMarkup data={prepared.qr} image={image} /> : undefined} />);
  return { ...prepared.meta, generatedAt: new Date().toISOString(), qrIncluded: !!image, html, notices: prepared.notices };
}
