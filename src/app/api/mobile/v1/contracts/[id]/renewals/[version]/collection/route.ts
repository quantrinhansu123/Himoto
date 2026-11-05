import { NextRequest } from "next/server";
import { requireMobileSession } from "@/lib/server/mobile-session";
import { readMobileRenewalCollection } from "@/lib/server/mobile-renewal-collection";
import { recordMobileRenewalCollection } from "@/lib/server/mobile-renewal-collection-write";
import { mobileFailure, mobileJson } from "@/lib/server/mobile-response";

export const runtime = "nodejs";
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; version: string }> }) {
  try {
    const { user } = await requireMobileSession(request), { id, version } = await params;
    return mobileJson(await readMobileRenewalCollection(user, id, version, request));
  } catch (error) { return mobileFailure(error); }
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; version: string }> }) {
  try {
    const { user } = await requireMobileSession(request), { id, version } = await params;
    return mobileJson(await recordMobileRenewalCollection(user, id, version, request));
  } catch (error) { return mobileFailure(error); }
}
