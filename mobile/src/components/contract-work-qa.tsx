import {useEffect,useMemo,useRef,useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {Directory,File,Paths} from 'expo-file-system';
import {uuid} from 'expo';
import type {MobileDraftInput} from '../../../shared/mobile-contract';
import {openNativeContractWorkStore} from '@/lib/contract-work-files';
import {reserveContractWorkIntent,settleContractWorkIntent} from '@/lib/contract-work-intent';
import type {ContractWorkHead} from '@/lib/contract-work-journal';
import {ContractWorkStorageError} from '@/lib/contract-work-journal';
import input from '@/lib/qa/contract-work-input.json';
import image from '@/lib/qa/contract-work-image.json';
import {Button,Card,InlineError} from './ui';
import {useTheme} from '@/theme';

type Store=Awaited<ReturnType<typeof openNativeContractWorkStore>>;
/** Local native filesystem test only: no API writes, no real pending ledger, no personal media access. */
export function ContractWorkQaScreen({run}:{run:string}){
  const scope=useMemo(()=>({origin:`https://${run}.contract-work-native-qa.invalid`,userId:7,storeId:23,allStores:false}),[run]);
  const theme=useTheme(),store=useRef<Store|null>(null),running=useRef(false),alive=useRef(true);
  const [loaded,setLoaded]=useState(false);
  const [head,setHead]=useState<ContractWorkHead|null>(null),[error,setError]=useState(''),[message,setMessage]=useState('QA: Đang đọc'),[busy,setBusy]=useState(true);
  async function execute(task:()=>Promise<void>){if(running.current)return;running.current=true;setBusy(true);setError('');try{await task();}catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setBusy(false);}}
  useEffect(()=>{alive.current=true;void execute(async()=>{const j=await openNativeContractWorkStore(scope);store.current=j;const all=await j.list();if(!alive.current)return;setHead(all.find(h=>h.work.id===run)??null);setMessage('QA: Đã đọc lại từ file');setLoaded(true);});return()=>{alive.current=false;};},[run,scope]); // QA scope is immutable for this run.
  async function create(){
    const j=store.current;if(!j)return;let h=await j.create(run,JSON.parse(JSON.stringify(input)) as MobileDraftInput,null);
    h=await j.change(h,scope,{type:'edit',input:h.work.input,step:4});
    const photoId=uuid.v4().toLowerCase(),cache=new File(Paths.cache,`himoto-work-qa-${photoId}.jpg`);
    cache.create({overwrite:false});await cache.write(Uint8Array.from(atob(image.base64),c=>c.charCodeAt(0)));
    const source={uri:cache.uri,width:image.width,height:image.height,size:image.bytes,mimeType:'image/jpeg' as const,dispose:()=>{if(cache.exists)cache.delete();},bytes:()=>cache.arrayBuffer()};
    const owned=await j.importPreparedPhoto(run,photoId,'rental-document-1',source);
    h=await j.change(h,scope,{type:'add-photo',photo:owned});source.dispose();
    const restored=await j.readPhoto(run,photoId);if((await restored.bytes()).byteLength!==image.bytes||cache.exists)throw Error('QA ảnh không khớp');restored.dispose();
    setHead(h);setMessage('QA: Đã lưu form và ảnh riêng');
  }
  async function plan(){const j=store.current;if(!j||!head)return;const h=await j.change(head,scope,{type:'plan-metadata',key:uuid.v4().toLowerCase()});const reservation=await reserveContractWorkIntent(j,run,scope,{reserveExclusive:async(_scope,operation,_conflicts,makeKey)=>({operation,key:makeKey(),created:true})});if(!reservation.sendAllowed)throw Error('QA reservation failed');setHead(h);setMessage('QA: Mã gốc đã lưu trước reserve');}
  async function verify(){
    const j=store.current;if(!j)return;const h=await j.load(run),work=h.work;
    if(work.input.draft.customer.name!==input.draft.customer.name||work.input.draft.vehicles[0].driver_name!=='DurableDriverQA'||work.input.draft.total_amount!=='1250000'||work.step!==4||work.photos.length!==1)throw Error('QA dữ liệu form không khớp');
    const photo=await j.readPhoto(run,work.photos[0].id);if((await photo.bytes()).byteLength!==image.bytes)throw Error('QA tệp ảnh không khớp');
    const attempt=work.attempts.find(a=>a.kind==='metadata');
    if(attempt?.state==='planned'){
      const reservation=await reserveContractWorkIntent(j,run,scope,{reserveExclusive:async(_scope,operation,_conflicts,_makeKey)=>({operation,key:attempt.key,created:false})});
      if(reservation.sendAllowed||!reservation.recoveryRequired)throw Error('QA mã gốc chưa chặn gửi lại');
    }
    setHead(h);setMessage('QA: Khôi phục form ảnh và mã gốc đạt');
  }
  async function settle(){
    const j=store.current,a=head?.work.attempts.find(a=>a.kind==='metadata');if(!j||!a)return;
    const h=await settleContractWorkIntent(j,run,scope,{type:'committed',key:a.key,receipt:{id:92001,revision:'11',replayed:false}},{complete:async()=>{const proof=await j.load(run);if(!proof.work.attempts.find(at=>at.key===a.key)?.acknowledged||proof.work.contractId!==92001)throw Error('QA local acknowledgement not persisted');}});
    setHead(h);setMessage('QA: Đã khôi phục ID gốc trước xóa mã');
  }
  async function corrupt(){
    const j=store.current;if(!j||!head)return;
    const anchor=new File(Paths.cache,`himoto-work-qa-scope-${uuid.v4().toLowerCase()}.tmp`);anchor.create({overwrite:false});await anchor.write(JSON.stringify({origin:scope.origin,userId:scope.userId}));const actorKey=await anchor.digest('SHA-256');anchor.delete();
    const root=new Directory(Paths.document,'himoto-contract-work-v1',actorKey,run,'generations'),prior=new File(root,head.commitId,'state.json'),sha=await prior.digest('SHA-256');
    const broken=new Directory(root,uuid.v4().toLowerCase());broken.create();const file=new File(broken,'state.json');file.create({overwrite:false});await file.write('{"partial":');
    let blocked=false;try{await j.load(run);}catch(cause){if(cause instanceof ContractWorkStorageError)blocked=true;else throw cause;}
    if(!blocked||await prior.digest('SHA-256')!==sha)throw Error('QA bản hợp lệ cũ không được giữ');
    setMessage('QA: Ghi dở bị chặn bản cũ còn nguyên');
  }
  return <ScrollView contentContainerStyle={{padding:18,gap:14,backgroundColor:theme.background}}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:22,fontWeight:'700'}}>QA lưu bản đang soạn</Text>
    <Text style={{color:theme.muted}}>Dữ liệu tổng hợp riêng trên thiết bị; không ghi backend hoặc mã chờ nghiệp vụ.</Text>
    <Text accessibilityLabel={message} style={{color:theme.text}}>{message}</Text>
    {!!error&&<InlineError message={error}/>}
    {head&&<Card style={{gap:8}}><Text style={{color:theme.text}}>QA work {run}</Text><Text style={{color:theme.text}}>QA contract {head.work.contractId??'chưa gửi'}</Text><Text style={{color:theme.text}}>QA photos {head.work.photos.length}</Text><Text style={{color:theme.text}}>QA step {head.work.step+1}</Text>{head.work.attempts.map(a=><Text key={a.key} style={{color:theme.text}}>{`QA ${a.kind} ${a.state} ${a.key}`}</Text>)}</Card>}
    <View style={{gap:12}}>
      <Button label="QA: Tạo bản và ảnh" disabled={busy||!loaded||!!head} onPress={()=>void execute(create)}/>
      <Button label="QA: Chuẩn bị mã metadata" disabled={busy||!head||head.work.attempts.length>0} onPress={()=>void execute(plan)}/>
      <Button label="QA: Kiểm tra dữ liệu gốc" disabled={busy||!head} onPress={()=>void execute(verify)}/>
      <Button label="QA: Xác nhận phiếu tổng hợp" disabled={busy||!head?.work.attempts.some(a=>a.state==='planned')} onPress={()=>void execute(settle)}/>
      <Button label="QA: Tạo ghi dở và kiểm tra" disabled={busy||!head||head.work.contractId!==92001} onPress={()=>void execute(corrupt)}/>
    </View>
  </ScrollView>;
}
