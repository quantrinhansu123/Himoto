import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { MobileFileExport } from '../../../shared/mobile-export';
import { MOBILE_HEADERS, mobileJson } from './mobile-response';

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/** Old clients retain JSON; new clients avoid Base64 expansion on the network. */
export function mobileExportResponse(file: MobileFileExport, request: Pick<NextRequest, 'headers'>) {
  if (!('contentBase64' in file) || !request.headers.get('Accept')?.includes(MIME)) return mobileJson(file);
  const bytes = new Uint8Array(Buffer.from(file.contentBase64, 'base64'));
  return new NextResponse(bytes, { headers: { ...MOBILE_HEADERS, Vary: 'Authorization, Accept', 'Content-Type': MIME,
    'Content-Disposition': `attachment; filename="${file.filename}"`, 'Content-Length': String(bytes.byteLength),
    'X-Export-Filename': file.filename, 'X-Export-Row-Count': String(file.rowCount) } });
}
