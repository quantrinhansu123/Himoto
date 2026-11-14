import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Text,View} from 'react-native';
import {uuid} from 'expo';
import {VEHICLE_OCR_FIELDS,mergeVehicleOcr,type MobileVehicleOcr,type VehicleOcrValues} from '../../../shared/mobile-vehicle-ocr';
import {stagedPhotoWork,stagedPhotoIdentity} from '@/lib/staged-photo-work';
import {useQuery} from '@tanstack/react-query';
import {useSession} from '@/providers/session';
import {useTheme} from '@/theme';
import {Button,Card,InlineError} from './ui';
import {RecordPhotoBatch} from './record-photo-batch';
const labels:Record<keyof VehicleOcrValues,string>={license:'Biển số',chassis:'Số khung',engine:'Số máy',color:'Màu sắc',year:'Năm sản xuất'};
export function VehicleRegistrationOcr({values,disabled,onApply,vehicleId,onBusyChange}:{values:VehicleOcrValues;disabled:boolean;onApply:(values:VehicleOcrValues)=>void;vehicleId?:number;onBusyChange:(busy:boolean)=>void}){
  const{api,session}=useSession(),theme=useTheme(),[error,setError]=useState(''),[notice,setNotice]=useState(''),[review,setReview]=useState<{result:MobileVehicleOcr;before:VehicleOcrValues}|null>(null);
  const work=useQuery({queryKey:['new-vehicle-photo-work',api?.origin,session?.user.id,session?.user.storeId,session?.user.allStores],queryFn:()=>stagedPhotoWork({origin:api!.origin,userId:session!.user.id,storeId:session!.user.allStores?null:session!.user.storeId,allStores:session!.user.allStores}),enabled:vehicleId===undefined,gcTime:0,staleTime:0});
  const epoch=useRef(0),current=useRef(values),previous=useRef<Partial<VehicleOcrValues>>({}),alive=useRef(true);
  useLayoutEffect(()=>{current.current=values;},[values]);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  function apply(){if(!review||disabled)return;const merged=mergeVehicleOcr(current.current,review.result.fields,review.before,previous.current);previous.current={...previous.current,...merged.applied};onApply(merged.values);setNotice('Đã điền thông tin đã rà soát. Ảnh vẫn được giữ trong bộ ảnh hồ sơ.');setReview(null);}
  return <Card style={{gap:14}}><Text accessibilityRole="header" style={{color:theme.text,fontSize:18,fontWeight:'700'}}>Đăng ký xe · chọn nhiều ảnh</Text>
    <Text style={{color:theme.muted,lineHeight:24}}>Chọn cả mặt trước, mặt sau và ảnh bổ sung. Ảnh đầu dùng đọc thông tin; toàn bộ ảnh được giữ để lưu vào hồ sơ xe.</Text>
    {(vehicleId!==undefined||work.data)&&<RecordPhotoBatch target={{entity:'vehicles',id:vehicleId??1,kind:'vehicle',referenceId:vehicleId??1}} slot="registration-front" disabled={disabled||vehicleId===undefined&&!!work.data?.recordId} onBusyChange={onBusyChange} queueId={vehicleId?`vehicle-registration:${vehicleId}`:stagedPhotoIdentity(work.data!.id)} allowSave={vehicleId!==undefined&&!disabled} showTelegram={false} onPrepared={async(photo,index)=>{
      if(index!==0||disabled)return;const at=++epoch.current,before={...current.current};setError('');setNotice('Đang đọc ảnh đăng ký…');try{const result=await api!.vehicleOcr(await photo.bytes(),uuid.v4().toLowerCase());if(alive.current&&epoch.current===at)setReview({result,before});}catch(e){if(alive.current&&epoch.current===at){setError((e as Error).message);setNotice('Ảnh được giữ. Có thể nhập thông tin bằng tay.');}}
    }}/>}{!!(error||work.error?.message)&&<InlineError message={error||work.error!.message}/>}{!!notice&&<Text accessibilityLiveRegion="polite" style={{color:theme.muted,lineHeight:24}}>{notice}</Text>}
    {review&&<View style={{gap:10}}>{VEHICLE_OCR_FIELDS.map(key=><Text key={key} style={{color:theme.text}}>{labels[key]}: {review.result.fields[key]||'Chưa đọc được'}</Text>)}<Button label="Áp dụng thông tin đã rà soát" disabled={disabled} onPress={apply}/><Button secondary label="Bỏ kết quả OCR, giữ bộ ảnh" onPress={()=>setReview(null)}/></View>}
  </Card>;
}
