import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { hasPermission, type AccessPermission } from '@/lib/management/permissions';
import { dataAccess } from './access-context';
import { SESSION_COOKIE, sameOrigin, userFromSession, readSessionUser } from './management-session';
import { failureResponse } from './public-failure';
import { isSupplementalPhotoSlot,photoBaseSlot } from '@/lib/management/photo-slot-groups';

export function requestPermission(path:string,method:string,action=''):AccessPermission|null {
  if(path.includes('/record-photos/')){const slot=path.split('/').at(-1)!;if(isSupplementalPhotoSlot(slot))path=path.slice(0,-slot.length)+photoBaseSlot(slot);}
  const read=method==='GET';
  if(path.startsWith('/api/auth/shift-reports'))return 'contracts.read';
  if(path.startsWith('/api/auth/accounts'))return 'accounts.manage';
  if(path==='/api/auth/password')return null;
  if(path==='/api/auth/store-directory')return null;
  if(path==='/api/auth/contract-staff')return 'contracts.read';
  if(path==='/api/auth/contract-telegram-pending')return 'contracts.read';
  if(path.startsWith('/api/auth/integrations'))return 'settings.write';
  if(path==='/api/auth/gps/debts')return read?'contracts.read':'contracts.draft';
  if(path.startsWith('/api/auth/gps'))return path.endsWith('/refresh')||read?'vehicles.read':'settings.write';
  if(path==='/api/auth/debt-reminders'||path.endsWith('/debt-reminder'))return 'contracts.read';
  if(path.includes('/sepay/settings'))return read?'finance.read':'settings.write';
  if(path.includes('/payment-intents')||path.includes('/payment-events'))return read?'contracts.read':'contracts.draft';
  if(path.includes('/photo-uploads'))return null;
  if(path.includes('/photo-ocr'))return action==='vehicle_registration'?'vehicles.write':'customers.write';
  if(path.endsWith('/telegram'))return path.includes('/vehicles/')?'vehicles.read':'contracts.read'; // Mutation checks the selected operation permission inside the handler.
  if(path.endsWith('/battery-swaps'))return read?'contracts.read':'contracts.renew';
  if(path.includes('/battery-contracts/')&&path.endsWith('/actions'))return read?'contracts.read':action==='return'?'contracts.return':'contracts.renew';
  if(path.endsWith('/reservation-no-show'))return 'contracts.finalize';
  if(path.endsWith('/reservation')&&!read)return 'contracts.draft';
  // Xem / gắn / gỡ ảnh hồ sơ trên web: mọi tài khoản đã đăng nhập.
  if(path.includes('/record-photos/'))return null;
  if(path.includes('/bulk-delete/staff'))return read?'hr.read':'hr.write';
  if(path.includes('/bulk-delete/')||path.includes('/import')||path.includes('/match-stores')||path.includes('/backups')||path.includes('/reset')||path.includes('/contract-types'))return read?'contracts.read':'settings.write';
  if(path.includes('/stores/managers'))return 'contracts.read';
  if(path.includes('/stores'))return read?'contracts.read':'settings.write';
  if(path.includes('/hr/staff')||path.includes('/duty-roster'))return read?'hr.read':'hr.write';
  if(path.includes('/cashbook')||path.includes('/banks')||path.includes('/cash'))return read?'finance.read':'finance.write';
  if(path.includes('/customers/'))return read?'customers.read':'customers.write';
  if(path==='/api/auth/customers')return read?'customers.read':'customers.write';
  if(path.includes('/vehicles/')&&path.endsWith('/actions'))return action==='transfer'?'vehicles.transfer':action==='receive'||action==='reject'?'vehicles.receive':'vehicles.write';
  if(path.includes('/vehicle/')||path.includes('/vehicles'))return read?'vehicles.read':'vehicles.write';
  if(path==='/api/auth/returns/correction')return 'contracts.return';
  if(path.includes('/returns'))return read?'contracts.read':'contracts.return';
  if(path.includes('/staff-sales')||path==='/api/auth/rental-revenue'||path==='/api/auth/rental-revenue/transactions')return 'contracts.read';
  if(path.includes('/order/car-rental/')) {
    if(path.endsWith('/ownership-terms'))return read?'contracts.read':'contracts.draft';
    if(path.endsWith('/renewal-payments'))return 'contracts.renew';
    if(path.endsWith('/lifecycle'))return read?'contracts.read':'contracts.return';
    if(path.endsWith('/refund-qr'))return 'contracts.return';
    if(path.endsWith('/payments'))return read?'contracts.read':'finance.write';
    if(path.endsWith('/finalize')||path.endsWith('/handover'))return 'contracts.finalize';
    if(path.endsWith('/profile')&&!read)return 'contracts.draft';
    if(path.endsWith('/renewals'))return 'contracts.renew';
  }
  if(path.includes('/order/car-rental')||path.includes('/battery-contracts'))return read?'contracts.read':'contracts.draft';
  return 'settings.write'; // New endpoints fail closed until explicitly assigned.
}
export function withAccessRequest<C>(handler:(request:NextRequest,context:C)=>Promise<Response>|Response) {
  return async(request:NextRequest,context:C):Promise<Response>=>{
    if(request.method!=='GET'&&!sameOrigin(request))return NextResponse.json({status:'error',message:'Yêu cầu không hợp lệ.'},{status:403});
    let user;
    try {
      const token=request.cookies.get(SESSION_COOKIE)?.value;
      try { user=await (request.method==='GET'?readSessionUser:userFromSession)(token); }
      catch(error) {
        if(request.method!=='GET')throw error;
        user=await readSessionUser(token);
      }
    }catch(error) {
      return failureResponse('Không xác thực được phiên đăng nhập do lỗi kết nối DB. Vui lòng thử lại.',error,503);
    }
    if(!user)return NextResponse.json({status:'error',message:'Phiên đăng nhập đã hết hạn.'},{status:401});
    let operation='';
    if(request.method!=='GET'&&(request.nextUrl.pathname.endsWith('/actions')||/^\/api\/auth\/order\/car-rental\/[1-9]\d{0,14}\/lifecycle$/.test(request.nextUrl.pathname))) {
      try {operation=String((await request.clone().json()).action||'');}catch {return NextResponse.json({status:'error',message:'Thao tác không hợp lệ.'},{status:400});}
    }
    const vehiclePhoto=request.nextUrl.pathname.match(/\/record-photos\/vehicles\/([1-9]\d{0,14})(?:\/|$)/);
    const vehicleAction=request.nextUrl.pathname.match(/^\/api\/auth\/vehicles\/([1-9]\d{0,14})\/actions$/);
    const transfer_vehicle_id=vehiclePhoto?.[1]||(['transfer','receive','reject'].includes(operation)?vehicleAction?.[1]:'')||'';
    if(vehiclePhoto)operation='transfer';
    // Fleet / GPS reads unlock every store's vehicles for the request only.
    // Never flip scope_all: contracts, customers and money stay branch-scoped.
    if(request.method==='GET'&&(request.nextUrl.pathname==='/api/auth/vehicle/vehicles'||request.nextUrl.pathname==='/api/auth/vehicles/transfers'||request.nextUrl.pathname==='/api/auth/vehicles/inventory'||request.nextUrl.pathname==='/api/auth/gps'||/^\/api\/auth\/vehicles\/[1-9]\d{0,14}\/history$/.test(request.nextUrl.pathname)))operation='fleet_read';
    const permission=requestPermission(request.nextUrl.pathname,request.method,request.nextUrl.pathname==='/api/auth/photo-ocr'?request.headers.get('x-photo-kind')||'':operation);
    // Own branch option list is required for every workspace role; mutation remains an admin setting.
    const branchOptions=request.method==='GET'&&request.nextUrl.pathname==='/api/auth/stores';
    const composerStaff=request.method==='GET'&&request.nextUrl.pathname==='/api/auth/hr/staff'&&request.nextUrl.searchParams.has('store_id')&&hasPermission(user,'contracts.read');
    const lifecycleSettlement=request.method==='POST'&&operation==='settle'&&/^\/api\/auth\/order\/car-rental\/[1-9]\d{0,14}\/lifecycle$/.test(request.nextUrl.pathname)&&hasPermission(user,'contracts.read')&&hasPermission(user,'finance.write');
    const renewalPaymentCorrection=request.method==='PATCH'&&/^\/api\/auth\/order\/car-rental\/[1-9]\d{0,14}\/renewal-payments$/.test(request.nextUrl.pathname)&&hasPermission(user,'contracts.read')&&hasPermission(user,'finance.write');
    if(!branchOptions&&!composerStaff&&!lifecycleSettlement&&!renewalPaymentCorrection&&permission&&!hasPermission(user,permission))return NextResponse.json({status:'error',message:'Tài khoản không có quyền thực hiện thao tác này.'},{status:403});
    try {
      return await dataAccess.run({...user,store_id:user.store_id??null,scope_all:user.scope_all===true,operation,transfer_vehicle_id},()=>handler(request,context));
    } catch (error) {
      return failureResponse('Không thực hiện được thao tác.', error);
    }
  };
}
