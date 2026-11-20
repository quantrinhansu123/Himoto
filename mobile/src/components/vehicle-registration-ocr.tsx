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
import {VEHICLE_DOCUMENT_SLOTS} from '../../../shared/vehicle-profile-fields';
import {ChoiceField} from './form-fields';
const labels:Record<keyof VehicleOcrValues,string>={license:'Biển số',chassis:'Số khung',engine:'Số máy',color:'Màu sắc',year:'Năm sản xuất'};
export function VehicleRegistrationOcr({values,disabled,onApply,vehicleId,onBusyChange}:{values:VehicleOcrValues;disabled:boolean;onApply:(values:VehicleOcrValues)=>void;vehicleId?:number;onBusyChange:(busy:boolean)=>void}){
  const{api,session}=useSession(),theme=useTheme(),[error,setError]=useState(''),[notice,setNotice]=useState(''),[review,setReview]=useState<{result:MobileVehicleOcr;before:VehicleOcrValues}|null>(null);
  const [slot,setSlot]=useState<string>('registration-front'),[busy,setBusy]=useState(false),[reading,setReading]=useState(false);
  const work=useQuery({queryKey:['new-vehicle-photo-work',api?.origin,session?.user.id,session?.user.storeId,session?.user.allStores],queryFn:()=>stagedPhotoWork({origin:api!.origin,userId:session!.user.id,storeId:session!.user.allStores?null:session!.user.storeId,allStores:session!.user.allStores}),enabled:vehicleId===undefined,gcTime:0,staleTime:0});
  const epoch=useRef(0),current=useRef(values),previous=useRef<Partial<VehicleOcrValues>>({}),alive=useRef(true);
  useLayoutEffect(()=>{current.current=values;},[values]);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{onBusyChange(busy||reading);},[onBusyChange,busy,reading]);
  function apply(){if(!review||disabled)return;const merged=mergeVehicleOcr(current.current,review.result.fields,review.before,previous.current);previous.current={...previous.current,...merged.applied};onApply(merged.values);setNotice('Đã điền thông tin đã rà soát. Ảnh vẫn được giữ trong bộ ảnh hồ sơ.');setReview(null);}
  return <Card style={{gap:14}}><Text accessibilityRole="header" style={{color:theme.text,fontSize:18,fontWeight:'700'}}>Đăng ký xe & giấy mua bán</Text>
    <Text style={{color:theme.muted,lineHeight:24}}>Chọn mục giấy tờ trước khi chụp. AI đọc thông tin từ ảnh đăng ký xe.</Text>
    <ChoiceField label="Mục ảnh hồ sơ xe" value={slot} disabled={disabled||busy||reading}
      choices={VEHICLE_DOCUMENT_SLOTS.map(({key,label})=>({value:key,label}))} onChange={setSlot} />
    {(vehicleId!==undefined||work.data)&&<RecordPhotoBatch target={{entity:'vehicles',id:vehicleId??1,kind:'vehicle',referenceId:vehicleId??1}} slot={slot} disabled={disabled||reading||vehicleId===undefined&&!!work.data?.recordId} onBusyChange={setBusy} queueId={vehicleId?`vehicle-registration:${vehicleId}`:stagedPhotoIdentity(work.data!.id)} allowSave={vehicleId!==undefined&&!disabled} showTelegram={false} onPrepared={async(photo,index)=>{
      if(index!==0||disabled||!slot.startsWith('registration-'))return;
      const at=++epoch.current,before={...current.current};
      setError('');setNotice('Đang đọc ảnh đăng ký…');setReading(true);setReview(null);
      try{
        const result=await api!.vehicleOcr(await photo.bytes(),uuid.v4().toLowerCase());
        if(alive.current&&epoch.current===at){setReview({result,before});setNotice('Đối chiếu thông tin AI đọc được trước khi áp dụng.');}
      }catch(e){
        if(alive.current&&epoch.current===at){setError((e as Error).message);setNotice('Ảnh được giữ. Có thể nhập thông tin bằng tay.');}
      }finally{if(alive.current&&epoch.current===at)setReading(false);}
    }}/>}{!!(error||work.error?.message)&&<InlineError message={error||work.error!.message}/>}{!!notice&&<Text accessibilityLiveRegion="polite" style={{color:theme.muted,lineHeight:24}}>{notice}</Text>}
    {review&&<View style={{gap:10}}>{VEHICLE_OCR_FIELDS.map(key=><Text key={key} style={{color:theme.text}}>{labels[key]}: {review.result.fields[key]||'Chưa đọc được'}</Text>)}<Button label="Áp dụng thông tin đã rà soát" disabled={disabled} onPress={apply}/><Button secondary label="Bỏ kết quả OCR, giữ bộ ảnh" onPress={()=>setReview(null)}/></View>}
  </Card>;
}
