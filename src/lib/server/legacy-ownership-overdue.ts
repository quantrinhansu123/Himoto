import 'server-only';
import type { PoolClient } from 'pg';
import type { ManagementRow } from '@/lib/management/types';
import { usesLegacyOwnershipFees } from '@/lib/management/contract-overdue';
import { legacyOwnershipHourlyRate } from '@/lib/management/legacy-ownership-overdue';

/** Request-local reference-price cache. Rows/vehicle metadata still come only
 * from the existing scoped contract queries; pricing contains no customer data.
 * Lists may opt in to day-reference estimates when the contract has no day rate.
 * This does not change return/renewal pricing or create any payable charge.
 */
export function legacyOwnershipFeeReader(db:Pick<PoolClient,'query'>,includeReferencePrices=false) {
  let prices:Promise<Map<string,number>>|undefined;
  const itemsOf=(row:ManagementRow):Record<string,unknown>[]=>{
    try{const parsed=JSON.parse(String(row.overdue_items_json||'[]'));return Array.isArray(parsed)?parsed.filter(item=>item&&typeof item==='object'):[];}catch{return [];}
  };
  const needsReference=(row:ManagementRow)=>includeReferencePrices&&!row.billing_plan_json&&itemsOf(row).some(item=>!(Number(item.daily_price)>0));
  return async (rows:ManagementRow[])=>{
    if(!rows.some(row=>usesLegacyOwnershipFees(row)||needsReference(row)))return rows;
    prices??=db.query('SELECT id,type,price_type,price FROM himoto.pricing ORDER BY id').then(result=>{
      const values=new Map<string,number>();
      for(const price of result.rows){const key=`${price.type}:${price.price_type}`,amount=Number(price.price);if(!values.has(key)&&Number.isSafeInteger(amount)&&amount>0)values.set(key,amount);}
      return values;
    });
    const values=await prices;
    return rows.map(row=>{
      const legacy=usesLegacyOwnershipFees(row);
      if(!legacy&&!needsReference(row))return row;
      let referenceUsed=false;
      const items=itemsOf(row).map(item=>{
        if(legacy){
          const override=Number(item.substitute_unit_price),original=override>0?override:values.get(`${item.vehicle_type}:${item.price_type}`);
          const fallback=includeReferencePrices&&original===undefined?values.get(`${item.vehicle_type}:day`):undefined;
          if(fallback!==undefined)referenceUsed=true;
          return {...item,legacy_fee_policy:true,legacy_daily_price:original??fallback??null,legacy_hourly_rate:legacyOwnershipHourlyRate(item.vehicle_type),legacy_fixed_total:Number(item.handler_price)>0};
        }
        if(Number(item.daily_price)>0)return item;
        // A week/month/package price is never treated as a daily rate. This is
        // read-only list estimation, not the fee charged on return or a receipt.
        const price=values.get(`${item.vehicle_type}:day`);
        if(price===undefined)return item;
        referenceUsed=true;
        return {...item,daily_price:price,fee_price_source:'reference_day'};
      });
      return {...row,...(legacy?{overdue_fee_policy:'legacy_ownership'}:{}),...(referenceUsed?{overdue_reference_price:1}:{}),overdue_items_json:JSON.stringify(items)};
    });
  };
}
