import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { ContractType } from '@/lib/management/contract-types';
import type { ContractDraft } from '@/lib/management/contract-document';

type Database = Pick<PoolClient, 'query'>;
import { ContractTypeError,validContractTypeId,parseContractType } from '../../../shared/contract-types';
export { ContractTypeError,validContractTypeId,parseContractType } from '../../../shared/contract-types';
const fields = 'id,label,rental_type,term_months,active,xmin::text AS revision';
export async function listContractTypes(database: Database): Promise<ContractType[]> {
  return (await database.query(`SELECT ${fields} FROM himoto.management_contract_types ORDER BY position,created_at,id`)).rows;
}
export async function saveContractTypeRecord(database: Database, raw: unknown, actorId: number, editing = false) {
  const input = parseContractType(raw, editing);
  let id: string;
  if (input.id !== undefined) {
    const result = await database.query(`UPDATE himoto.management_contract_types SET label=$1,active=$2,updated_by=$3,updated_at=now() WHERE id=$4 AND xmin::text=$5 RETURNING id`,[input.label,input.active,actorId,input.id,input.revision]);
    if (!result.rowCount) throw new ContractTypeError('Loại hợp đồng đã thay đổi. Làm mới danh sách rồi thử lại.',409);
    id=input.id;
  } else {
    id=`custom_${randomUUID()}`;
    await database.query(`INSERT INTO himoto.management_contract_types(id,label,rental_type,term_months,active,position,created_by,updated_by) VALUES($1,$2,$3,$4,$5,100,$6,$6)`,[id,input.label,input.rental_type,input.term_months,input.active,actorId]);
  }
  return { id, types: await listContractTypes(database) };
}
export async function saveContractType(database: Database, raw: unknown, actorId: number, editing = false) {
  return (await saveContractTypeRecord(database,raw,actorId,editing)).types;
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
