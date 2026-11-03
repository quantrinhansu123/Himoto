'use client';

import { ArrowLeft,House,RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useManagement } from './ManagementProvider';
import { requestReload } from './ReloadButton';

export function MobileDialogNavigation({onBack}:{onBack:()=>void}) {
  const router=useRouter();
  const {can,reload,refreshing}=useManagement();
  const home=can('contracts.read')?'/operations':can('hr.read')?'/staff':can('customers.read')?'/customers':can('settings.write')?'/stores':can('vehicles.read')?'/vehicles':can('finance.read')?'/cashbook':can('accounts.manage')?'/accounts':'/login';
  return <nav className="mg-mobile-bottom-nav mg-dialog-mobile-nav" aria-label="Điều hướng trong hộp thoại">
    <button type="button" aria-label="Back — Đóng hộp thoại" onClick={onBack}><ArrowLeft size={20}/><span>Back</span></button>
    <button type="button" aria-label="Home — Trang chủ" onClick={()=>{onBack();router.push(home);}}><House size={20}/><span>Home</span></button>
    <button type="button" aria-label="Load — Tải lại dữ liệu" disabled={refreshing} onClick={()=>{requestReload();void reload();router.refresh();}}><RotateCcw size={20} className={refreshing?'mg-spin':undefined}/><span>{refreshing?'Đang tải…':'Load'}</span></button>
  </nav>;
}
