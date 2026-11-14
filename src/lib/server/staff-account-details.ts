import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { canRecoverAccountPasswords, type PermissionAccount } from '@/lib/management/permissions';
import { AccountAccessError, requireAccountScope } from './account-management';
import { hash } from 'bcryptjs';
import { AccountPasswordError, rememberAccountPassword, validateNewPassword } from './account-passwords';

export async function readStaffAccountDetails(db: Pick<PoolClient, 'query'>, actor: PermissionAccount, staffId: number) {
  requireAccountScope(actor);
  if (!Number.isSafeInteger(staffId) || staffId <= 0) throw new AccountAccessError('Mã nhân sự không hợp lệ.');
  const result = await db.query(`SELECT DISTINCT u.id,COALESCE(NULLIF(a.login_name,''),u.email) AS login_name,
      (u.status='active' AND COALESCE(a.enabled,true)) AS enabled,
      u.password AS password_hash,pw.password_fingerprint,u.xmin::text AS user_revision,COALESCE(a.xmin::text,'0') AS access_revision
    FROM himoto.staff_account_attribution p JOIN himoto.users u ON u.id=p.user_id
    LEFT JOIN himoto.management_account_access a ON a.user_id=u.id
    LEFT JOIN himoto.management_account_passwords pw ON pw.user_id=u.id
    WHERE p.id=$1 AND u.deleted_at IS NULL AND COALESCE(a.login_name,'')<>'system.sepay'
    ORDER BY u.id`, [staffId]);
  return result.rows.map(row => ({
    id: Number(row.id), login_name: String(row.login_name || ''), enabled: row.enabled === true,
    revision: `${row.user_revision}:${row.access_revision}`,
    password_available: canRecoverAccountPasswords(actor) && typeof row.password_hash === 'string' &&
      row.password_fingerprint === createHash('sha256').update(row.password_hash).digest('hex'),
  }));
}

export function parseStaffAccountEdit(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new AccountAccessError('Thông tin tài khoản không hợp lệ.');
  const body = raw as Record<string, unknown>;
  if (Object.keys(body).some(key => !['account_id','login_name','password','confirmation','revision'].includes(key)) ||
    !Number.isSafeInteger(body.account_id) || Number(body.account_id) < 1 || typeof body.login_name !== 'string' ||
    typeof body.revision !== 'string' || !/^\d{1,20}:\d{1,20}$/.test(body.revision) ||
    (body.password !== undefined && typeof body.password !== 'string') ||
    (body.confirmation !== undefined && typeof body.confirmation !== 'string')) throw new AccountAccessError('Kiểm tra tài khoản và phiên bản dữ liệu.');
  const login = body.login_name.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,80}$/.test(login)) throw new AccountAccessError('Tên đăng nhập cần 3–80 ký tự, chỉ gồm chữ không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới.');
  const password = (body.password as string | undefined) || '';
  if (password) {
    validateNewPassword(password);
    if (password !== body.confirmation) throw new AccountPasswordError('Nhập lại mật khẩu mới chưa khớp.');
  } else if (body.confirmation) throw new AccountPasswordError('Nhập mật khẩu mới trước khi xác nhận.');
  return { account_id: Number(body.account_id), login_name: login, password, revision: body.revision };
}

/** Caller owns the transaction: account, recovery copy and audit commit together. */
export async function updateStaffAccountDetails(db: Pick<PoolClient, 'query'>, actor: PermissionAccount, staffId: number, raw: unknown) {
  requireAccountScope(actor);
  if (!Number.isSafeInteger(staffId) || staffId <= 0) throw new AccountAccessError('Mã nhân sự không hợp lệ.');
  const input = parseStaffAccountEdit(raw);
  if (input.password && !canRecoverAccountPasswords(actor)) throw new AccountPasswordError('Tài khoản không có quyền đặt mật khẩu cho nhân sự.', 403);
  await db.query("SET LOCAL lock_timeout='5s'");
  await db.query("SET LOCAL statement_timeout='15s'");
  // Serialize with account-management and staff-account creation to prevent duplicate aliases.
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['management-accounts']);
  const result = await db.query(`SELECT u.id,u.xmin::text AS user_revision,a.xmin::text AS access_revision,a.login_name
    FROM himoto.users u JOIN himoto.management_account_access a ON a.user_id=u.id
    WHERE u.id=$2 AND u.deleted_at IS NULL AND EXISTS (
      SELECT 1 FROM himoto.staff_account_attribution p WHERE p.id=$1 AND p.user_id=u.id
    ) FOR UPDATE OF u,a`, [staffId, input.account_id]);
  const current = result.rows[0];
  if (!current) throw new AccountAccessError('Không tìm thấy tài khoản được quản lý liên kết với nhân sự này.', 404);
  if (current.login_name === 'system.sepay' || input.login_name === 'system.sepay') throw new AccountAccessError('Không được sửa hoặc sử dụng tài khoản tích hợp.', 403);
  if (`${current.user_revision}:${current.access_revision}` !== input.revision) throw new AccountAccessError('Tài khoản đã thay đổi. Tải lại trước khi sửa.', 409);
  const duplicate = await db.query('SELECT 1 FROM himoto.management_account_access WHERE lower(login_name)=$1 AND user_id<>$2', [input.login_name, input.account_id]);
  if (duplicate.rowCount) throw new AccountAccessError('Tên đăng nhập đã tồn tại. Chọn tên khác.', 409);
  await db.query('UPDATE himoto.management_account_access SET login_name=$2,updated_by=$3,updated_at=now() WHERE user_id=$1', [input.account_id, input.login_name, actor.id]);
  if (input.password) {
    const passwordHash = await hash(input.password, 12);
    await db.query('UPDATE himoto.users SET password=$2,updated_at=now() WHERE id=$1', [input.account_id, passwordHash]);
    await rememberAccountPassword(db, input.account_id, input.password, passwordHash, Number(actor.id), 'reset');
  }
  await db.query(`INSERT INTO himoto.management_access_audit(actor_id,target_user_id,action,before_value,after_value)
    VALUES($1,$2,'staff_account_update',$3::jsonb,$4::jsonb)`, [actor.id, input.account_id, JSON.stringify({ login_name: current.login_name }), JSON.stringify({ login_name: input.login_name, staff_id: staffId, password_changed: Boolean(input.password) })]);
  return { id: input.account_id, password_changed: Boolean(input.password) };
}
