import 'server-only';
import { createCipheriv,createDecipheriv,createHash,randomBytes } from 'node:crypto';
import { compare,hash } from 'bcryptjs';
import type { PoolClient } from 'pg';
import { canRecoverAccountPasswords,type PermissionAccount } from '@/lib/management/permissions';

type Database=Pick<PoolClient,'query'>;
export class AccountPasswordError extends Error {constructor(message:string,public status=400){super(message);}}
export function validateNewPassword(value:unknown):string {
  if(typeof value!=='string'||value.length<8||value.length>128||Buffer.byteLength(value,'utf8')>72)throw new AccountPasswordError('Mật khẩu cần ít nhất 8 ký tự và không quá 72 byte.');
  return value;
}
const fingerprint=(passwordHash:string)=>createHash('sha256').update(passwordHash).digest('hex');
function key(){const secret=process.env.MANAGEMENT_SESSION_SECRET;if(!secret||secret.length<32)throw new Error('Thiếu khóa bảo vệ mật khẩu.');return createHash('sha256').update('himoto-account-passwords-v1:'+secret).digest();}
export function sealAccountPassword(id:number,password:string){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from(`himoto-account-password:${id}`));
  const body=Buffer.concat([cipher.update(password,'utf8'),cipher.final()]);
  return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),body.toString('base64url')].join('.');
}
export function openAccountPassword(id:number,sealed:string){
  const [version,iv,tag,body,...extra]=sealed.split('.');
  if(version!=='v1'||!iv||!tag||!body||extra.length)throw new Error('Bản lưu mật khẩu chưa hợp lệ.');
  const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'base64url'));decipher.setAAD(Buffer.from(`himoto-account-password:${id}`));decipher.setAuthTag(Buffer.from(tag,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(body,'base64url')),decipher.final()]).toString('utf8');
}
export async function rememberAccountPassword(db:Database,id:number,password:string,passwordHash:string,actor:number,kind:'create'|'change'|'reset'){
  await db.query(`INSERT INTO himoto.management_account_passwords(user_id,password_cipher,password_fingerprint,changed_by,change_kind)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET password_cipher=EXCLUDED.password_cipher,password_fingerprint=EXCLUDED.password_fingerprint,
    changed_by=EXCLUDED.changed_by,change_kind=EXCLUDED.change_kind,changed_at=clock_timestamp()`,[id,sealAccountPassword(id,password),fingerprint(passwordHash),actor,kind]);
}
function requireRecovery(actor:PermissionAccount){if(!canRecoverAccountPasswords(actor))throw new AccountPasswordError('Chỉ tài khoản quanlyvanhanh được xem hoặc đặt lại mật khẩu.',403);}
async function lockTarget(db:Database,id:number){
  if(!Number.isSafeInteger(id)||id<1)throw new AccountPasswordError('Mã tài khoản không hợp lệ.');
  const target=(await db.query(`SELECT u.id,u.password,u.status,u.xmin::text AS revision,u.management_password_version,a.login_name,a.enabled
    FROM himoto.users u LEFT JOIN himoto.management_account_access a ON a.user_id=u.id WHERE u.id=$1 AND u.deleted_at IS NULL FOR UPDATE OF u`,[id])).rows[0];
  if(!target)throw new AccountPasswordError('Không tìm thấy tài khoản.',404);
  if(target.login_name==='system.sepay')throw new AccountPasswordError('Không thay đổi mật khẩu tài khoản tích hợp.',403);
  return target;
}
export async function revealAccountPassword(db:Database,actor:PermissionAccount,id:number){
  requireRecovery(actor);
  const target=await lockTarget(db,id),stored=(await db.query('SELECT password_cipher,password_fingerprint,changed_at FROM himoto.management_account_passwords WHERE user_id=$1',[id])).rows[0];
  if(!stored||stored.password_fingerprint!==fingerprint(target.password))throw new AccountPasswordError('Mật khẩu cũ chỉ lưu dạng băm; cần đặt lại để có bản lưu mới.',409);
  const password=openAccountPassword(id,stored.password_cipher);
  await db.query("INSERT INTO himoto.management_access_audit(actor_id,target_user_id,action,after_value) VALUES($1,$2,'password_reveal','{}'::jsonb)",[actor.id,id]);
  return {id,password,changed_at:stored.changed_at,revision:target.revision};
}
export async function resetAccountPassword(db:Database,actor:PermissionAccount,id:number,revision:string,value:unknown){
  requireRecovery(actor);const password=validateNewPassword(value);
  await db.query("SET LOCAL lock_timeout='5s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['management-accounts']);
  const target=await lockTarget(db,id);
  if(!revision||target.revision!==revision)throw new AccountPasswordError('Tài khoản đã thay đổi. Tải lại danh sách trước khi đặt lại mật khẩu.',409);
  const passwordHash=await hash(password,12);
  const updated=(await db.query(`UPDATE himoto.users SET password=$2,updated_at=now() WHERE id=$1 RETURNING management_password_version,management_password_changed_at`,[id,passwordHash])).rows[0];
  await rememberAccountPassword(db,id,password,passwordHash,Number(actor.id),'reset');
  await db.query("INSERT INTO himoto.management_access_audit(actor_id,target_user_id,action,after_value) VALUES($1,$2,'password_reset','{\"password_changed\":true}'::jsonb)",[actor.id,id]);
  return {id,password_version:Number(updated.management_password_version),changed_at:updated.management_password_changed_at};
}
export async function changeOwnPassword(db:Database,actorId:number,current:unknown,value:unknown,confirmation:unknown){
  const password=validateNewPassword(value);
  if(typeof current!=='string'||!current||current.length>256)throw new AccountPasswordError('Nhập mật khẩu hiện tại.');
  if(password!==confirmation)throw new AccountPasswordError('Nhập lại mật khẩu mới chưa khớp.');
  if(password===current)throw new AccountPasswordError('Mật khẩu mới cần khác mật khẩu hiện tại.');
  await db.query("SET LOCAL lock_timeout='5s'");
  const target=await lockTarget(db,actorId);
  if(target.status!=='active'||target.enabled===false)throw new AccountPasswordError('Tài khoản không còn được phép đăng nhập.',403);
  if(!await compare(current,String(target.password).replace(/^\$2y\$/,'$2b$')))throw new AccountPasswordError('Mật khẩu hiện tại không đúng.');
  const passwordHash=await hash(password,12);
  const updated=(await db.query('UPDATE himoto.users SET password=$2,updated_at=now() WHERE id=$1 RETURNING management_password_version,management_password_changed_at',[actorId,passwordHash])).rows[0];
  await rememberAccountPassword(db,actorId,password,passwordHash,actorId,'change');
  await db.query("INSERT INTO himoto.management_access_audit(actor_id,target_user_id,action,after_value) VALUES($1,$1,'password_change','{\"password_changed\":true}'::jsonb)",[actorId]);
  return {password_version:Number(updated.management_password_version),changed_at:updated.management_password_changed_at};
}
