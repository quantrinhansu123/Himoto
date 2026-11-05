import {vehicleTransferActions,type MobileVehicleTransferAction,type MobileVehicleTransferPreparation,type MobileTransferStore,type MobileVehicleTransferInput} from '../../../shared/mobile-vehicle-transfers';
import {pendingWrites} from './pending-writes';

export const transferLabels:Record<MobileVehicleTransferAction,string>={transfer:'Chuyển kho',receive:'Nhận xe',reject:'Từ chối điều chuyển',cancel:'Hủy điều chuyển'};
export const transferEffects={awaiting_receipt:'Xe sẽ chờ người nhận xác nhận ở kho đến.',immediate_transfer:'Xe chuyển kho ngay và giữ nguyên trạng thái hiện tại.',
  received:'Xe được ghi nhận Lưu kho tại cơ sở nhận.',rejected:'Xe quay về Lưu kho tại cơ sở chuyển đi.',cancelled:'Lượt chuyển được hủy; xe quay về Lưu kho tại cơ sở chuyển đi.'};
export type TransferPending={action:MobileVehicleTransferAction;key:string};
type Scope=Parameters<typeof pendingWrites.lookup>[0];
export const transferOperations=(id:string)=>vehicleTransferActions.map(action=>'vehicle.'+action+':'+id);
export async function lookupTransferPending(scope:Scope,id:string):Promise<TransferPending[]> {
  const result:TransferPending[]=[];
  for(const action of vehicleTransferActions){
    const key=await pendingWrites.lookup(scope,'vehicle.'+action+':'+id);
    if(key)result.push({action,key});
  }
  return result;
}
export function vehicleTransferInput(data:MobileVehicleTransferPreparation,action:MobileVehicleTransferAction,destination:MobileTransferStore|null,note:string):MobileVehicleTransferInput {
  const gate=data.actions.find(row=>row.action===action);
  if(!gate?.available)throw Error(gate?.blockedReason||'Thao tác không còn khả dụng. Tải lại xe.');
  if(note.trim().length>500)throw Error('Ghi chú tối đa 500 ký tự.');
  if(action==='transfer'){
    if(!destination||destination.id===data.vehicle.storeId)throw Error('Chọn kho đến khác kho hiện tại.');
    return{action,revision:data.vehicle.revision,note:note.trim(),to_store_id:destination.id};
  }
  if(!data.transfer?.receivable)throw Error('Lượt chuyển không còn chờ xử lý. Tải lại xe.');
  return{action,revision:data.vehicle.revision,note:note.trim(),transfer_event_id:data.transfer.id,transfer_event_revision:data.transfer.revision};
}
