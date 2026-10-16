import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { ContractType } from '@/lib/management/contract-types';
import type { ContractDraft } from '@/lib/management/contract-document';

type Database = Pick<PoolClient, 'query'>;
export class ContractTypeError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const validContractTypeId = (id: unknown): id is string => typeof id === 'string' && /^[a-z0-9_-]{1,80}$/.test(id);
const fields = 'id,label,rental_type,term_months,active,xmin::text AS revision';
export async function listContractTypes(database: Database): Promise<ContractType[]> {
  return (await database.query(`SELECT ${fields} FROM himoto.management_contract_types ORDER BY position,created_at,id`)).rows;
}
export function parseContractType(input: unknown, editing = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ContractTypeError('Thông tin loại hợp đồng không hợp lệ.');
  const body = input as Record<string, unknown>;
  const allowed = editing ? ['id','revision','label','active'] : ['label','rental_type','term_months','active'];
  if (Object.keys(body).some(key => !allowed.includes(key)) || typeof body.label !== 'string' || typeof body.active !== 'boolean') throw new ContractTypeError('Thông tin loại hợp đồng không hợp lệ.');
  const label = body.label.trim().normalize('NFC');
  if (!label || label.length > 80 || [...label].some(char=>char.charCodeAt(0)<32 || char.charCodeAt(0)===127)) throw new ContractTypeError('Nhập tên loại hợp đồng từ 1 đến 80 ký tự.');
  if (editing) {
    if (!validContractTypeId(body.id) || typeof body.revision !== 'string' || !/^\d{1,20}$/.test(body.revision)) throw new ContractTypeError('Phiên bản loại hợp đồng không hợp lệ.');
    return { id: body.id, revision: body.revision, label, active: body.active };
  }
  if (!['daily','monthly','ownership'].includes(String(body.rental_type)) || body.term_months !== null && (!Number.isSafeInteger(body.term_months) || Number(body.term_months) < 1 || Number(body.term_months) > 120) || body.rental_type === 'daily' && body.term_months !== null) throw new ContractTypeError('Chọn cách tính tiền và thời hạn từ 1 đến 120 tháng, hoặc để trống thời hạn.');
  return { label, active: body.active, rental_type: String(body.rental_type), term_months: body.term_months as number | null };
}
export async function saveContractType(database: Database, raw: unknown, actorId: number, editing = false) {
  const input = parseContractType(raw, editing);
  if ('id' in input) {
    const result = await database.query(`UPDATE himoto.management_contract_types SET label=$1,active=$2,updated_by=$3,updated_at=now() WHERE id=$4 AND xmin::text=$5 RETURNING id`,[input.label,input.active,actorId,input.id,input.revision]);
    if (!result.rowCount) throw new ContractTypeError('Loại hợp đồng đã thay đổi. Làm mới danh sách rồi thử lại.',409);
  } else {
    await database.query(`INSERT INTO himoto.management_contract_types(id,label,rental_type,term_months,active,position,created_by,updated_by) VALUES($1,$2,$3,$4,$5,100,$6,$6)`,[`custom_${randomUUID()}`,input.label,input.rental_type,input.term_months,input.active,actorId]);
  }
  return listContractTypes(database);
}
export async function resolveDraftContractType(database: Database, draft: ContractDraft, rentalType: string, previous?: Pick<ContractDraft,'contract_type_id'|'contract_type_name'|'contract_type_months'>) {
  if (!draft.contract_type_id && previous?.contract_type_id?.startsWith('custom_')) draft.contract_type_id = previous.contract_type_id;
  if (!draft.contract_type_id) return;
  if (!validContractTypeId(draft.contract_type_id)) throw new ContractTypeError('Loại hợp đồng đã chọn không hợp lệ.');
  const result = await database.query(`SELECT ${fields} FROM himoto.management_contract_types WHERE id=$1 FOR SHARE`,[draft.contract_type_id]);
  const type = result.rows[0] as ContractType | undefined;
  const keep = previous?.contract_type_id === draft.contract_type_id;
  if (!type || !type.active && !keep) throw new ContractTypeError('Loại hợp đồng đã ẩn hoặc không còn tồn tại. Chọn loại khác.',409);
  if (type.rental_type !== rentalType) throw new ContractTypeError('Cách tính tiền không khớp loại hợp đồng đã chọn.',409);
  if (type.id.startsWith('custom_') && (type.rental_type === 'monthly' && draft.package_name !== 'Theo tháng' || type.rental_type === 'daily' && !['Theo ngày','Theo tuần'].includes(draft.package_name))) throw new ContractTypeError('Gói thuê không khớp cách tính tiền của loại hợp đồng.',409);
  draft.contract_type_name = keep && previous?.contract_type_name ? previous.contract_type_name : type.label;
  draft.contract_type_months = keep ? previous?.contract_type_months || '' : type.term_months === null ? '' : String(type.term_months);
}
