import 'server-only';
import type { NextRequest } from 'next/server';
import { BatteryContractPrintDocument, type BatteryPrintData } from '@/components/battery/BatteryContractPrintDocument';
import { hasPermission } from '@/lib/management/permissions';
import { DEFAULT_BATTERY_NAME } from '../../../shared/mobile-battery';
import type { SessionUser } from './management-session';
import { readMobileBattery } from './mobile-battery';
import { MobileError } from './mobile-session';
import { withMobileReadData } from './mobile-context';
import { himotoPool } from './himoto-database';
import { mobileBody } from './mobile-writes';
import { mobilePrintHtml } from './mobile-print-html';
export async function readMobileBatteryPrint(user: SessionUser, value: string) {
  if (!hasPermission(user, 'contracts.read')) throw new MobileError('Tài khoản chưa được cấp quyền xem hợp đồng pin.', 403, 'FORBIDDEN');
  const workflow = await readMobileBattery(user, value), doc = workflow.contract;
  return { id: doc.id, code: doc.code, revision: doc.revision, version: '', versionLabel: 'Hợp đồng pin / sạc hiện tại', versions: [], generatedAt: new Date().toISOString(), preview: false, portrait: true, qrIncluded: false,
    html: await mobilePrintHtml(`Himoto · ${doc.code}`, <BatteryContractPrintDocument doc={doc} />, true), notices: ['Mẫu hợp đồng pin / sạc A4 dọc hiện có của web.'] };
}
export async function previewMobileBatteryPrint(user: SessionUser, request: NextRequest) {
  if (!hasPermission(user, 'contracts.draft')) throw new MobileError('Tài khoản chưa được cấp quyền soạn hợp đồng pin.', 403, 'FORBIDDEN');
  const body = await mobileBody(request, 131072);
  const str = (key: string, max = 500) => typeof body[key] === 'string' ? (body[key] as string).slice(0, max) : '';
  const num = (key: string) => typeof body[key] === 'number' && Number.isSafeInteger(body[key]) && Number(body[key]) >= 0 ? Number(body[key]) : null;
  const storeId = num('store_id') || user.store_id || 0;
  const store = storeId > 0 ? await withMobileReadData(user, '', async () => {
    const result = await himotoPool.query('SELECT id,store_address,store_phone FROM himoto.store_directory() WHERE id=$1', [storeId]);
    return result.rows[0] as { id: number; store_address?: string; store_phone?: string } | undefined;
  }) : undefined;
  const paidMethod = str('paid_method', 10);
  const depositMethod = str('deposit_method', 10);
  const doc: BatteryPrintData = {
    code: str('code', 60) || 'MẪU XEM TRƯỚC',
    store_id: storeId,
    customer_id: num('customer_id'),
    status: str('status', 20) === 'returned' ? 'returned' : str('status', 20) === 'cancelled' ? 'cancelled' : 'renting',
    staff_name: str('staff_name', 120),
    signed_on: str('signed_on', 20),
    signed_place: str('signed_place', 255),
    customer_name: str('customer_name', 200),
    customer_phone: str('customer_phone', 32),
    customer_address: str('customer_address', 500),
    customer_id_card: str('customer_id_card', 32),
    id_card_issued_on: str('id_card_issued_on', 20),
    id_card_issued_by: str('id_card_issued_by', 255),
    battery_name: str('battery_name', 255) || DEFAULT_BATTERY_NAME,
    vehicle_license: str('vehicle_license', 32),
    vehicle_brand: str('vehicle_brand', 120),
    vehicle_type: str('vehicle_type', 120),
    vehicle_color: str('vehicle_color', 60),
    vehicle_year: str('vehicle_year', 10),
    starts_at: str('starts_at', 30),
    ends_at: str('ends_at', 30),
    rent_price: num('rent_price'),
    price_unit: str('price_unit', 30) || 'tháng',
    package_name: str('package_name', 120),
    paid_amount: num('paid_amount'),
    paid_method: paidMethod === 'CK' || paidMethod === 'TM' ? paidMethod : '',
    deposit_amount: num('deposit_amount'),
    deposit_note: str('deposit_note', 500),
    deposit_method: depositMethod === 'CK' || depositMethod === 'TM' ? depositMethod : '',
    notes: str('notes', 2000),
    store_address: String(store?.store_address || ''),
    store_phone: String(store?.store_phone || ''),
  };
  return { html: await mobilePrintHtml(`Himoto · ${doc.code}`, <BatteryContractPrintDocument doc={doc} />, true) };
}
