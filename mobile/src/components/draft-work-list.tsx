import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Platform,Text,View} from 'react-native';
import {router,useFocusEffect} from 'expo-router';
import {useSession} from '@/providers/session';
import {openNativeContractWorkStore} from '@/lib/contract-work-files';
import {DRAFT_WORK_RECOVERY_ENABLED} from '@/lib/draft-work-feature';
import {draftWorkDestination} from '@/lib/draft-work-access';
import type {ContractWorkHead} from '@/lib/contract-work-journal';
import {useTheme} from '@/theme';
import {Button,Card,InlineError} from './ui';

export function DraftWorkList(){
  const {api,session}=useSession(),theme=useTheme();
  const origin=api?.origin,userId=session?.user.id,storeId=session?.user.storeId,allStores=session?.user.allStores;
  const scope=useMemo(()=>origin&&userId?{origin,userId,storeId:allStores?null:(storeId??null),allStores:allStores===true}:null,[origin,userId,storeId,allStores]);
  const [rows,setRows]=useState<ContractWorkHead[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const alive=useRef(true),epoch=useRef(0);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const enabled=DRAFT_WORK_RECOVERY_ENABLED&&Platform.OS!=='web'&&!!session;
  const load=useCallback(async()=>{if(!enabled||!scope)return;const at=++epoch.current,current=()=>alive.current&&at===epoch.current;setBusy(true);setError('');try{const store=await openNativeContractWorkStore(scope);if(!current())return;const all=await store.list();if(current())setRows(all.filter(head=>head.work.status==='open'));}catch(cause){if(current())setError((cause as Error).message);}finally{if(current())setBusy(false);}},[enabled,scope]);
  useFocusEffect(useCallback(()=>{void load();return()=>{epoch.current++;};},[load]));
  if(!enabled)return null;
  return <Card style={{gap:12}}><Text accessibilityRole="header" style={{color:theme.text,fontSize:20,fontWeight:'700'}}>Bản đang soạn trên thiết bị</Text>
    {error&&<InlineError message={error}/>}
    {!rows.length&&!error&&!busy&&<Text style={{color:theme.muted}}>Không có bản đang soạn được giữ trên thiết bị.</Text>}
    {rows.map(head=>{const destination=scope?draftWorkDestination(session?.user.permissions??[],head.work,scope):'held';return <View key={head.work.id} style={{gap:8}}><Text style={{color:theme.text}}>{head.work.input.draft.contract_number?`Hợp đồng giấy ${head.work.input.draft.contract_number}`:'Bản chưa có số hợp đồng giấy'}{head.work.contractId?` · Đã lưu #${head.work.contractId}`:''}</Text>{destination==='held'&&<Text style={{color:theme.warning}}>Bản chưa có kết quả lưu được giữ nguyên. Cần quyền soạn hợp đồng và cơ sở gốc để tiếp tục hoặc đối chiếu.</Text>}<Button secondary label={`Mở bản đang soạn ${head.work.input.draft.contract_number||''}`.trim()} disabled={destination==='held'} onPress={()=>router.push({pathname:destination==='media'?'/draft-work-media/[id]':'/draft-work/[id]',params:{id:head.work.id}})}/></View>;})}
    <Button secondary label="Tải lại bản đang soạn trên thiết bị" loading={busy} onPress={()=>void load()}/>
  </Card>;
}
