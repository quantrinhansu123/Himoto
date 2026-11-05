'use client';
import {useRef,useState} from 'react';
import {IdentityQrCamera} from '@/components/management/IdentityQrCamera';
import {usePhotoOcr} from '@/components/management/usePhotoOcr';
import {mergeOcrCustomer,type OcrFields} from '@/lib/management/photo-ocr';
import {customerDetails} from '@/lib/management/contract-document';

export default function Fixture(){
  const [customer,setCustomer]=useState(customerDetails());
  const current=useRef(customer);current.current=customer;
  const previous=useRef<OcrFields>({});
  const ocr=usePhotoOcr({kind:()=> 'customer_documents',snapshot:()=>({...current.current}),apply:(_slot,result,before)=>{
    const merged=mergeOcrCustomer(current.current,result.fields,before,previous.current);
    previous.current={...previous.current,...merged.applied};current.current=merged.customer;setCustomer(merged.customer);return 'Đã điền QR';
  }});
  const state=ocr.states.documents||ocr.states.id_front;
  return <main><h1>Kiểm thử QR</h1>
    <label>CCCD<input aria-label="CCCD" value={customer.id_card} onChange={e=>setCustomer({...current.current,id_card:e.target.value})}/></label>
    <label>Họ tên<input aria-label="Họ tên" value={customer.name} onChange={e=>setCustomer({...current.current,name:e.target.value})}/></label>
    <label>Địa chỉ<input aria-label="Địa chỉ" value={customer.address} onChange={e=>setCustomer({...current.current,address:e.target.value})}/></label>
    <label>Ngày cấp<input aria-label="Ngày cấp" value={customer.id_card_issued_on} readOnly/></label>
    <input type="file" multiple aria-label="Chọn QR" onChange={e=>{ocr.cancel('id_front');ocr.readMany('documents',Array.from(e.target.files||[]));e.currentTarget.value='';}}/>
    <IdentityQrCamera disabled={ocr.pending} onFrame={file=>{ocr.cancel('documents');ocr.read('id_front',file);}}/>
    {state&&<p role={state.phase==='error'?'alert':'status'}>{state.message}</p>}
  </main>;
}
