import banks from './vietqr-banks.json';
import { normalizeRefundAccount,validRefundAccount } from './return-refunds';
import { bankBin } from './transfer-qr';

export const REFUND_RECIPIENT_KEYS=['recipient_bank','recipient_account','recipient_name'] as const;
export type RefundRecipient=Record<typeof REFUND_RECIPIENT_KEYS[number],string>;
export type RefundRecipientFields=Partial<RefundRecipient>;

function tlv(value:string):Record<string,string>|undefined {
  const fields:Record<string,string>={};let offset=0;
  while(offset<value.length){
    const header=value.slice(offset,offset+4);
    if(!/^\d{4}$/.test(header))return;
    const key=header.slice(0,2),length=Number(header.slice(2));offset+=4;
    if(!length||offset+length>value.length||key in fields)return;
    fields[key]=value.slice(offset,offset+length);offset+=length;
  }
  return fields;
}
export function vietQrCrc(value:string) {
  let crc=0xffff;
  for(const byte of new TextEncoder().encode(value)){
    crc^=byte<<8;for(let bit=0;bit<8;bit++)crc=(crc&0x8000)?(crc<<1)^0x1021:crc<<1;
    crc&=0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4,'0');
}
// Decode only NAPAS account transfers with a valid checksum. Never use the QR's amount.
export function parseRefundQr(value:string):RefundRecipientFields|undefined {
  if(value.length>2048||!/^6304[0-9a-f]{4}$/i.test(value.slice(-8)))return;
  if(vietQrCrc(value.slice(0,-4))!==value.slice(-4).toUpperCase())return;
  const fields=tlv(value),provider=fields?.['38']&&tlv(fields['38']);
  if(!fields||fields['00']!=='01'||fields['58']!=='VN'||fields['53']!=='704'||!provider||provider['00']!=='A000000727'||provider['02']!=='QRIBFTTA')return;
  const beneficiary=provider['01']&&tlv(provider['01']);
  if(!beneficiary||!validRefundAccount(beneficiary['01']||''))return;
  const bank=banks.find(bank=>bank.bin===beneficiary['00']);
  if(!bank)return;
  return {recipient_bank:bank.shortName,recipient_account:normalizeRefundAccount(beneficiary['01'])};
}
export async function decodeRefundQr(file:File):Promise<RefundRecipientFields|undefined> {
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();image.src=url;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)return;
    context.drawImage(image,0,0);
    const pixels=context.getImageData(0,0,canvas.width,canvas.height),{default:jsQR}=await import('jsqr');
    const result=jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'});
    return result?parseRefundQr(result.data):undefined;
  }finally{URL.revokeObjectURL(url);}
}
export function combineRefundRecipient(qr:RefundRecipientFields|undefined,ai:RefundRecipientFields):RefundRecipientFields {
  if(!qr)return ai;
  // A printed account/bank that disagrees with the decoded QR cannot name its owner.
  const mismatch=ai.recipient_account&&normalizeRefundAccount(ai.recipient_account)!==qr.recipient_account
    ||ai.recipient_bank&&bankBin(ai.recipient_bank)!==bankBin(qr.recipient_bank||'');
  return {...(!mismatch?ai:{}),...qr};
}
export function mergeRefundRecipient(current:RefundRecipient,fields:RefundRecipientFields,before:RefundRecipient):RefundRecipient {
  if(current.recipient_account!==before.recipient_account||current.recipient_bank!==before.recipient_bank)return current;
  if(before.recipient_account&&!fields.recipient_account)return current;
  const next={...current};
  // A newly scanned account cannot inherit missing bank/owner fields from the previous account.
  if(fields.recipient_account&&normalizeRefundAccount(fields.recipient_account)!==normalizeRefundAccount(before.recipient_account))
    for(const key of ['recipient_bank','recipient_name'] as const)if(!fields[key]&&current[key]===before[key])next[key]='';
  for(const key of REFUND_RECIPIENT_KEYS)if(fields[key]&&current[key]===before[key])next[key]=fields[key]!;
  return next;
}
