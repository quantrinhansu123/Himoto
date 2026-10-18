export interface VehicleTransferTelegramState {
  eligible:boolean;event_id:number;vehicle_id:number;destination_label:string;text:string;
  status:string|null;can_send:boolean;message_count:number;
}
export async function vehicleTransferTelegramRequest(vehicleId:number,eventId:number,send=false,signal?:AbortSignal):Promise<VehicleTransferTelegramState> {
  const response=await fetch(`/api/auth/vehicles/${vehicleId}/transfers/${eventId}/telegram`,{method:send?'POST':'GET',cache:'no-store',credentials:'same-origin',signal,
    ...(send?{headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'send'})}:{})});
  const body=await response.json().catch(()=>null);
  if(!response.ok||body?.status!=='success')throw Error(body?.message||'Không tải được Telegram của lượt chuyển xe.');
  return body.data;
}
