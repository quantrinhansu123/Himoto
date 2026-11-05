import 'server-only';
import type { PoolClient } from 'pg';
import { hasPermission,type PermissionAccount } from '@/lib/management/permissions';
import { deleteContractDraft,DraftDeleteError } from './contract-draft-delete';
import { auditContractDeletion } from './contract-deletion-audit';

export async function deleteContractRecord(db:Pick<PoolClient,'query'>,id:number,revision:unknown,user:PermissionAccount) {
  if(!hasPermission(user,'contracts.delete'))throw new DraftDeleteError('Chỉ Admin hoặc kế toán được cấp quyền xóa hợp đồng.',403);
  if(typeof revision!=='string'||!/^\d{1,20}$/.test(revision))throw new DraftDeleteError('Tải lại hợp đồng trước khi xóa.');
  const row=(await db.query('SELECT id,store_id,order_status,contract_number,xmin::text AS revision FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id])).rows[0];
  if(!row||!user.scope_all&&user.access_role!=='admin'&&Number(row.store_id)!==Number(user.store_id))throw new DraftDeleteError('Không tìm thấy hợp đồng trong phạm vi được phép.',404);
  if(row.revision!==revision)throw new DraftDeleteError('Hợp đồng đã thay đổi. Tải lại trước khi xóa.',409);
  if(row.order_status==='draft'){await deleteContractDraft(db,id,revision,Number(user.id));return;}
  if(row.order_status!=='completed')throw new DraftDeleteError('Chỉ xóa bản nháp hoặc ẩn hợp đồng đã hoàn thành. Hợp đồng đang thuê phải được xử lý trả xe trước.',409);
  await auditContractDeletion(db,id,Number(user.id),row.contract_number,'hidden');
  await db.query(`UPDATE himoto.orders SET deleted_at=now(),updated_at=now(),draft_payload=jsonb_set(COALESCE(draft_payload::jsonb,'{}'::jsonb),'{management_composer}',
    COALESCE(draft_payload::jsonb->'management_composer','{}'::jsonb)||jsonb_build_object('deletion',jsonb_build_object('actor_id',$2::bigint,'actor_name',(SELECT name FROM himoto.users WHERE id=$2),'at',now(),'mode','hidden')),true)::json WHERE id=$1`,[id,user.id]);
}
