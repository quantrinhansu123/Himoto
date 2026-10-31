import 'server-only';
import type { PoolClient } from 'pg';
import { PROFILE_KEYS,canEditIssuedContract,issuedContractNumberError,type ContractProfile,type ContractProfileEdits } from '@/lib/management/contract-profile';
import { CONTRACT_STATUSES } from '@/lib/management/config';
import { CUSTOMER_FIELDS,validateOperationalCustomer } from '@/lib/management/contract-document';
import { validDocumentRequirements } from '@/lib/management/contract-requirements';
import { validIdentityIssueDate } from '@/lib/management/customer-identity';
import { loadCommissionStaff } from './commission-staff';
import { dataAccess,usesScopedDatabase } from './access-context';
import { contractNumberAvailable } from './contract-number';
import { validOwnershipTerm } from '@/lib/management/contract-billing';
export class ContractProfileError extends Error {constructor(message:string,public status=400){super(message);}}
const issuedStatus=(value:unknown)=>typeof value==='string'&&value!=='draft'&&CONTRACT_STATUSES.some(option=>option.value===value);
export function parseContractProfile(body:unknown):{revision:string;profile:ContractProfile}&ContractProfileEdits {
  if(!body || typeof body !== 'object' || Array.isArray(body))throw new ContractProfileError('Hồ sơ hợp đồng chưa hợp lệ.');
  const value=body as Record<string,unknown>, profile=value.profile as ContractProfile;
  if(profile?.customer&&typeof profile.customer==='object'&&!Array.isArray(profile.customer))for(const key of ['customer_type','nationality','contact_channel','contact_detail'] as const)if(profile.customer[key]===undefined)profile.customer[key]='';
  if(Object.keys(value).some(key=>!['revision','profile','contract_number','notes','status'].includes(key)) || typeof value.revision !== 'string' || !/^\d{1,20}$/.test(value.revision) || !profile || typeof profile !== 'object' || Array.isArray(profile) || Object.keys(profile).some(key=>!PROFILE_KEYS.includes(key as never)))throw new ContractProfileError('Chỉ cập nhật thông tin hồ sơ, không thay đổi tiền hoặc kho xe.');
  if(value.contract_number !== undefined && (typeof value.contract_number !== 'string' || issuedContractNumberError(value.contract_number)))throw new ContractProfileError(typeof value.contract_number === 'string' ? issuedContractNumberError(value.contract_number)! : 'Số hợp đồng chưa hợp lệ.');
  if(value.notes !== undefined && (typeof value.notes !== 'string' || value.notes.length>4000))throw new ContractProfileError('Ghi chú hợp đồng tối đa 4000 ký tự.');
  if(value.status !== undefined && !issuedStatus(value.status))throw new ContractProfileError('Trạng thái hợp đồng chưa hợp lệ.');
  if(!profile.customer || typeof profile.customer !== 'object' || Array.isArray(profile.customer) || Object.keys(profile.customer).some(key=>![...CUSTOMER_FIELDS,'relatives_json'].includes(key as never)) || CUSTOMER_FIELDS.some(key=>typeof profile.customer[key] !== 'string' || profile.customer[key].length>4000))throw new ContractProfileError('Thông tin khách hàng chưa hợp lệ.');
  const errors=validateOperationalCustomer(profile.customer,'api');
  if(Object.keys(errors).length)throw new ContractProfileError(Object.values(errors)[0]);
  if(!Array.isArray(profile.relatives) || profile.relatives.length !== 2)throw new ContractProfileError('Thông tin người thân chưa hợp lệ.');
  if(profile.relatives.some(relative=>!relative || typeof relative !== 'object' || Array.isArray(relative) || Object.keys(relative).some(key=>!['name','relationship','phone'].includes(key)) || ['name','relationship','phone'].some(key=>typeof relative[key as keyof typeof relative] !== 'string' || relative[key as keyof typeof relative].length>4000) || relative.phone && !/^\+?\d{9,13}$/.test(relative.phone.replace(/[\s.()-]/g,''))))throw new ContractProfileError('Thông tin người thân chưa hợp lệ.');
  for(const key of ['staff_id','staff_name','signed_on','authorization_date','collateral_description'] as const)if(typeof profile[key] !== 'string' || profile[key].length>4000)throw new ContractProfileError('Thông tin hồ sơ chưa hợp lệ.');
  for(const key of ['sales_staff_id','tls_staff_id'] as const)if(profile[key] !== undefined && (typeof profile[key] !== 'string' || profile[key] && !/^[1-9]\d{0,14}$/.test(profile[key])))throw new ContractProfileError('Nhân viên ghi nhận doanh số chưa hợp lệ.');
  for(const key of ['sales_staff_name','customer_source'] as const)if(profile[key] !== undefined && (typeof profile[key] !== 'string' || profile[key].length>191))throw new ContractProfileError('Tên NVKD và nguồn khách tối đa 191 ký tự.');
  if(profile.ownership_term_months !== undefined && !validOwnershipTerm(profile.ownership_term_months))throw new ContractProfileError('Phân loại thuê sở hữu chưa hợp lệ.');
  if(profile.created_on !== undefined && (typeof profile.created_on !== 'string' || !profile.created_on || !validIdentityIssueDate(profile.created_on)))throw new ContractProfileError('Ngày tạo / nhập hợp đồng chưa hợp lệ.');
  if(profile.staff_id && !/^[1-9]\d{0,14}$/.test(profile.staff_id) || !validIdentityIssueDate(profile.signed_on) || !validIdentityIssueDate(profile.authorization_date) || profile.document_requirements !== undefined && !validDocumentRequirements(profile.document_requirements))throw new ContractProfileError('Ngày ký, nhân viên hoặc yêu cầu hồ sơ chưa hợp lệ.');
  return {revision:value.revision,profile:structuredClone(profile),...(typeof value.contract_number==='string'?{contract_number:value.contract_number.trim()}:{}),...(typeof value.notes==='string'?{notes:value.notes}:{}),...(typeof value.status==='string'?{status:value.status}:{})};
}
export async function updateContractProfile(client:Pick<PoolClient,'query'>,id:number,actor:number,body:unknown) {
  const {revision,profile,contract_number,notes,status}=parseContractProfile(body);
  if(!Number.isSafeInteger(id) || id<=0 || !Number.isSafeInteger(actor) || actor<=0)throw new ContractProfileError('Mã hợp đồng chưa hợp lệ.');
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '15s'");
  const row=await client.query('SELECT order_status,store_id,contract_number,draft_reference,note,draft_payload,xmin::text AS revision FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id]);
  if(!row.rowCount)throw new ContractProfileError('Không tìm thấy hợp đồng.',404);
  const previous=row.rows[0],scope=dataAccess.getStore();
  if(scope && (scope.id!==actor || !canEditIssuedContract(scope,previous.store_id)))throw new ContractProfileError('Tài khoản chưa được cấp quyền sửa hợp đồng.',403);
  if(row.rows[0].revision !== revision)throw new ContractProfileError('Hợp đồng đã thay đổi; tải lại trước khi lưu hồ sơ.',409);
  if(row.rows[0].order_status === 'draft')throw new ContractProfileError('Lưu nháp để cập nhật hợp đồng này.',409);
  const code=contract_number??previous.contract_number;
  const nextStatus=status??previous.order_status;
  if(contract_number !== undefined && code!==previous.contract_number && !await contractNumberAvailable(client,code,id))throw new ContractProfileError('Số hợp đồng đã được sử dụng. Kiểm tra số HĐ giấy trước khi lưu.',409);
  if(profile.staff_id && !(await client.query(usesScopedDatabase()?'SELECT id FROM himoto.staff_for_contract($1)':'SELECT id FROM himoto.staff_profiles WHERE id=$1 FOR SHARE',[profile.staff_id])).rowCount) {
    if (!profile.staff_name.trim()) throw new ContractProfileError('Chọn lại hoặc tự nhập tên người làm hợp đồng.',409);
    profile.staff_id='';
  }
  const attribution:Record<string,{staff_id:number|null;name:string}>={};
  profile.sales_staff_name=profile.sales_staff_name?.trim() || '';
  for(const [key,department] of [['sales_staff_id','NVKD'],['tls_staff_id','TLS']] as const){
    if(profile[key]){
      const employee=await loadCommissionStaff(profile[key], department);
      if(!employee)throw new ContractProfileError(`Chọn nhân viên ${department === 'NVKD' ? 'NVKD hoặc TPKD' : department} đang hoạt động.`,409);
      attribution[department]=employee;
      if(department==='NVKD')profile.sales_staff_name=employee.name;
    }
  }
  // An explicit empty name also overrides a previous assignment when it is cleared.
  if(!profile.sales_staff_id)attribution.NVKD={staff_id:null,name:profile.sales_staff_name};
  const payload=previous.draft_payload||{},composer=payload.management_composer||{},at=new Date().toISOString();
  const nextNotes=notes??previous.note;
  const beforeCreatedOn=typeof composer.profile?.created_on==='string'?composer.profile.created_on:typeof composer.draft?.created_on==='string'?composer.draft.created_on:null;
  const edit={at,actor_id:actor,before:{contract_number:previous.contract_number,notes:previous.note,status:previous.order_status,created_on:beforeCreatedOn,profile:composer.profile||composer.draft||null},after:{contract_number:code,notes:nextNotes,status:nextStatus,created_on:profile.created_on??beforeCreatedOn,profile}};
  const updated={...payload,management_composer:{...composer,profile,profile_updated_by:actor,profile_updated_at:at,profile_attribution:attribution,
    ...(composer.draft?{draft:{...composer.draft,contract_number:code,...(profile.created_on?{created_on:profile.created_on}:{})}}:{}),
    contract_edits:[...(Array.isArray(composer.contract_edits)?composer.contract_edits:[]),edit]}};
  // Status and created_on are corrective labels only; money, vehicles and stock stay on their existing workflows.
  const result=await client.query(`UPDATE himoto.orders SET customer_name=$2,customer_phone=$3,customer_address=NULLIF($4,''),customer_idnumber=NULLIF($5,''),
    draft_payload=$6::json,updated_at=now(),contract_number=$7,
    draft_reference=CASE WHEN draft_reference=$8 THEN $7 ELSE draft_reference END,note=$9,contract_signed_on=NULLIF($10,'')::date,customer_source=COALESCE($11,customer_source),
    order_status=$12,
    created_at=CASE WHEN NULLIF($13,'') IS NULL THEN created_at ELSE ($13::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') END
    WHERE id=$1 RETURNING xmin::text AS revision`,[id,profile.customer.name,profile.customer.phone,profile.customer.address,profile.customer.id_card,JSON.stringify(updated),code,previous.contract_number,nextNotes,profile.signed_on,profile.customer_source?.trim(),nextStatus,profile.created_on||null]);
  return {revision:String(result.rows[0].revision),code:String(code||'')};
}
