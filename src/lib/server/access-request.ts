import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { hasPermission, type AccessPermission } from '@/lib/management/permissions';
import { dataAccess } from './access-context';
import { SESSION_COOKIE, sameOrigin, userFromSession } from './management-session';

export function requestPermission(path:string,method:string,action=''):AccessPermission|null {
  const read=method==='GET';
  if(path.startsWith('/api/auth/accounts'))return 'accounts.manage';
  if(path==='/api/auth/store-directory')return null;
  if(path==='/api/auth/contract-staff')return 'contracts.read';
  if(path.startsWith('/api/auth/integrations'))return 'settings.write';
  if(path.startsWith('/api/auth/gps'))return path.endsWith('/refresh')||read?'vehicles.read':'settings.write';
  if(path==='/api/auth/debt-reminders'||path.endsWith('/debt-reminder'))return 'contracts.read';
  if(path.includes('/sepay/settings'))return read?'finance.read':'settings.write';
  if(path.includes('/payment-intents')||path.includes('/payment-events'))return read?'contracts.read':'contracts.draft';
  if(path.includes('/photo-uploads'))return null;
  if(path.includes('/photo-ocr'))return 'customers.write';
  if(path.endsWith('/telegram'))return 'contracts.read'; // Mutation checks the selected transaction's operation permission inside the handler.
  if(path.includes('/record-photos/'))return path.includes('/customers/')?(read?'customers.read':'customers.write'):read?'contracts.read':/\/renewal-(?:receipt-)?\d+-(?:[1-9]|1[0-5]|video-[1-3]|document-(?:[1-9]|1[0-5]))$/.test(path)?'contracts.renew':/\/return-\d+-(?:[1-9]|1[0-5]|video-[1-3]|document-(?:[1-9]|1[0-5]))$/.test(path)?'contracts.return':/\/handover-(?:[1-9]|1[0-5]|video-[1-3]|document-(?:[1-9]|1[0-5]))$/.test(path)?'contracts.finalize':'contracts.draft';
  if(path.includes('/bulk-delete/')||path.includes('/import')||path.includes('/match-stores')||path.includes('/backups')||path.includes('/reset')||path.includes('/contract-types'))return read?'contracts.read':'settings.write';
  if(path.includes('/stores/managers'))return 'contracts.read';
  if(path.includes('/stores'))return read?'contracts.read':'settings.write';
  if(path.includes('/hr/staff')||path.includes('/duty-roster'))return read?'hr.read':'hr.write';
  if(path.includes('/cashbook')||path.includes('/banks')||path.includes('/cash'))return read?'finance.read':'finance.write';
  if(path.includes('/customers/'))return read?'customers.read':'customers.write';
  if(path==='/api/auth/customers')return read?'customers.read':'customers.write';
  if(path.includes('/vehicles/')&&path.endsWith('/actions'))return action==='transfer'?'vehicles.transfer':action==='receive'?'vehicles.receive':'vehicles.write';
  if(path.includes('/vehicle/')||path.includes('/vehicles'))return read?'vehicles.read':'vehicles.write';
  if(path.includes('/returns'))return read?'contracts.read':'contracts.return';
  if(path.includes('/staff-sales'))return 'contracts.read';
  if(path.includes('/order/car-rental/')) {
    if(path.endsWith('/payments'))return read?'contracts.read':'finance.write';
    if(path.endsWith('/finalize')||path.endsWith('/handover'))return 'contracts.finalize';
    if(path.endsWith('/profile')&&!read)return 'contracts.finalize';
    if(path.endsWith('/renewals'))return 'contracts.renew';
  }
  if(path.includes('/order/car-rental')||path.includes('/battery-contracts'))return read?'contracts.read':'contracts.draft';
  return 'settings.write'; // New endpoints fail closed until explicitly assigned.
}
export function withAccessRequest<C>(handler:(request:NextRequest,context:C)=>Promise<Response>|Response) {
  return async(request:NextRequest,context:C):Promise<Response>=>{
    if(request.method!=='GET'&&!sameOrigin(request))return NextResponse.json({status:'error',message:'Yêu cầu không hợp lệ.'},{status:403});
    const user=await userFromSession(request.cookies.get(SESSION_COOKIE)?.value).catch(()=>null);
    if(!user)return NextResponse.json({status:'error',message:'Phiên đăng nhập đã hết hạn.'},{status:401});
    let operation='';
    if(request.nextUrl.pathname.endsWith('/actions')) {
      try {operation=String((await request.clone().json()).action||'');}catch {return NextResponse.json({status:'error',message:'Thao tác không hợp lệ.'},{status:400});}
    }
    const permission=requestPermission(request.nextUrl.pathname,request.method,operation);
    // Own branch option list is required for every workspace role; mutation remains an admin setting.
    const branchOptions=request.method==='GET'&&request.nextUrl.pathname==='/api/auth/stores';
    const composerStaff=request.method==='GET'&&request.nextUrl.pathname==='/api/auth/hr/staff'&&request.nextUrl.searchParams.has('store_id')&&hasPermission(user,'contracts.read');
    if(!branchOptions&&!composerStaff&&permission&&!hasPermission(user,permission))return NextResponse.json({status:'error',message:'Tài khoản không có quyền thực hiện thao tác này.'},{status:403});
    return dataAccess.run({...user,store_id:user.store_id??null,scope_all:user.scope_all===true,operation},()=>handler(request,context));
  };
}
