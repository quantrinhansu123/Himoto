import 'server-only';
import type { PoolClient } from 'pg';
import { PROFILE_KEYS,type ContractProfile } from '@/lib/management/contract-profile';
import { CUSTOMER_FIELDS,validateOperationalCustomer } from '@/lib/management/contract-document';
import { validDocumentRequirements } from '@/lib/management/contract-requirements';
import { validIdentityIssueDate } from '@/lib/management/customer-identity';
import { loadCommissionStaff } from './commission-staff';
export class ContractProfileError extends Error {constructor(message:string,public status=400){super(message);}}
export function parseContractProfile(body:unknown):{revision:string;profile:ContractProfile} {
  if(!body || typeof body !== 'object' || Array.isArray(body))throw new ContractProfileError('Hồ sơ hợp đồng chưa hợp lệ.');
  const value=body as Record<string,unknown>, profile=value.profile as ContractProfile;
  if(profile?.customer&&typeof profile.customer==='object'&&!Array.isArray(profile.customer))for(const key of ['customer_type','nationality','contact_channel','contact_detail'] as const)if(profile.customer[key]===undefined)profile.customer[key]='';
  if(Object.keys(value).some(key=>!['revision','profile'].includes(key)) || typeof value.revision !== 'string' || !/^\d{1,20}$/.test(value.revision) || !profile || typeof profile !== 'object' || Array.isArray(profile) || Object.keys(profile).some(key=>!PROFILE_KEYS.includes(key as never)))throw new ContractProfileError('Chỉ cập nhật thông tin hồ sơ, không thay đổi tiền hoặc kho xe.');
  if(!profile.customer || typeof profile.customer !== 'object' || Array.isArray(profile.customer) || Object.keys(profile.customer).some(key=>![...CUSTOMER_FIELDS,'relatives_json'].includes(key as never)) || CUSTOMER_FIELDS.some(key=>typeof profile.customer[key] !== 'string' || profile.customer[key].length>4000))throw new ContractProfileError('Thông tin khách hàng chưa hợp lệ.');
  const errors=validateOperationalCustomer(profile.customer,'api');
  if(Object.keys(errors).length)throw new ContractProfileError(Object.values(errors)[0]);
  if(!Array.isArray(profile.relatives) || profile.relatives.length !== 2)throw new ContractProfileError('Thông tin người thân chưa hợp lệ.');
  if(profile.relatives.some(relative=>!relative || typeof relative !== 'object' || Array.isArray(relative) || Object.keys(relative).some(key=>!['name','relationship','phone'].includes(key)) || ['name','relationship','phone'].some(key=>typeof relative[key as keyof typeof relative] !== 'string' || relative[key as keyof typeof relative].length>4000) || relative.phone && !/^\+?\d{9,13}$/.test(relative.phone.replace(/[\s.()-]/g,''))))throw new ContractProfileError('Thông tin người thân chưa hợp lệ.');
  for(const key of ['staff_id','staff_name','signed_on','authorization_date','collateral_description'] as const)if(typeof profile[key] !== 'string' || profile[key].length>4000)throw new ContractProfileError('Thông tin hồ sơ chưa hợp lệ.');
  for(const key of ['sales_staff_id','tls_staff_id'] as const)if(profile[key] !== undefined && (typeof profile[key] !== 'string' || profile[key] && !/^[1-9]\d{0,14}$/.test(profile[key])))throw new ContractProfileError('Nhân viên ghi nhận doanh số chưa hợp lệ.');
  if(profile.ownership_term_months !== undefined && !['6','12','24','custom'].includes(profile.ownership_term_months))throw new ContractProfileError('Phân loại thuê sở hữu chưa hợp lệ.');
  if(profile.staff_id && !/^[1-9]\d{0,14}$/.test(profile.staff_id) || !validIdentityIssueDate(profile.signed_on) || !validIdentityIssueDate(profile.authorization_date) || profile.document_requirements !== undefined && !validDocumentRequirements(profile.document_requirements))throw new ContractProfileError('Ngày ký, nhân viên hoặc yêu cầu hồ sơ chưa hợp lệ.');
  return {revision:value.revision,profile:structuredClone(profile)};
}
export async function updateContractProfile(client:Pick<PoolClient,'query'>,id:number,actor:number,body:unknown) {
  const {revision,profile}=parseContractProfile(body);
  if(!Number.isSafeInteger(id) || id<=0 || !Number.isSafeInteger(actor) || actor<=0)throw new ContractProfileError('Mã hợp đồng chưa hợp lệ.');
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '15s'");
  const row=await client.query('SELECT order_status,draft_payload,xmin::text AS revision FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id]);
  if(!row.rowCount)throw new ContractProfileError('Không tìm thấy hợp đồng.',404);
  if(row.rows[0].revision !== revision)throw new ContractProfileError('Hợp đồng đã thay đổi; tải lại trước khi lưu hồ sơ.',409);
  if(row.rows[0].order_status === 'draft')throw new ContractProfileError('Lưu nháp để cập nhật hợp đồng này.',409);
  if(profile.staff_id && !(await client.query('SELECT id FROM himoto.staff_profiles WHERE id=$1 FOR SHARE',[profile.staff_id])).rowCount)throw new ContractProfileError('Nhân viên đã chọn không còn tồn tại.',409);
  const attribution:Record<string,{staff_id:number;name:string}>={};
  for(const [key,department] of [['sales_staff_id','NVKD'],['tls_staff_id','TLS']] as const){
    if(profile[key]){
      const employee=await loadCommissionStaff(profile[key], department);
      if(!employee)throw new ContractProfileError(`Chọn nhân viên ${department === 'NVKD' ? 'NVKD hoặc TPKD' : department} đang hoạt động.`,409);
      attribution[department]=employee;
    }
  }
  const result=await client.query(`UPDATE himoto.orders SET customer_name=$2,customer_phone=$3,customer_address=NULLIF($4,''),customer_idnumber=NULLIF($5,''),
    draft_payload=jsonb_set(COALESCE(draft_payload::jsonb,'{}'::jsonb),'{management_composer}',
      COALESCE(draft_payload::jsonb->'management_composer','{}'::jsonb) || jsonb_build_object('profile',$6::jsonb,'profile_updated_by',$7::bigint,'profile_updated_at',now(),'profile_attribution',$8::jsonb),true)::json,updated_at=now()
    WHERE id=$1 RETURNING xmin::text AS revision`,[id,profile.customer.name,profile.customer.phone,profile.customer.address,profile.customer.id_card,JSON.stringify(profile),actor,JSON.stringify(attribution)]);
  return {revision:String(result.rows[0].revision)};
}
