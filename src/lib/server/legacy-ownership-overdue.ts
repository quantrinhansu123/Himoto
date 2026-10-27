import 'server-only';
import type { PoolClient } from 'pg';
import type { ManagementRow } from '@/lib/management/types';
import { usesLegacyOwnershipFees } from '@/lib/management/contract-overdue';
import { legacyOwnershipHourlyRate } from '@/lib/management/legacy-ownership-overdue';

/** Request-local reference-price cache. Rows/vehicle metadata still come only
 * from the existing scoped contract queries; pricing contains no customer data.
 */
export function legacyOwnershipFeeReader(db:Pick<PoolClient,'query'>) {
  let prices:Promise<Map<string,number>>|undefined;
  return async (rows:ManagementRow[])=>{
    if(!rows.some(usesLegacyOwnershipFees))return rows;
    prices??=db.query('SELECT id,type,price_type,price FROM himoto.pricing ORDER BY id').then(result=>{
      const values=new Map<string,number>();
      for(const price of result.rows){const key=`${price.type}:${price.price_type}`;if(!values.has(key))values.set(key,Number(price.price));}
      return values;
    });
    const values=await prices;
    return rows.map(row=>{
      if(!usesLegacyOwnershipFees(row))return row;
      let items:Record<string,unknown>[]=[];
      try{const parsed=JSON.parse(String(row.overdue_items_json||'[]'));if(Array.isArray(parsed))items=parsed.filter(item=>item&&typeof item==='object');}catch{ /* Missing inputs stay unconfirmed. */ }
      return {...row,overdue_fee_policy:'legacy_ownership',overdue_items_json:JSON.stringify(items.map(item=>{
        const override=Number(item.substitute_unit_price),price=override>0?override:values.get(`${item.vehicle_type}:${item.price_type}`);
        return {...item,legacy_fee_policy:true,legacy_daily_price:price??null,legacy_hourly_rate:legacyOwnershipHourlyRate(item.vehicle_type),legacy_fixed_total:Number(item.handler_price)>0};
      }))};
    });
  };
}
