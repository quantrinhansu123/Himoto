import {useEffect,useRef,useState} from 'react';
import {uuid} from 'expo';
import type {MobileCustomerInput} from '@himoto/mobile-contract';
import {nextCustomerDocumentSlot,type CustomerOcrKind,type CustomerOcrFields} from '../../../shared/mobile-customer-ocr';
import {useSession} from '@/providers/session';
import {selectRecordMediaPhoto,type RecordMediaPhoto} from '@/lib/record-media-photo';
import {selectCustomerDocumentBatch} from '@/lib/customer-document-picker';
import {customerDocumentBody} from '@/lib/customer-document-body';
import {isIdentityQrScan,identityQrMatches,type IdentityQrScan} from '../../../shared/identity-qr';

export type CustomerDocumentPhoto={id:string;slot:string;photo:RecordMediaPhoto;savedTo?:number};
export function useCustomerDocuments(getForm:()=>MobileCustomerInput,onOcr:(fields:CustomerOcrFields,before:MobileCustomerInput,previous:CustomerOcrFields)=>CustomerOcrFields){
  const {api,session}=useSession();
  const [photos,setPhotos]=useState<CustomerDocumentPhoto[]>([]),[picking,setPicking]=useState(false),[reading,setReading]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState('');
  const current=useRef(photos),alive=useRef(true),busy=useRef(false),picker=useRef<AbortController|null>(null),reader=useRef<AbortController|null>(null);
  const epoch=useRef(0),previousAi=useRef<CustomerOcrFields>({}),token=useRef(session?.token);
  const get=useRef(getForm),apply=useRef(onOcr);
  useEffect(()=>{token.current=session?.token;get.current=getForm;apply.current=onOcr;},[session?.token,getForm,onOcr]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;picker.current?.abort();reader.current?.abort();current.current.forEach(row=>row.photo.dispose());};},[]);
  function replace(rows:CustomerDocumentPhoto[]){current.current=rows;setPhotos(rows);}
  function append(photo:RecordMediaPhoto,base:string){
    const slot=nextCustomerDocumentSlot(base,current.current.map(row=>row.slot));
    const row={id:uuid.v4().toLowerCase(),slot,photo};replace([...current.current,row]);return row;
  }
  function skip(){epoch.current++;reader.current?.abort();reader.current=null;setReading(false);setNotice('Đã bỏ qua AI. Ảnh được giữ; tiếp tục nhập và kiểm tra thông tin bằng tay.');}
  function beginQr(){
    reader.current?.abort();epoch.current++;setReading(false);setError('');setNotice('');
    const before={...get.current()},atToken=token.current;
    return (scan:IdentityQrScan)=>{
      if(!alive.current||token.current!==atToken)return;
      if(!isIdentityQrScan(scan)){setError('Kết quả QR chưa hợp lệ. Hãy quét lại.');return;}
      if(!identityQrMatches(scan,before.id_card)){setError('QR thuộc căn cước khác. Kiểm tra lại khách trước khi cập nhật.');return;}
      const applied=apply.current(scan.fields,before,previousAi.current);previousAi.current={...previousAi.current,...applied};
      setNotice('Đã điền thông tin từ QR. Kiểm tra lại trước khi lưu; bổ sung nơi cấp nếu còn thiếu.');
    };
  }
  async function read(rows:CustomerDocumentPhoto[],many=false){
    if(!api||!session||!rows.length||!alive.current)return;
    reader.current?.abort();const controller=new AbortController();reader.current=controller;
    const at=++epoch.current,atToken=session.token,before={...get.current()};
    const readable=before.customer_type==='foreign'?rows:rows.filter(row=>row.slot.startsWith('driver_license'));
    if(!readable.length){
      setReading(false);setError('');setNotice('Ảnh được giữ để lưu vào hồ sơ. Dùng Quét QR căn cước để điền thông tin, hoặc nhập bằng tay.');return;
    }
    const selected=many?readable.slice(0,3).reduce<CustomerDocumentPhoto[]>((list,row)=>list.reduce((n,item)=>n+item.photo.size,0)+row.photo.size<=3*1024*1024?[...list,row]:list,[]):readable.slice(0,1);
    if(!selected.length)return;
    const slot=selected[0].slot;
    const kind:CustomerOcrKind=slot.startsWith('driver_license')?'driver_license':many?'customer_documents':'passport';
    setReading(true);setError('');setNotice('Đang đọc giấy tờ. Anh/chị vẫn có thể sửa thông tin đang nhập.');
    try{
      const expected=/^[A-Z0-9-]{3,100}$/i.test(before.id_card)?before.id_card:'';
      const body=many&&kind==='customer_documents'?await customerDocumentBody(selected.map(row=>row.photo)):await selected[0].photo.bytes();
      const result=await api.customerOcr(kind,body,uuid.v4().toLowerCase(),expected,controller.signal);
      if(!alive.current||controller.signal.aborted||epoch.current!==at||token.current!==atToken)return;
      const applied=apply.current(result.fields,before,previousAi.current);previousAi.current={...previousAi.current,...applied};
      setNotice(['Đã đọc giấy tờ. Kiểm tra lại thông tin trước khi lưu.',...result.warnings].join('\n'));
    }catch(failure){if(alive.current&&!controller.signal.aborted&&epoch.current===at&&token.current===atToken){setError((failure as Error).message);setNotice('Ảnh được giữ. Thử đọc lại hoặc tiếp tục nhập bằng tay.');}}
    finally{if(alive.current&&epoch.current===at)setReading(false);}
  }
  async function pick(base:string,camera=false,many=false){
    if(busy.current)return;
    busy.current=true;setPicking(true);setError('');reader.current?.abort();epoch.current++;setReading(false);
    const controller=new AbortController();picker.current=controller;const atToken=token.current;const added:CustomerDocumentPhoto[]=[];
    try{
      if(many)await selectCustomerDocumentBatch(controller.signal,(photo,index)=>{
        if(!alive.current||token.current!==atToken){photo.dispose();return;}
        added.push(append(photo,['id_front','id_back','driver_license'][Math.min(index,2)]));
      });
      else{
        const photo=await selectRecordMediaPhoto(camera,controller.signal);
        if(photo){if(!alive.current||token.current!==atToken){photo.dispose();return;}added.push(append(photo,base));}
      }
    }catch(failure){if(alive.current&&!controller.signal.aborted&&token.current===atToken)setError((failure as Error).message);}
    finally{busy.current=false;if(alive.current){setPicking(false);if(token.current===atToken&&added.length)void read(added,many);}}
  }
  function remove(id:string){skip();const row=current.current.find(row=>row.id===id);replace(current.current.filter(row=>row.id!==id));row?.photo.dispose();}
  function markSaved(id:string,customerId:number){replace(current.current.map(row=>row.id===id?{...row,savedTo:customerId}:row));}
  function clear(){skip();const old=current.current;replace([]);old.forEach(row=>row.photo.dispose());setError('');setNotice('');previousAi.current={};}
  return{photos,getPhotos:()=>current.current,picking,reading,error,notice,pick,read,skip,remove,markSaved,clear,beginQr};
}
