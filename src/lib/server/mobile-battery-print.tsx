import 'server-only';
import { BatteryContractPrintDocument } from '@/components/battery/BatteryContractPrintDocument';
import { hasPermission } from '@/lib/management/permissions';
import type { SessionUser } from './management-session';
import { readMobileBattery } from './mobile-battery';
import { MobileError } from './mobile-session';
import { mobilePrintHtml } from './mobile-print-html';
export async function readMobileBatteryPrint(user: SessionUser, value: string) {
  if (!hasPermission(user, 'contracts.read')) throw new MobileError('Tài khoản chưa được cấp quyền xem hợp đồng pin.', 403, 'FORBIDDEN');
  const workflow = await readMobileBattery(user, value), doc = workflow.contract;
  return { id: doc.id, code: doc.code, revision: doc.revision, version: '', versionLabel: 'Hợp đồng pin / sạc hiện tại', versions: [], generatedAt: new Date().toISOString(), preview: false, portrait: true, qrIncluded: false,
    html: await mobilePrintHtml(`Himoto · ${doc.code}`, <BatteryContractPrintDocument doc={doc} />, true), notices: ['Mẫu hợp đồng pin / sạc A4 dọc hiện có của web.'] };
}
