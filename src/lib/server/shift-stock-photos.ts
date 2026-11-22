import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { NextRequest } from 'next/server';
import { hasPermission } from '@/lib/management/permissions';
import {
  isShiftStockCapture, isShiftStockDay, matchShiftStockPlate, SHIFT_STOCK_CATEGORY,
  SHIFT_STOCK_MAX_ACCURACY_METERS, SHIFT_STOCK_RADIUS_METERS, type ShiftStockCapture, type ShiftStockCheck, type ShiftStockVehicle,
} from '../../../shared/shift-stock-check';
import { AttendanceError, attendanceDistanceMeters, parseAttendanceLocation } from './attendance';
import { himotoPool } from './himoto-database';
import { withMobileData } from './mobile-context';
import type { SessionUser } from './management-session';
import { cloudflyPhotosEnabled, storeObjectPhoto } from './object-media';
import { PhotoOcrError, extractPhoto, limitPhotoOcr } from './photo-ocr';
import { RecordPhotoError, validatePhotoBytes } from './record-photos';
import { readShiftStock } from './shift-inventory';
import { readShiftReceipt, ShiftRequestError, shiftRequestHash, shiftRequestId, writeShiftReceipt } from './shift-report-requests';
import { MobileError } from './mobile-session';

const MAX_IMAGE = 2 * 1024 * 1024;
const MIME = 'image/jpeg';

export function storedShiftStock(payload: Record<string, unknown>): ShiftStockCapture[] {
  const value = payload.stock_captures;
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(isShiftStockCapture)) {
    throw new ShiftRequestError('Dữ liệu kiểm kê đã lưu cần được kiểm tra.', 409);
  }
  return value;
}

export async function expectedShiftStock(client:Pick<PoolClient,'query'>,store:number,payload:Record<string,unknown>):Promise<ShiftStockVehicle[]> {
  const frozen=payload.stock_expected;
  if(frozen===undefined)return readShiftStock(client,store);
  if(!Array.isArray(frozen)||!frozen.every(v=>v&&Number.isSafeInteger(v.id)&&v.id>0&&typeof v.license==='string'&&typeof v.name==='string')){
    throw new ShiftRequestError('Danh sách xe tại lần chốt trước cần được đối chiếu.',409);
  }
  return frozen;
}

async function branchCoordinates(client: Pick<PoolClient,'query'>, store: number) {
  const { rows } = await client.query<{latitude:number;longitude:number}>(
    'SELECT latitude,longitude FROM himoto.management_attendance_locations WHERE store_id=$1', [store],
  );
  return rows[0] ?? null;
}

export function verifyStockLocation(raw: string, branch: Awaited<ReturnType<typeof branchCoordinates>>) {
  if (!branch) throw new ShiftRequestError('Cơ sở chưa cài tọa độ chấm công. Cần cấu hình GPS trước khi kiểm kê.', 409);
  const location = parseAttendanceLocation(raw);
  if (location.accuracy > SHIFT_STOCK_MAX_ACCURACY_METERS) {
    throw new ShiftRequestError('Sai số GPS quá lớn. Hãy đứng tại vị trí thoáng ở cơ sở và chụp lại.', 422);
  }
  const distance = attendanceDistanceMeters(location, branch);
  if (distance === null || distance > SHIFT_STOCK_RADIUS_METERS) {
    throw new ShiftRequestError(`Ảnh phải được chụp trong phạm vi ${SHIFT_STOCK_RADIUS_METERS} m từ cơ sở báo cáo.`, 422);
  }
  return distance;
}

async function readStockPhotos(request: NextRequest) {
  const single = request.headers.get('content-type') === MIME;
  const split = Number(request.headers.get('x-vehicle-photo-bytes'));
  if (!single && (request.headers.get('content-type') !== 'application/octet-stream' ||
      !Number.isSafeInteger(split) || split < 1 || split > MAX_IMAGE)) throw new ShiftRequestError('Cần ảnh JPEG chụp cận biển số.');
  const limit = single ? MAX_IMAGE : split + MAX_IMAGE;
  const reader = request.body?.getReader();
  if (!reader) throw new ShiftRequestError('Thiếu ảnh biển số.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ShiftRequestError('Mỗi ảnh tối đa 2 MB.', 413);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks);
  if (single) {
    validatePhotoBytes(MIME, bytes);
    return [bytes] as const;
  }
  const pair = [bytes.subarray(0, split), bytes.subarray(split)] as const;
  for (const photo of pair) validatePhotoBytes(MIME, photo);
  if (pair[0].equals(pair[1])) throw new ShiftRequestError('Cần chụp riêng một ảnh xe và một ảnh cận biển số.');
  return pair;
}

async function draft(client: Pick<PoolClient,'query'>, id: number, branchId: number|null|undefined, revision?: number, lock = false) {
  const { rows } = await client.query(
    `SELECT store_id,report_date::text,status,revision,payload FROM himoto.management_shift_reports WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [id],
  );
  const report = rows[0];
  if (!report || (branchId !== undefined && Number(report.store_id) !== branchId)) {
    throw new ShiftRequestError('Báo cáo không tồn tại hoặc nằm ngoài phạm vi được phân công.', 404);
  }
  if (report.status !== 'draft' || (report.payload.report_type ?? 'end_shift') !== 'end_shift' ||
      !isShiftStockDay(report.report_date) && report.payload.stock_captures === undefined) {
    throw new ShiftRequestError('Mở bản nháp cuối ca hôm nay hoặc tiếp tục bản nháp đã bắt đầu kiểm kê.', 409);
  }
  if (revision !== undefined && revision !== report.revision) {
    throw new ShiftRequestError('Báo cáo đã thay đổi. Tải lại danh sách kiểm kê trước khi tiếp tục.', 409);
  }
  return report;
}

export async function readShiftStockCheck(client:Pick<PoolClient,'query'>, id:number, branchId?:number|null):Promise<ShiftStockCheck> {
  const report = await draft(client, id, branchId);
  const store = Number(report.store_id);
  const expected = await expectedShiftStock(client, store, report.payload);
  const captures = storedShiftStock(report.payload);
  const gpsConfigured = !!await branchCoordinates(client, store);
  return {revision:report.revision, expected, captures, gps_configured:gpsConfigured};
}

async function replaceCapture(client: PoolClient, reportId: number, captures: ShiftStockCapture[], removed?: ShiftStockCapture) {
  if (removed) {
    await client.query('DELETE FROM himoto.management_shift_media WHERE report_id=$1 AND id=ANY($2::uuid[])',
      [reportId, removed.vehicle_photo_id ? [removed.vehicle_photo_id, removed.plate_photo_id] : [removed.plate_photo_id]]);
  }
  const { rows } = await client.query(`UPDATE himoto.management_shift_reports
    SET payload=jsonb_set(jsonb_set(payload,'{stock_captures}',$2::jsonb),'{vehicles}',to_jsonb($3::int)),
      revision=revision+1, updated_at=now()
    WHERE id=$1 RETURNING revision`, [reportId, JSON.stringify(captures), captures.length]);
  return { revision: Number(rows[0].revision) };
}

function stockTransaction<T>(user: SessionUser, reading: boolean, work: (client:PoolClient)=>Promise<T>) {
  return withMobileData(user, '', async () => {
    const client = await himotoPool.connect();
    try {
      await client.query(reading ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'");
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });
}

export async function mobileShiftStockPhotos(request: NextRequest, user: SessionUser, id: number) {
  if (!hasPermission(user, 'contracts.read') || !hasPermission(user, 'contracts.draft') && !hasPermission(user, 'finance.write')) {
    throw new MobileError('Tài khoản không có quyền kiểm kê xe cuối ca.', 403, 'FORBIDDEN');
  }
  if (!Number.isSafeInteger(id) || id <= 0 || request.nextUrl.search) throw new MobileError('Báo cáo kiểm kê không hợp lệ.');
  const branchId = user.scope_all === true ? undefined : user.store_id ?? null;
  const reading = request.method === 'GET', removing = request.method === 'DELETE';
  try {
    const revision = Number(request.headers.get('x-report-revision'));
    const removingId = Number(request.headers.get('x-vehicle-id'));
    const key = reading ? null : shiftRequestId(request.headers);
    if (!reading && (!key || !Number.isSafeInteger(revision) || revision < 1 ||
      removing && (!Number.isSafeInteger(removingId) || removingId < 1))) throw new ShiftRequestError('Thiếu mã hoặc phiên bản kiểm kê.');
    const photos = reading || removing ? null : await readStockPhotos(request);
    const vehiclePhoto = photos?.length === 2 ? photos[0] : null;
    const vehicleGps = request.headers.get('x-vehicle-gps') ?? '', plateGps = request.headers.get('x-plate-gps') ?? '';
    const hash = shiftRequestHash(JSON.stringify({kind: 'stock-photos', id, revision, removing, removingId, vehicleGps, plateGps, split:vehiclePhoto?.length}), ...(photos ?? []));
    async function readReceipt(client:PoolClient) {
        const replay = await readShiftReceipt(client, key, user.id, hash);
        if (replay) {
          const visible = await client.query('SELECT id FROM himoto.management_shift_reports WHERE id=$1', [id]);
          if (!visible.rowCount) throw new ShiftRequestError('Không tìm thấy báo cáo kiểm kê.', 404);
        }
        return replay;
    }
    if (reading) return await stockTransaction(user, true, client => readShiftStockCheck(client, id, branchId));
    let distance = 0, plate = '';
    if (photos) {
      const ready = await stockTransaction(user, false, async client => {
        const replay = await readReceipt(client);
        if (replay) return {replay};
        const report = await draft(client, id, branchId, revision);
        const branch = await branchCoordinates(client,Number(report.store_id));
        const plateDistance = verifyStockLocation(plateGps, branch);
        return {distance:vehiclePhoto ? Math.max(verifyStockLocation(vehicleGps, branch), plateDistance) : plateDistance};
      });
      if (ready.replay) return ready.replay;
      distance = ready.distance;
      limitPhotoOcr(user.id);
      const result = await extractPhoto('plate', MIME, photos[1] ?? photos[0], request.signal, undefined, vehiclePhoto ? {
        additional:[{mimeType:MIME,data:vehiclePhoto}], verifyPlatePair:true,
      } : undefined);
      plate = result.fields.license ?? '';
      if (!plate) throw new ShiftRequestError(vehiclePhoto
        ? 'AI chưa xác nhận được cùng một biển số trên hai ảnh. Chụp toàn xe từ phía sau và chụp cận biển số cho rõ.'
        : 'AI chưa đọc rõ biển số. Chụp cận cảnh một biển số, giữ ảnh sáng và rõ nét.', 422);
    }
    return await stockTransaction(user, false, async client => {
        const replay = await readReceipt(client);
        if (replay) return replay;
        const report = await draft(client, id, branchId, revision, true);
        const store = Number(report.store_id);
        const captures = storedShiftStock(report.payload);
        let response;
        if (photos) {
          const matches = matchShiftStockPlate(plate, await expectedShiftStock(client, store, report.payload));
          if (matches.length !== 1) throw new ShiftRequestError(matches.length
            ? `Biển ${plate} trùng nhiều hồ sơ trong kho. Kiểm tra danh sách xe trước khi chụp lại.`
            : `Biển ${plate} không khớp xe Lưu kho của cơ sở này. Kiểm tra biển hoặc danh sách xe.`, 422);
          const vehicle = matches[0], previous = captures.find(entry => entry.vehicle.id === vehicle.id);
          if (previous && matchShiftStockPlate(previous.plate, [vehicle]).length) {
            throw new ShiftRequestError(`Xe ${vehicle.license} đã có ảnh kiểm kê. Mở ảnh đã lưu nếu cần chụp lại.`, 422);
          }
          const ids = photos.map(()=>randomUUID());
          const uploads = cloudflyPhotosEnabled()
            ? await Promise.all(photos.map((photo, index) => storeObjectPhoto(photo, MIME, user.id, ids[index])))
            : [];
          for (const [index, photo] of photos.entries()) {
            const uploaded = uploads[index];
            await client.query(`INSERT INTO himoto.management_shift_media
              (id,report_id,store_id,category,stage,filename,mime_type,data,created_by,object_bucket,object_key,object_etag,storage_sha256,storage_bytes)
              VALUES($1,$2,$3,$4,'pgd',$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [ids[index], id, store, SHIFT_STOCK_CATEGORY, `${vehiclePhoto && index === 0 ? 'Xe' : 'Biển số'} · ${vehicle.license}.jpg`, MIME,
              uploaded ? null : photo, user.id, uploaded?.object_bucket ?? null, uploaded?.object_key ?? null,
              uploaded?.object_etag ?? null, uploaded?.storage_sha256 ?? null, uploaded?.storage_bytes ?? null]);
          }
          const capture = {vehicle, plate, vehicle_photo_id: vehiclePhoto ? ids[0] : null, plate_photo_id: ids[1] ?? ids[0],
            captured_at: new Date().toISOString(), actor_name: user.name, distance_m: distance};
          response = {...await replaceCapture(client, id, [...captures.filter(entry => entry !== previous), capture], previous), capture};
        } else {
          const previous = captures.find(entry => entry.vehicle.id === removingId);
          if (!previous) throw new ShiftRequestError('Không tìm thấy ảnh đã kiểm kê.', 404);
          response = await replaceCapture(client, id, captures.filter(entry => entry !== previous), previous);
        }
        await writeShiftReceipt(client, key, user.id, store, hash, response);
        return response;
    });
  } catch (error) {
    if (error instanceof ShiftRequestError || error instanceof AttendanceError || error instanceof RecordPhotoError || error instanceof PhotoOcrError) {
      throw new MobileError(error.message, error.status, 'STOCK_CHECK');
    }
    throw error;
  }
}
