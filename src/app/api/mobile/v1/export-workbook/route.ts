import { NextRequest } from "next/server";
import { requireMobileSession, MobileError } from "@/lib/server/mobile-session";
import { mobileFilteredWorkbook } from "@/lib/server/mobile-filtered-workbook";
import { mobileFailure, mobileJson } from "@/lib/server/mobile-response";
import { mobileBody } from "@/lib/server/mobile-writes";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await requireMobileSession(request);
    const body = await mobileBody(request, 4 * 1024 * 1024);
    const filename = typeof body.filename === "string" ? body.filename.trim() : "";
    if (!/^(himoto|HIMOTO)-[a-zA-Z0-9-]{1,100}$/.test(filename)) {
      throw new MobileError("Tên file Excel xuất không hợp lệ.");
    }
    if (!Array.isArray(body.headers) || body.headers.length === 0 || body.headers.length > 40 || !body.headers.every((h: unknown) => typeof h === "string" && h.length <= 200)) {
      throw new MobileError("Cấu trúc cột Excel không hợp lệ.");
    }
    if (!Array.isArray(body.rows) || body.rows.length > 5000 || !body.rows.every((r: unknown) => Array.isArray(r) && r.length <= 40 && r.every((c: unknown) => c === null || c === undefined || typeof c === "string" || typeof c === "number"))) {
      throw new MobileError("Dữ liệu dòng Excel không hợp lệ.");
    }
    const workbook = await mobileFilteredWorkbook(
      filename,
      body.headers as string[],
      body.rows as (string | number | null | undefined)[][],
    );
    return mobileJson(workbook);
  } catch (error) {
    return mobileFailure(error);
  }
}
