import {useEffect,useMemo,useRef,useState} from 'react';
import {Platform,ScrollView,Text} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router} from 'expo-router';
import {useSession} from '@/providers/session';
import {useContractPhotos} from '@/hooks/use-contract-photos';
import {resumeDraftWorkMedia} from '@/lib/draft-work-media-resume';
import {DRAFT_WORK_RECOVERY_ENABLED} from '@/lib/draft-work-feature';
import {isWorkUuid,type ContractWorkScope} from '../../../shared/mobile-contract-work';
import {useTheme} from '@/theme';
import {ContractPhotoSave} from './contract-photo-save';
import {CustomerPhotoCopyStage} from './customer-photo-copy';
import {Button,Card,InlineError,StateView} from './ui';

type Setup=Awaited<ReturnType<typeof resumeDraftWorkMedia>>;
export function DraftWorkMedia({id}:{id:string}){
  const {api,session}=useSession();
  if(!api||!session||!isWorkUuid(id)||!DRAFT_WORK_RECOVERY_ENABLED||Platform.OS==='web')return <StateView title="Chưa mở được hồ sơ đang hoàn tất" message="Kiểm tra phiên và liên kết bản đã lưu trên thiết bị."/>;
  const scope:ContractWorkScope={origin:api.origin,userId:session.user.id,storeId:session.user.allStores?null:session.user.storeId,allStores:session.user.allStores};
  return <Load key={[api.origin,session.user.id,session.token,scope.storeId,scope.allStores,session.user.permissions.join(','),id].join('|')} id={id} scope={scope}/>;
}
function Load({id,scope:currentScope}:{id:string;scope:ContractWorkScope}){
  const {api}=useSession(),[attempt,setAttempt]=useState(0),[setup,setSetup]=useState<Setup|null>(null),[error,setError]=useState('');
  const apiRef=useRef(api);
  useEffect(()=>{apiRef.current=api;},[api]);
  const {origin,userId,storeId,allStores}=currentScope;
  const scope=useMemo(()=>({origin,userId,storeId,allStores}),[origin,userId,storeId,allStores]);
  useEffect(()=>{
    let active=true;
    void Promise.resolve().then(async()=>{const currentApi=apiRef.current;if(!active||!currentApi)return;setError('');setSetup(null);try{const ready=await resumeDraftWorkMedia(scope,id,currentApi,()=>active);if(active)setSetup(ready);}catch(cause){if(active)setError((cause as Error).message);}});
    return()=>{active=false;};
  },[scope,id,attempt]);
  if(!setup)return <><StateView title={error?'Chưa mở được hồ sơ đã lưu':'Đang kiểm tra hợp đồng gốc'} loading={!error} message={error||undefined} retry={error?()=>setAttempt(value=>value+1):undefined}/><Button secondary label="Về Tài khoản" onPress={()=>router.dismissTo('/(tabs)/account')}/></>;
  return <Media setup={setup}/>;
}
function Media({setup}:{setup:Setup}){
  const theme=useTheme(),{work,revision}=setup,head=work.getHead()!,id=head.work.contractId!;
  const [photoStage,setPhotoStage]=useState(false),[copyStage,setCopyStage]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const documents=useContractPhotos({work,initialPhotos:setup.photos,getVehicleIds:()=>head.work.input.draft.vehicles.map(vehicle=>vehicle.id),onVehicle:()=>{throw Error('Hồ sơ đã lưu; mở màn soạn hợp đồng để sửa xe.');}});
  async function complete(){await work.finish();if(alive.current)router.dismissTo('/(tabs)/account');}
  async function proceed(){
    setError('');setBusy(true);
    try{
      if(documents.getPhotos().some(photo=>photo.savedTo!==id)){setPhotoStage(true);return;}
      if(head.work.input.draft.customer_id&&!work.getHead()?.work.attempts.some(row=>row.kind==='copy'&&row.state==='committed'&&row.acknowledged)){setCopyStage(true);return;}
      await complete();
    }catch(cause){if(alive.current)setError((cause as Error).message);}finally{if(alive.current)setBusy(false);}
  }
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}>
    <ScrollView contentContainerStyle={{padding:16,paddingBottom:36,gap:14,maxWidth:760,width:'100%',alignSelf:'center'}}>
      <Card style={{gap:10}}><Text accessibilityRole="header" style={{color:theme.text,fontSize:19,fontWeight:'800'}}>{`Hợp đồng #${id}`}</Text><Text style={{color:theme.muted,fontSize:14,lineHeight:21}}>Thông tin hợp đồng đã được lưu. Tiếp tục ảnh và giấy tờ trên đúng hợp đồng này; app kiểm tra quyền hiện tại khi đọc hoặc lưu từng mục.</Text></Card>
      {!!error&&<InlineError message={error}/>}
      <Button label={`Hoàn tất ảnh và giấy tờ #${id}`} loading={busy} onPress={()=>void proceed()}/>
      <Button secondary label="Về Tài khoản" disabled={busy} onPress={()=>router.dismissTo('/(tabs)/account')}/>
    </ScrollView>
    {photoStage&&<ContractPhotoSave contractId={id} revision={revision} copyAfter={!!head.work.input.draft.customer_id} documents={documents} vehicles={head.work.input.draft.vehicles} onClose={()=>setPhotoStage(false)} onComplete={complete}/>}
    {copyStage&&<CustomerPhotoCopyStage id={id} revision={revision} work={work} onClose={()=>setCopyStage(false)} onComplete={complete}/>}
  </SafeAreaView>;
}
