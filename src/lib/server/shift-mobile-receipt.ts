import "server-only";
import type { PoolClient } from "pg";
import { ShiftRequestError } from "./shift-report-requests";
type Database=Pick<PoolClient,"query">;
/** Called only by the bearer-authenticated mobile adapter, inside the original
 * web evidence transaction. Headers alone cannot opt a web request into this. */
export async function reserveShiftMobileReceipt(client:Database,actor:number,key:string,operation:string,hash:string) {
  await client.query("INSERT INTO himoto.management_mobile_requests(user_id,request_id,operation,fingerprint) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,request_id) DO NOTHING",[actor,key,operation,hash]);
  const row=(await client.query("SELECT operation,fingerprint FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2 FOR UPDATE",[actor,key])).rows[0];
  if(!row||row.operation!==operation||row.fingerprint!==hash)throw new ShiftRequestError("Mã minh chứng đã hủy hoặc có nội dung khác. Giữ mã để đối chiếu.",409);
}
export function finishShiftMobileReceipt(client:Database,actor:number,key:string,id:number,revision:number) {return client.query("UPDATE himoto.management_mobile_requests SET resource_id=$3,resource_revision=$4 WHERE user_id=$1 AND request_id=$2",[actor,key,id,String(revision)]);}
