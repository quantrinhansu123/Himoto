import {useCallback,useEffect,useMemo,useState,type ReactNode} from 'react';
import {Platform,ScrollView,Text,View} from 'react-native';
import {router} from 'expo-router';
import {uuid} from 'expo';
import {useSession} from '@/providers/session';
import {openNativeContractWorkStore} from '@/lib/contract-work-files';
import {createDraftWorkController,type DraftWorkController,type WorkLocalPhoto} from '@/lib/draft-work-controller';
import type {ContractWorkHead} from '@/lib/contract-work-journal';
import {pendingWrites} from '@/lib/pending-writes';
import {DRAFT_WORK_RECOVERY_ENABLED} from '@/lib/draft-work-feature';
import {isWorkUuid,sameWorkScope} from '../../../shared/mobile-contract-work';
import {dateTime,useTheme} from '@/theme';
import {Button,Card,InlineError,StateView} from './ui';
import {ConfirmEdit} from './editor-sheet';

type Store=Awaited<ReturnType<typeof openNativeContractWorkStore>>;
export function DraftWorkGate({id,workId,backfill=false,children}:{id:string|null;workId?:string;backfill?:boolean;children:(work:DraftWorkController|null,photos:WorkLocalPhoto[])=>ReactNode}){
  const {api,session}=useSession(),theme=useTheme();
  const origin=api?.origin,userId=session?.user.id,storeId=session?.user.storeId,allStores=session?.user.allStores;
  const scope=useMemo(()=>origin&&userId?{origin,userId,storeId:allStores?null:(storeId??null),allStores:allStores===true}:null,[origin,userId,storeId,allStores]);
  const enabled=DRAFT_WORK_RECOVERY_ENABLED&&Platform.OS!=='web';
  const [store,setStore]=useState<Store|null>(null),[works,setWorks]=useState<ContractWorkHead[]>([]),[loading,setLoading]=useState(enabled),[error,setError]=useState('');
  const [choice,setChoice]=useState<{controller:DraftWorkController;photos:WorkLocalPhoto[]}|null>(null),[discard,setDiscard]=useState<ContractWorkHead|null>(null);
  const open=useCallback(async(j:Store,head:ContractWorkHead|null)=>{
    if(!scope)return;const controller=createDraftWorkController({store:j,scope,workId:head?.work.id??uuid.v4().toLowerCase(),baseDraftId:head?head.work.baseDraftId:(id===null?null:Number(id)),initialHead:head,ledger:pendingWrites,makeUuid:()=>uuid.v4().toLowerCase()});
    const photos=await controller.restorePhotos();setChoice({controller,photos});
  },[scope,id]);
  const load=useCallback(async()=>{
    if(!enabled||!scope)return;setLoading(true);setError('');
    try{
      const j=await openNativeContractWorkStore(scope),all=await j.list();setStore(j);
      if(workId){if(!isWorkUuid(workId))throw Error('Liên kết bản đang soạn không hợp lệ.');const head=all.find(row=>row.work.id===workId&&row.work.status==='open');if(!head)throw Error('Không tìm thấy bản đang soạn của tài khoản này.');await open(j,head);}
      else{const rows=all.filter(row=>row.work.status==='open'&&(id===null?row.work.baseDraftId===null&&Boolean(row.work.input.draft.backfill)===backfill:row.work.baseDraftId===Number(id)||row.work.contractId===Number(id)));setWorks(rows);if(!rows.length)await open(j,null);}
    }catch(cause){setError((cause as Error).message);}finally{setLoading(false);}
  },[enabled,scope,workId,id,backfill,open]);
  useEffect(()=>{let active=true;void Promise.resolve().then(()=>{if(active)void load();});return()=>{active=false;};},[load]);
  if(!enabled)return children(null,[]);
  if(loading)return <StateView title="Đang kiểm tra bản đang soạn" loading/>;
  if(choice)return children(choice.controller,choice.photos);
  if(error)return <View style={{flex:1}}><StateView title="Chưa mở được bản đang soạn" message={error} retry={()=>void load()}/><Button secondary label="Về Tài khoản để đối chiếu" onPress={()=>router.dismissTo('/(tabs)/account')}/></View>;
  return <ScrollView contentContainerStyle={{padding:20,gap:16}}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:24,fontWeight:'700'}}>Có bản đang soạn trên thiết bị</Text>
    <Text style={{color:theme.muted,fontSize:16,lineHeight:24}}>Tiếp tục thông tin và ảnh đã giữ. Nếu đã gửi lưu, app sẽ đối chiếu đúng hợp đồng gốc trước khi gửi tiếp.</Text>
    {works.map(head=><Card key={head.work.id} style={{gap:12}}>
      <Text style={{color:theme.text,fontSize:18,fontWeight:'600'}}>{head.work.input.draft.contract_number?`Hợp đồng giấy ${head.work.input.draft.contract_number}`:'Bản đang soạn chưa có số giấy'}</Text>
      <Text style={{color:theme.muted}}>{head.work.contractId?`Đã có hợp đồng #${head.work.contractId}`:`Bước ${head.work.step+1} · Chưa có kết quả lưu`} · {dateTime(new Date(head.work.updatedAt).toISOString())}</Text>
      {scope&&!sameWorkScope(head.work.scope,scope)&&<InlineError message="Cơ sở hoặc quyền đã đổi. Bản gốc được giữ để đối chiếu, chưa được sửa hoặc gửi tiếp."/>}
      <Button label={`Tiếp tục bản đang soạn ${head.work.input.draft.contract_number||''}`.trim()} onPress={()=>{if(store)void open(store,head).catch(cause=>setError((cause as Error).message));}}/>
      <Button secondary label={`Bỏ bản trên thiết bị ${head.work.input.draft.contract_number||''}`.trim()} disabled={head.work.attempts.some(a=>a.state==='planned'||!a.acknowledged)} onPress={()=>setDiscard(head)}/>
    </Card>)}
    <Button secondary label="Soạn bản mới" onPress={()=>{if(store)void open(store,null).catch(cause=>setError((cause as Error).message));}}/>
    {discard&&<ConfirmEdit title="Bỏ bản đang soạn trên thiết bị?" message="Thông tin và ảnh chưa gửi của bản này sẽ không dùng để gửi tiếp. Hợp đồng hoặc ảnh đã lưu trên máy chủ và ảnh gốc trên điện thoại được giữ." confirmLabel="Bỏ bản trên thiết bị" onCancel={()=>setDiscard(null)} onConfirm={()=>{const head=discard;setDiscard(null);if(store&&scope)void store.change(head,scope,{type:'discard'}).then(()=>load()).catch(cause=>setError((cause as Error).message));}}/>}
  </ScrollView>;
}
