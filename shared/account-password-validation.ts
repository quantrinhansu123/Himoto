const utf8PasswordBytes=(value:string)=>{let bytes=0;for(const char of value){const point=char.codePointAt(0)!;bytes+=point<=0x7f?1:point<=0x7ff?2:point<=0xffff?3:4;}return bytes;};
export class AccountPasswordError extends Error {constructor(message:string,public status=400){super(message);}}
export function validateNewPassword(value:unknown):string {
  if(typeof value!=='string'||value.length<8||value.length>128||utf8PasswordBytes(value)>72)throw new AccountPasswordError('Mật khẩu cần ít nhất 8 ký tự và không quá 72 byte.');
  return value;
}
