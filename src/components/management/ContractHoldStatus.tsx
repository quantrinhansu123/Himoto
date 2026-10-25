'use client';
import { useEffect,useState } from 'react';
import type { ManagementRow } from '@/lib/management/types';
import { expiredOwnershipHold,validLifecycleTime } from '@/lib/management/contract-lifecycle';
import { formatDateTime } from '@/lib/formatters';

export function useHoldExpired(until?:string|null) {
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{
    if(!validLifecycleTime(until))return;
    const delay=Date.parse(`${until}:00+07:00`)-Date.now();
    if(delay<=0){if(now<Date.parse(`${until}:00+07:00`))setNow(Date.now());return;}
    const timer=setTimeout(()=>setNow(Date.now()),Math.min(delay+50,2_147_483_647));return()=>clearTimeout(timer);
  },[until,now]);
  return validLifecycleTime(until)&&Date.parse(`${until}:00+07:00`)<=now;
}

export function ContractHoldStatus({row,label}:{row:ManagementRow;label:string}) {
  const expired=useHoldExpired(String(row.hold_until||''));
  if(!['ownership','ownership_cd'].includes(String(row.rental_type)))return <span className="mg-status mg-status-amber"><span/>{label}</span>;
  const warning=expired&&expiredOwnershipHold(row);
  return <span className={`mg-contract-hold-status${warning?' is-expired':''}`}>
    <span className={`mg-status mg-status-${warning?'red':'amber'}`}><span/>{label}</span>
    {warning?<small>Hết hạn bảo lưu · {formatDateTime(`${row.hold_until}:00+07:00`)}</small>:row.hold_until?<small>Đến {formatDateTime(`${row.hold_until}:00+07:00`)}</small>:<small>Chưa nhập hạn bảo lưu</small>}
  </span>;
}
