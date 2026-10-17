import 'server-only';
import { createCipheriv,createDecipheriv,createHash,randomBytes } from 'node:crypto';

function key() {
  const secret=process.env.MANAGEMENT_SESSION_SECRET;
  if(!secret||secret.length<32)throw new Error('Thiếu khóa mã hóa tích hợp.');
  return createHash('sha256').update('himoto-integrations-v1:'+secret).digest();
}
export function sealIntegrationSecret(value:unknown) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);
  const body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),body.toString('base64url')].join('.');
}
export function openIntegrationSecret<T>(value:string):T {
  const [version,iv,tag,body]=value.split('.');
  if(version!=='v1'||!iv||!tag||!body)throw new Error('Dữ liệu tích hợp chưa hợp lệ.');
  const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'base64url'));
  decipher.setAuthTag(Buffer.from(tag,'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body,'base64url')),decipher.final()]).toString('utf8')) as T;
}
