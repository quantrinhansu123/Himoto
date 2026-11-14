type Recipient={bank:string;recipientAccount:string;recipientName:string};
type Fields=Partial<Record<'recipient_bank'|'recipient_account'|'recipient_name',string>>;
/** Never overwrite edits made while QR/OCR was running, or inherit another account's owner. */
export function mergeMobileRefundRecipient<T extends Recipient>(current:T,fields:Fields,before:Recipient):T{
  if(current.bank!==before.bank||current.recipientAccount!==before.recipientAccount)return current;
  const next={...current};
  if(fields.recipient_account&&fields.recipient_account.replace(/\s/g,'')!==before.recipientAccount.replace(/\s/g,'')){
    if(!fields.recipient_bank&&current.bank===before.bank)next.bank='';
    if(!fields.recipient_name&&current.recipientName===before.recipientName)next.recipientName='';
  }
  for(const[from,to]of [['recipient_bank','bank'],['recipient_account','recipientAccount'],['recipient_name','recipientName']]as const)if(fields[from]&&current[to]===before[to])next[to]=fields[from]!;
  return next;
}
