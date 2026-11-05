import { OWNERSHIP_TELEGRAM_DESTINATIONS } from './telegram-destinations';
export class IntegrationSettingsError extends Error {constructor(message:string,public status=400){super(message);}}
const text=(value:unknown,max:number)=>typeof value==='string'&&value.trim().length<=max?value.trim():'';
export function parseIntegrationSettings(raw:unknown){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new IntegrationSettingsError('Cấu hình không hợp lệ.');
  const body=raw as Record<string,unknown>;
  if(body.action==='gps_account') {
    const provider=body.provider,username=text(body.username,191),label=text(body.label,191);
    if(!['protrack','iopgps'].includes(String(provider))||!username||!label||typeof body.password!=='string'||!body.password||body.password.length>256)throw new IntegrationSettingsError('Nhập nền tảng, tên gợi nhớ, tài khoản và mật khẩu GPS.');
    return {action:'gps_account' as const,provider:String(provider) as 'protrack'|'iopgps',label,username,password:body.password};
  }
  if(body.action==='gps_enabled') {
    if(typeof body.id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.id)||typeof body.enabled!=='boolean')throw new IntegrationSettingsError('Tài khoản GPS không hợp lệ.');
    return {action:'gps_enabled' as const,id:body.id,enabled:body.enabled};
  }
  if(body.action!=='telegram')throw new IntegrationSettingsError('Thao tác cấu hình không hợp lệ.');
  const token=text(body.token,200),groups=body.groups;
  if(token&&!/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/.test(token))throw new IntegrationSettingsError('Bot token Telegram không đúng định dạng.');
  if(!Array.isArray(groups)||groups.length>100)throw new IntegrationSettingsError('Danh sách phòng giao dịch không hợp lệ.');
  const parsed=groups.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw new IntegrationSettingsError('Cấu hình nhóm không hợp lệ.');
    const row=item as Record<string,unknown>,storeId=Number(row.store_id),chatId=text(row.chat_id,40),thread=row.thread_id==null||row.thread_id===''?null:Number(row.thread_id);
    if(!Number.isSafeInteger(storeId)||storeId<1||typeof row.enabled!=='boolean'||chatId&&!/^-\d{5,18}$/.test(chatId)||row.enabled&&!chatId||thread!==null&&(!Number.isSafeInteger(thread)||thread<1))throw new IntegrationSettingsError('Kiểm tra cơ sở, chat_id nhóm (số âm) và mã chủ đề Telegram.');
    return {storeId,chatId,thread,enabled:row.enabled};
  });
  if(new Set(parsed.map(group=>group.storeId)).size!==parsed.length)throw new IntegrationSettingsError('Mỗi cơ sở chỉ cấu hình một nhóm.');
  // Older clients omit this field; saving branch groups must preserve the ownership routes.
  const ownership=body.ownership_groups;
  if(ownership!==undefined&&(!Array.isArray(ownership)||ownership.length>2))throw new IntegrationSettingsError('Thuê sở hữu có hai nhóm: hợp đồng mới và gia hạn.');
  const parsedOwnership=(ownership as unknown[]|undefined)?.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw new IntegrationSettingsError('Cấu hình nhóm thuê sở hữu không hợp lệ.');
    const row=item as Record<string,unknown>,route=String(row.route),chatId=text(row.chat_id,40),thread=row.thread_id==null||row.thread_id===''?null:Number(row.thread_id);
    if(!OWNERSHIP_TELEGRAM_DESTINATIONS.some(item=>item.route===route)||typeof row.enabled!=='boolean'||chatId&&!/^-\d{5,18}$/.test(chatId)||row.enabled&&!chatId||thread!==null&&(!Number.isSafeInteger(thread)||thread<1||thread>2147483647))throw new IntegrationSettingsError('Kiểm tra nhóm ký mới / gia hạn sở hữu, chat_id và mã chủ đề Telegram.');
    return {route,chatId,thread,enabled:row.enabled};
  });
  if(parsedOwnership&&new Set(parsedOwnership.map(group=>group.route)).size!==parsedOwnership.length)throw new IntegrationSettingsError('Mỗi nghiệp vụ sở hữu chỉ cấu hình một nhóm.');
  return {action:'telegram' as const,token,groups:parsed,ownership:parsedOwnership};
}
