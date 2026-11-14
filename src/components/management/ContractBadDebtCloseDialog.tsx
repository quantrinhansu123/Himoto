'use client';
import { useState } from 'react';
import { ContractSettlementDialog } from './ContractSettlementDialog';
import { loadContractLifecycle,type ContractLifecycleContext } from '@/lib/management/contract-lifecycle';
export function ContractBadDebtCloseDialog({id,onClose,onDone}:{id:number;code:string;onClose:()=>void;onDone:(context:ContractLifecycleContext)=>void}) {
  const [error,setError]=useState('');
  return <>{error&&<p className="mg-field-error" role="alert">{error}</p>}<ContractSettlementDialog id={id} initialMode="close_unpaid" onClose={onClose} onSaved={()=>{
    void loadContractLifecycle(id).then(onDone).catch(()=>setError('Đã lưu thao tác nhưng chưa tải lại được tình trạng hợp đồng. Tải lại danh sách để kiểm tra.'));
  }}/></>;
}
