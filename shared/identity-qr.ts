export interface IdentityQrScan {
  fields: {id_card:string;name:string;id_card_issued_on:string};
  identifiers:string[];
}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function isIdentityQrScan(value:unknown):value is IdentityQrScan {
  if(!object(value)||Object.keys(value).some(key=>!['fields','identifiers'].includes(key))||!object(value.fields))return false;
  const fields=value.fields;
  if(Object.keys(fields).length!==3||!Object.keys(fields).every(key=>['id_card','name','id_card_issued_on'].includes(key))||
    typeof fields.id_card!=='string'||!/^\d{12}$/.test(fields.id_card)||typeof fields.name!=='string'||!fields.name.trim()||fields.name.length>255||/\p{Cc}/u.test(fields.name)||
    typeof fields.id_card_issued_on!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(fields.id_card_issued_on))return false;
  const date=Date.parse(fields.id_card_issued_on+'T00:00:00Z');
  return Number.isFinite(date)&&new Date(date).toISOString().slice(0,10)===fields.id_card_issued_on&&
    Array.isArray(value.identifiers)&&value.identifiers.length>=1&&value.identifiers.length<=2&&value.identifiers.includes(fields.id_card)&&
    value.identifiers.every(id=>typeof id==='string'&&(id===fields.id_card||/^\d{9}$/.test(id)))&&new Set(value.identifiers).size===value.identifiers.length;
}
export function identityQrMatches(scan:IdentityQrScan,expected:string) {
  const id=expected.trim();return !/^(\d{9}|\d{12})$/.test(id)||scan.identifiers.includes(id);
}
export function identityQrMessage(value:unknown,nonce:string):IdentityQrScan|null {
  if(typeof value!=='string'||value.length>4096||!/^[0-9a-f-]{36}$/.test(nonce))return null;
  try{const message:unknown=JSON.parse(value);return object(message)&&message.type==='himoto.identity-qr.v1'&&message.nonce===nonce&&isIdentityQrScan(message.scan)?message.scan:null;}catch{return null;}
}
/** Android WebMessageListener supplies sourceOrigin; older Android/iOS supply the full page URL. */
export function identityQrSourceAllowed(source:string,page:string):boolean {
  try {
    const expected=new URL(page);
    return expected.protocol==='https:'&&(source===expected.href||source===expected.origin||source===expected.origin+'/');
  }catch{return false;}
}
