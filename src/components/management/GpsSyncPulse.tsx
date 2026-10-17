'use client';
import { useEffect,useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useManagement } from './ManagementProvider';
export function GpsSyncPulse() {
  const {can,ensureData}=useManagement(),pathname=usePathname(),allowed=can('vehicles.read');
  const current=useRef({pathname,ensureData});current.current={pathname,ensureData};
  useEffect(()=>{
    if(!allowed)return;let running=false;const controller=new AbortController();
    const sync=async()=>{if(running||document.visibilityState!=='visible')return;running=true;
      try{const response=await fetch('/api/auth/gps/refresh',{method:'POST',credentials:'same-origin',signal:controller.signal});if(response.ok&&current.current.pathname==='/vehicles')await current.current.ensureData(['vehicles'],true);}catch{/* Keep the last observed state during a temporary outage. */}finally{running=false;}};
    void sync();const timer=setInterval(()=>void sync(),30000);document.addEventListener('visibilitychange',sync);
    return()=>{controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',sync);};
  },[allowed]);
  return null;
}
