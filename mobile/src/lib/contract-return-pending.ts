import {pendingWrites} from './pending-writes';
export const contractReturnOperations=(id:string)=>['return.record:'+id,'return.swap:'+id,'return.recover:'+id,'return.correct:'+id];
export async function lookupContractReturnPending(scope:Parameters<typeof pendingWrites.lookup>[0],operation:string) {
  const id=operation.split(':')[1],entries:{operation:string;key:string}[]=[];
  for(const candidate of contractReturnOperations(id)){
    const key=await pendingWrites.lookup(scope,candidate);if(key)entries.push({operation:candidate,key});
  }
  if(entries.some(entry=>entry.operation!==operation))throw Error('Còn thao tác trả, đổi, thu hồi hoặc sửa lượt trả chưa rõ kết quả. Vào Tài khoản để đối chiếu các mã trước khi tiếp tục.');
  return entries[0]?.key??null;
}
