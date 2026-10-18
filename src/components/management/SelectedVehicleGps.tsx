'use client';
import { useEffect,useState } from 'react';
import { GPS_POLL_INTERVAL_MS,GPS_STATE_LABELS } from '@/lib/management/gps';
import { statusTone } from '@/lib/management/config';
import { formatDateTime } from '@/lib/formatters';
interface VehicleGps {vehicle_id:number;status:string;synced_at:string|null}
export function useSelectedVehicleGps(values:(string|number)[]){
  const ids=[...new Set(values.map(Number).filter(id=>Number.isSafeInteger(id)&&id>0))].sort((a,b)=>a-b).slice(0,20).join(',');
  const [state,setState]=useState<{ids:string;rows:VehicleGps[];error:boolean}>({ids:'',rows:[],error:false});
  useEffect(()=>{
    if(!ids)return;
    const controller=new AbortController();let running=false;
    const read=async()=>{if(running||document.visibilityState!=='visible')return;running=true;
      try{const response=await fetch(`/api/auth/gps?vehicle_ids=${ids}`,{cache:'no-store',signal:controller.signal});const result=await response.json();if(!response.ok||!Array.isArray(result.data?.selected_vehicles))throw Error();if(!controller.signal.aborted)setState({ids,rows:result.data.selected_vehicles,error:false});}
      catch{if(!controller.signal.aborted)setState({ids,rows:[],error:true});}finally{running=false;}};
    void read();const timer=setInterval(()=>void read(),GPS_POLL_INTERVAL_MS);document.addEventListener('visibilitychange',read);
    return()=>{controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',read);};
  },[ids]);
  return {rows:state.ids===ids?state.rows:[],error:state.ids===ids&&state.error};
}
export function SelectedVehicleGps({vehicleId,data}:{vehicleId:string|number;data:ReturnType<typeof useSelectedVehicleGps>}){
  const row=data.rows.find(row=>row.vehicle_id===Number(vehicleId)),status=row?.status||'stale';
  return <div className="mg-composer-vehicle-summary" role="status" aria-label="Trạng thái định vị xe"><span className={`mg-status mg-status-${statusTone(status)}`}><span/>{row?`GPS: ${status==='stopped'?'ON · Đang dừng':GPS_STATE_LABELS[status]||status}`:data.error?'Chưa tải được GPS':'Đang kiểm tra GPS…'}</span>{row?.synced_at&&<small> · Cập nhật {formatDateTime(row.synced_at)}</small>}</div>;
}
