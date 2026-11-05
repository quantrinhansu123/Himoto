import type {BatteryContractFields} from './battery-contracts';
type CustomerDetails={name:string;phone:string;address:string;id_card:string;id_card_issued_on:string;id_card_issued_by:string};
export type BatteryCustomerValues=Pick<BatteryContractFields,'customer_id'|'customer_name'|'customer_phone'|'customer_address'|'customer_id_card'|'id_card_issued_on'|'id_card_issued_by'>;
/** Shared with the web picker; the selected customer updates only the tenant snapshot. */
export function batteryCustomerValues(id:number,details:CustomerDetails):BatteryCustomerValues{return{customer_id:id,customer_name:details.name,customer_phone:details.phone,customer_address:details.address,customer_id_card:details.id_card,id_card_issued_on:details.id_card_issued_on,id_card_issued_by:details.id_card_issued_by};}
export function batteryCustomerSnapshot(values:BatteryCustomerValues){return JSON.stringify([values.customer_id,values.customer_name,values.customer_phone,values.customer_address,values.customer_id_card,values.id_card_issued_on,values.id_card_issued_by]);}
export function missingBatteryCustomer(values:BatteryCustomerValues,digits:string):BatteryCustomerValues{return{...values,customer_id:null,...(/^0\d{8,10}$/.test(digits)?{customer_phone:values.customer_phone||digits}:{customer_id_card:values.customer_id_card||digits})};}
