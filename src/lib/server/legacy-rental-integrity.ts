import 'server-only';
import { verify } from 'node:crypto';
import type { PoolClient } from 'pg';
import { VEHICLE_ORDER_SQL } from './contract-classification';
import { LEGACY_INTEGRITY_PUBLIC_KEY } from './legacy-rental-integrity-public-key';

export const normalizedIntegrityLicense=(value:string)=>value.toUpperCase().replace(/[.\s-]/g,'');
export function validIntegritySignature(headers:Headers,body:string,now=Date.now(),publicKey=LEGACY_INTEGRITY_PUBLIC_KEY) {
  const timestamp=headers.get('x-himoto-integrity-timestamp')||'',nonce=headers.get('x-himoto-integrity-nonce')||'',signature=headers.get('x-himoto-integrity-signature')||'';
  if(!/^\d{10}$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>60||!/^\w{32,64}$/.test(nonce)||! /^[A-Za-z0-9+/]{342}==$/.test(signature))return false;
  try{return verify('sha256',Buffer.from(`${timestamp}\n${nonce}\n${body}`),publicKey,Buffer.from(signature,'base64'));}catch{return false;}
}
export function integrityLicenses(body:unknown):string[] {
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>key!=='licenses'))throw new Error('Invalid body');
  const raw=(body as {licenses?:unknown}).licenses;
  if(!Array.isArray(raw)||!raw.length||raw.length>100||raw.some(value=>typeof value!=='string'||value.length>32||! /^[A-Z0-9]{5,16}$/.test(normalizedIntegrityLicense(value))))throw new Error('Invalid licenses');
  return [...new Set(raw.map(normalizedIntegrityLicense))];
}
export async function readNewRentalIntegrity(db:Pick<PoolClient,'query'>,licenses:string[]) {
  const rows=(await db.query(`SELECT regexp_replace(upper(v.license),'[^A-Z0-9]','','g') AS license,
    count(DISTINCT v.id)::int AS vehicle_count,
    count(DISTINCT o.id) FILTER(WHERE o.order_status IN ('renting','overdue','bad_debt','wait_payment'))::int AS active_count,
    count(DISTINCT o.id) FILTER(WHERE o.order_status IN ('renting','overdue','bad_debt','wait_payment')
      AND COALESCE(NULLIF(btrim(c.name),''),NULLIF(btrim(o.customer_name),'')) IS NOT NULL)::int AS named_count,
    count(DISTINCT o.id) FILTER(WHERE o.order_status NOT IN ('renting','overdue','bad_debt','wait_payment'))::int AS other_open_count
    FROM himoto.vehicles v
    LEFT JOIN himoto.order_vehicle_details d ON d.vehicle_id=v.id AND d.deleted_at IS NULL AND d.completed_at IS NULL
    LEFT JOIN himoto.orders o ON o.id=d.order_id AND o.deleted_at IS NULL AND o.completed_at IS NULL AND ${VEHICLE_ORDER_SQL}
      AND o.order_status NOT IN ('completed','cancelled')
    LEFT JOIN himoto.customers c ON c.id=o.customer_id
    WHERE v.deleted_at IS NULL AND regexp_replace(upper(v.license),'[^A-Z0-9]','','g')=ANY($1::text[])
    GROUP BY regexp_replace(upper(v.license),'[^A-Z0-9]','','g')`,[licenses])).rows;
  // No customer names, order IDs, money, branch IDs or contact details cross this bridge.
  return licenses.map(license=>{const row=rows.find(value=>value.license===license);return {license,found:Boolean(row),active_count:Number(row?.active_count||0),named_count:Number(row?.named_count||0),other_open_count:Number(row?.other_open_count||0)};});
}
