'use client';
import { useEffect,useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useManagement } from './ManagementProvider';
import { GPS_POLL_INTERVAL_MS } from '@/lib/management/gps';
export function GpsSyncPulse() {
  const {can,invalidateData}=useManagement(),pathname=usePathname(),allowed=can('vehicles.read')&&['/vehicles','/gps'].includes(pathname);
  const current=useRef({pathname,invalidateData});current.current={pathname,invalidateData};
  useEffect(()=>{
    if(!allowed)return;let running=false,lastVehicleRead=Date.now();const controller=new AbortController();
    const sync=async()=>{if(running||document.visibilityState!=='visible')return;running=true;
      try{await fetch('/api/auth/gps/refresh',{method:'POST',credentials:'same-origin',signal:controller.signal});}catch{/* A provider outage must still refresh the database's stale indicator. */}
      // Refresh the visible paged list, never download all stock just to refresh
      // GPS. Keep the existing 30-second vehicle-table refresh cadence.
      finally{if(!controller.signal.aborted&&current.current.pathname==='/vehicles'&&Date.now()-lastVehicleRead>=30000){lastVehicleRead=Date.now();current.current.invalidateData(['vehicles']);}running=false;}};
    const first=setTimeout(()=>void sync(),1500);const timer=setInterval(()=>void sync(),GPS_POLL_INTERVAL_MS);document.addEventListener('visibilitychange',sync);
    return()=>{controller.abort();clearTimeout(first);clearInterval(timer);document.removeEventListener('visibilitychange',sync);};
  },[allowed]);
  return null;
}
