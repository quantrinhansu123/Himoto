import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Text,View} from 'react-native';
import type {ReturnMoneyDraft} from '@/lib/return-form';
import {useSession} from '@/providers/session';
import {useTheme} from '@/theme';
import {RecordPhotoBatch} from './record-photo-batch';
import {InlineError} from './ui';
export function RefundQrReader({id,itemId,value,onRead,onPendingChange}:{id:string;itemId:number;value:ReturnMoneyDraft;onRead:(fields:Partial<Record<'recipient_bank'|'recipient_account'|'recipient_name',string>>,before:ReturnMoneyDraft)=>void;onPendingChange:(pending:boolean)=>void}){
  const{api}=useSession(),theme=useTheme(),[notice,setNotice]=useState(''),[error,setError]=useState('');
  const epoch=useRef(0),current=useRef(value),latestRead=useRef(onRead);useLayoutEffect(()=>{current.current=value;latestRead.current=onRead;},[value,onRead]);const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const pendingCallback=useRef(onPendingChange);useLayoutEffect(()=>{pendingCallback.current=onPendingChange;},[onPendingChange]);useEffect(()=>()=>pendingCallback.current(false),[]);
  return <View style={{gap:12}}><Text style={{color:theme.text,fontWeight:'700'}}>Ảnh QR / tài khoản nhận hoàn</Text><Text style={{color:theme.muted,lineHeight:24}}>Chọn nhiều ảnh; ảnh đầu dùng đọc ngân hàng và tài khoản. Lưu bộ ảnh vào hồ sơ, rồi kiểm tra các ô người nhận trước khi xác nhận hoàn.</Text>
    <RecordPhotoBatch target={{entity:'contracts',id:Number(id),kind:'return',referenceId:itemId}} slot={`return-${itemId}-document-2`} onPendingChange={onPendingChange} showTelegram={false} onPrepared={async(photo,index)=>{
      if(index!==0)return;const at=++epoch.current,before={...current.current};setError('');setNotice('Đang đọc QR và thông tin tài khoản…');try{const result=await api!.refundQr(id,await photo.bytes());if(!alive.current||epoch.current!==at)return;latestRead.current(result.fields,before);setNotice(['Đã đọc ảnh. Kiểm tra ngân hàng, tài khoản và tên người nhận trước khi xác nhận.',...result.warnings].join('\n'));}catch(e){if(!alive.current||epoch.current!==at)return;setError((e as Error).message);setNotice('Ảnh được giữ. Có thể lưu ảnh và nhập người nhận bằng tay.');}
    }}/>{!!notice&&<Text accessibilityLiveRegion="polite" style={{color:theme.muted,lineHeight:24}}>{notice}</Text>}{!!error&&<InlineError message={error}/>}
  </View>;
}
