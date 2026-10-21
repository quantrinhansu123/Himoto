'use client';
import { useEffect,useState } from 'react';
import { GPS_POLL_INTERVAL_MS,GPS_STATE_LABELS } from '@/lib/management/gps';
import { statusTone } from '@/lib/management/config';
import { GpsEvidence } from './GpsEvidence';
interface VehicleGps {vehicle_id:number;status:string;synced_at:string|null;heartbeat_at?:string|null;position_at?:string|null}
export function useSelectedVehicleGps(values:(string|number)[]){
  const ids=[...new Set(values.map(Number).filter(id=>Number.isSafeInteger(id)&&id>0))].sort((a,b)=>a-b).join(',');
  const [state,setState]=useState<{ids:string;rows:VehicleGps[];error:boolean}>({ids:'',rows:[],error:false});
  useEffect(()=>{
    if(!ids)return;
    const controller=new AbortController();let running=false;
    const read=async()=>{if(running||document.visibilityState!=='visible')return;running=true;
      try{const values=ids.split(','),chunks=Array.from({length:Math.ceil(values.length/20)},(_,index)=>values.slice(index*20,index*20+20).join(','));
        const batches:VehicleGps[][]=[];
        for(const chunk of chunks){const response=await fetch(`/api/auth/gps?vehicle_ids=${chunk}`,{cache:'no-store',signal:controller.signal});const result=await response.json();if(!response.ok||!Array.isArray(result.data?.selected_vehicles))throw Error();batches.push(result.data.selected_vehicles);}
        if(!controller.signal.aborted)setState({ids,rows:batches.flat(),error:false});}
      catch{if(!controller.signal.aborted)setState({ids,rows:[],error:true});}finally{running=false;}};
    void read();const timer=setInterval(()=>void read(),GPS_POLL_INTERVAL_MS);document.addEventListener('visibilitychange',read);
    return()=>{controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',read);};
  },[ids]);
  return {rows:state.ids===ids?state.rows:[],error:state.ids===ids&&state.error,loading:Boolean(ids)&&state.ids!==ids};
}
export function SelectedVehicleGps({vehicleId,data}:{vehicleId:string|number;data:ReturnType<typeof useSelectedVehicleGps>}){
  const row=data.rows.find(row=>row.vehicle_id===Number(vehicleId)),status=row?.status||'stale';
  return <div className="mg-composer-vehicle-summary" role="status" aria-label="Trạng thái định vị xe"><span className={`mg-status mg-status-${statusTone(status)}`}><span/>{row?`GPS: ${GPS_STATE_LABELS[status]||status}`:data.error?'Chưa tải được GPS':'Đang kiểm tra GPS…'}</span>{row&&<GpsEvidence syncedAt={row.synced_at} heartbeatAt={row.heartbeat_at} positionAt={row.position_at}/>}</div>;
}
