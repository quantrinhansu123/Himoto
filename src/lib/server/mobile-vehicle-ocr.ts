import "server-only";
import type { NextRequest } from "next/server";
import type { SessionUser } from "./management-session";
import { hasPermission } from "@/lib/management/permissions";
import { MobileError } from "./mobile-session";
import { readPhotoBody } from "./photo-body";
import { RecordPhotoError } from "./record-photos";
import { PhotoOcrError, limitPhotoOcr, extractPhoto } from "./photo-ocr";
import { isOcrRequestId } from "../../../shared/mobile-customer-ocr";
import { isVehicleOcr, type MobileVehicleOcr } from "../../../shared/mobile-vehicle-ocr";
export async function readMobileVehicleOcr(user: SessionUser, request: NextRequest): Promise<MobileVehicleOcr> {
  if (!hasPermission(user, "vehicles.write")) throw new MobileError("Tài khoản không có quyền đọc đăng ký xe để nhập hồ sơ.", 403, "FORBIDDEN");
  const requestId = request.headers.get("x-ocr-request");
  if (request.nextUrl.search || request.headers.has("idempotency-key") || request.headers.has("x-expected-identity") || !isOcrRequestId(requestId)) throw new MobileError("Yêu cầu đọc đăng ký xe không hợp lệ.", 400, "INVALID_OCR_REQUEST");
  try {
    limitPhotoOcr(user.id);
    const image = await readPhotoBody(request), result = await extractPhoto("vehicle_registration", image.mimeType, image.data, request.signal);
    const response = { requestId, fields: result.fields, warnings: result.warnings || [] };
    if (!isVehicleOcr(response)) throw new MobileError("Kết quả đọc đăng ký chưa hợp lệ. Giữ thông tin và nhập tay hoặc thử lại.", 502, "INVALID_OCR_RESPONSE");
    return response;
  } catch (error) {
    if (error instanceof PhotoOcrError || error instanceof RecordPhotoError) throw new MobileError(error.message, error.status, "OCR_UNAVAILABLE");
    throw error;
  }
}
