import { NextResponse } from 'next/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export function GET() {
  return NextResponse.json({status:'ok',release:process.env.HIMOTO_RELEASE||null},{headers:{'Cache-Control':'no-store'}});
}
