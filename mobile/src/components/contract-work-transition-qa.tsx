import {useEffect,useMemo,useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {Directory,File,Paths} from 'expo-file-system';
import {router} from 'expo-router';
import {uuid} from 'expo';
import type {MobileDraftInput} from '../../../shared/mobile-contract';
import {openNativeContractWorkStore} from '@/lib/contract-work-files';
import {createDraftWorkController,type DraftWorkController,type WorkLocalPhoto} from '@/lib/draft-work-controller';
import {useContractPhotos} from '@/hooks/use-contract-photos';
import {useDraftWorkLifecycle} from '@/hooks/use-draft-work-lifecycle';
import {useDraftWrite} from '@/hooks/use-draft-write';
import input from '@/lib/qa/contract-work-input.json';
import {useTheme} from '@/theme';
import {ContractPhotoFields} from './contract-photo-fields';
import {ConfirmEdit} from './editor-sheet';
import {Button,Card,InlineError,StateView} from './ui';

interface QaSetup {work:DraftWorkController;photos:WorkLocalPhoto[];input:()=>MobileDraftInput;imports:()=>number;setNote:()=>void;allow:()=>void;proof:(event:string)=>Promise<void>;verifyBackground:()=>Promise<void>}
/** Controlled local import rejection only; never fills device storage, touches personal files or writes a backend. */
export function ContractWorkTransitionQaScreen({run}:{run:string}){
  const scope=useMemo(()=>({origin:`https://${run}.contract-work-transition-qa.invalid`,userId:7,storeId:23,allStores:false}),[run]);
  const [setup,setSetup]=useState<QaSetup|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    void(async()=>{
      const native=await openNativeContractWorkStore(scope),all=await native.list(),head=all.find(row=>row.work.id===run)??null;
      let canWrite=false,imports=0,value=JSON.parse(JSON.stringify(head?.work.input??input)) as MobileDraftInput;
      const store={...native,async importPreparedPhoto(...args:Parameters<typeof native.importPreparedPhoto>){imports++;if(!canWrite)throw Error('QA: Chưa cho phép ghi ảnh.');return native.importPreparedPhoto(...args);}};
      const work=createDraftWorkController({store,scope,workId:run,baseDraftId:null,initialHead:head,makeUuid:()=>uuid.v4().toLowerCase(),ledger:{reserveExclusive:async()=>{throw Error('QA must reserve no business UUID');},complete:async()=>{throw Error('QA must remove no business UUID');}}});
      work.setReader(()=>({input:value,step:4}));const photos=await work.restorePhotos();
      const proof=async(event:string)=>{
        const current=work.getHead();if(!current)return;
        const directory=new Directory(Paths.document,'himoto-transition-qa');directory.create({intermediates:true,idempotent:true});
        const file=new File(directory,`${run}.json`);
        if(!file.exists)file.create({overwrite:false});
        await file.write(JSON.stringify({version:1,fixtureOnly:true,run,event,workId:work.id,status:current.work.status,notes:current.work.input.notes,photos:current.work.photos.map(photo=>({id:photo.id,sha256:photo.sha256,bytes:photo.bytes})),attempts:current.work.attempts.length,at:Date.now()}));
      };
      const verifyBackground=async()=>{
        const file=new File(Paths.document,'himoto-transition-qa',`${run}.json`),record=JSON.parse(await file.text()),current=work.getHead();
        if(record.fixtureOnly!==true||record.run!==run||record.workId!==run||record.event!=='background'||record.notes!=='MemoBeforeHomeQA'||record.attempts!==0||current?.work.input.notes!=='MemoBeforeHomeQA'||JSON.stringify(record.photos)!==JSON.stringify(current.work.photos.map(photo=>({id:photo.id,sha256:photo.sha256,bytes:photo.bytes}))))throw Error('QA background proof does not match the restored work');
      };
      if(active)setSetup({work,photos,input:()=>value,imports:()=>imports,setNote:()=>{value={...value,notes:'MemoBeforeHomeQA'};work.schedule();},allow:()=>{canWrite=true;},proof,verifyBackground});
    })().catch(cause=>{if(active)setError((cause as Error).message);});
    return()=>{active=false;};
  },[run,scope]);
  if(error)return <StateView title="QA chưa mở được" message={error}/>;
  if(!setup)return <StateView title="QA đang mở kiểm tra chuyển màn hình" loading/>;
  return <QaForm setup={setup}/>;
}
function QaForm({setup}:{setup:QaSetup}){
  const theme=useTheme(),[error,setError]=useState(''),[notice,setNotice]=useState('QA: Sẵn sàng');
  const photos=useContractPhotos({work:setup.work,initialPhotos:setup.photos,getVehicleIds:()=>[],onVehicle:()=>{throw Error('QA transaction photo must not run plate OCR');}});
  useDraftWorkLifecycle(true,photos.prepareTransition,cause=>setError((cause as Error).message),event=>{void setup.proof(event).catch(cause=>setError((cause as Error).message));});
  const write=useDraftWrite({id:null,input:setup.input(),dirty:photos.photos.length>0,work:setup.work,beforeLeave:photos.prepareTransition,onReload:()=>{},onReset:()=>{},onError:()=>{}});
  async function allow(){setError('');setup.allow();try{await photos.prepareTransition();setNotice('QA: Ảnh đã giữ an toàn');await setup.proof('retry-saved');}catch(cause){setError((cause as Error).message);}}
  async function finish(){try{await photos.prepareTransition();await setup.work.discard();await setup.proof('explicit-qa-discard');setNotice('QA: Đã kết thúc bản thử');}catch(cause){setError((cause as Error).message);}}
  return <ScrollView contentContainerStyle={{padding:18,gap:14}}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:22,fontWeight:'700'}}>QA an toàn khi rời form</Text>
    <Text style={{color:theme.muted}}>Chỉ kiểm dữ liệu tổng hợp riêng trên máy. Lỗi ghi được chặn có chủ ý; không làm đầy bộ nhớ thật.</Text>
    <Text style={{color:theme.text}}>{notice}</Text>
    <Card style={{gap:8}}><Text style={{color:theme.text}}>{`QA số ảnh ${photos.photos.length}`}</Text><Text style={{color:theme.text}}>{`QA ảnh chưa giữ ${photos.photos.filter(row=>!row.durable).length}`}</Text><Text style={{color:theme.text}}>{`QA lần giữ ảnh ${setup.imports()}`}</Text>
      <Text style={{color:theme.text}}>{`QA file còn ${photos.photos.filter(row=>new File(row.photo.uri).exists).length}`}</Text></Card>
    {(error||write.error)&&<InlineError message={error||write.error}/>}
    <Button label="QA: Rời màn hình" secondary disabled={photos.picking} onPress={()=>router.back()}/>
    <Button label="QA: Thử mở bộ chọn lần nữa" secondary disabled={photos.picking} onPress={()=>void photos.pick('rental-document-1')}/>
    <Button label="QA: Cho phép giữ ảnh" disabled={photos.picking} onPress={()=>void allow()}/>
    <Button label="QA: Sửa trước khi ra nền" disabled={photos.picking} onPress={()=>{setup.setNote();setNotice('QA: Đã sửa ghi chú chờ lưu');}}/>
    <Button label="QA: Kiểm tra bản đọc lại" secondary disabled={photos.picking} onPress={()=>{void setup.verifyBackground().then(()=>setNotice('QA: AppState và khôi phục sau kill đúng')).catch(cause=>setError((cause as Error).message));}}/>
    <Button label="QA: Kết thúc bản thử" secondary disabled={photos.picking} onPress={()=>void finish()}/>
    <View style={{gap:14}}><ContractPhotoFields photos={photos} vehicles={[]} disabled={false} canOcr={false}/></View>
    {write.exit&&<ConfirmEdit title="QA: Rời form?" message="Chỉ rời sau khi giữ an toàn ảnh và thông tin." confirmLabel="QA: Xác nhận rời" onCancel={write.dismissPrompt} onConfirm={()=>void write.leave()}/>}
  </ScrollView>;
}
