import {useEffect,useMemo,useRef,useState} from 'react';
import {ScrollView,Text,View,type ScrollViewInstance} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router,useLocalSearchParams} from 'expo-router';
import {uuid} from 'expo';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useSession} from '@/providers/session';
import {useTheme} from '@/theme';
import {Button,Card,InlineError,StateView} from '@/components/ui';
import {FormField} from '@/components/form-fields';
import {useReducedMotion} from '@/hooks/use-reduced-motion';
import {pendingWrites} from '@/lib/pending-writes';
import {gpsMappingOperation,type MobileGpsMappingVehicle,type MobileGpsMappingReceipt} from '../../../../shared/mobile-gps-mapping';

export default function GpsMappingScreen() {
  const {id:raw}=useLocalSearchParams<{id:string}>(),id=typeof raw==='string'?raw:'',{api,session}=useSession(),theme=useTheme(),cache=useQueryClient();
  const operation=gpsMappingOperation(Number(id));
  const scroll=useRef<ScrollViewInstance>(null),reducedMotion=useReducedMotion();
  const scope=useMemo(()=>api&&session?{origin:api.origin,userId:session.user.id,storeId:session.user.allStores?null:session.user.storeId,allStores:session.user.allStores}:null,[api,session]);
  const epoch=useRef({generation:0}),running=useRef(false);
  useEffect(()=>{const guard=epoch.current;guard.generation++;return()=>{guard.generation++;};},[api,session]);
  const [selection,setSelection]=useState<MobileGpsMappingVehicle|null|undefined>(undefined),[pending,setPending]=useState<string|null>(null),[receipt,setReceipt]=useState<MobileGpsMappingReceipt|null>(null);
  const [search,setSearch]=useState(''),[appliedSearch,setAppliedSearch]=useState(''),[page,setPage]=useState(1),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const context=useQuery({queryKey:['gps-mapping',api?.origin,session?.user.id,session?.user.storeId,session?.user.allStores,id],retry:false,staleTime:0,
    enabled:!!api&&!!scope&&/^[1-9]\d{0,14}$/.test(id),
    queryFn:async({signal})=>{const key=await pendingWrites.lookup(scope!,operation);if(signal.aborted)throw Error('Đã dừng tải.');
      if(key){const result=await api!.gpsMappingReceipt(key);if(result.receipt&&String(result.receipt.id)!==id)throw Error('Kết quả ghép không khớp thiết bị. Giữ mã để đối chiếu.');return{key,receipt:result.receipt,preparation:null};}
      return{key:null,receipt:null,preparation:await api!.gpsMapping(id,signal)};},
  });
  const key=pending||context.data?.key||null,proof=receipt||context.data?.receipt||null,preparation=context.data?.preparation;
  const candidates=useQuery({queryKey:['gps-mapping-candidates',api?.origin,session?.user.id,id,appliedSearch,page],retry:false,
    enabled:!!api&&!!preparation&&!key,queryFn:({signal})=>api!.gpsMappingCandidates(id,appliedSearch,page,signal)});
  const selected=selection===undefined?preparation?.vehicle??null:selection;
  const active=(version:number)=>epoch.current.generation===version;
  async function save() {
    if(!api||!scope||!preparation||key||running.current)return;
    const version=epoch.current.generation;running.current=true;setBusy(true);setError('');setNotice('');
    try{
      const reserved=await pendingWrites.reserveExclusive(scope,operation,[operation],()=>uuid.v4().toLowerCase());
      if(!active(version))return;setPending(reserved.key);
      if(!reserved.created){const result=await api.gpsMappingReceipt(reserved.key);if(active(version)){setReceipt(result.receipt);setNotice('Có mã ghép GPS cần đối chiếu trước khi tiếp tục.');}return;}
      const result=await api.saveGpsMapping(id,{snapshot:preparation.snapshot,vehicleId:selected?.id??null,vehicleRevision:selected?.revision??null},reserved.key);
      if(active(version)){setReceipt(result);void cache.invalidateQueries({queryKey:['gps']});}
    }catch(cause){if(active(version))setError((cause as Error).message);}
    finally{running.current=false;if(active(version))setBusy(false);}
  }
  async function resolve() {
    if(!api||!scope||!key||running.current)return;const version=epoch.current.generation;running.current=true;setBusy(true);setError('');
    try{
      const result=await api.resolveWrite(key,operation);if(!active(version))return;
      if(result.status==='committed'){
        const found=await api.gpsMappingReceipt(key);if(!active(version))return;
        if(!found.receipt||String(found.receipt.id)!==id)throw Error('Chưa tải được kết quả gốc. Giữ mã để đối chiếu.');
        setReceipt(found.receipt);void cache.invalidateQueries({queryKey:['gps']});
      }else{
        await pendingWrites.complete(scope,operation,key);if(!active(version))return;
        setPending(null);setSelection(undefined);setNotice('Đã xác nhận chưa ghép và khóa mã cũ. Tải lại thiết bị trước khi tiếp tục.');await context.refetch();
      }
    }catch(cause){if(active(version))setError((cause as Error).message);}
    finally{running.current=false;if(active(version))setBusy(false);}
  }
  async function acknowledge() {
    if(!scope||!key||!proof||running.current)return;const version=epoch.current.generation;running.current=true;setBusy(true);setError('');
    try{await pendingWrites.complete(scope,operation,key);if(active(version)){void cache.invalidateQueries({queryKey:['gps']});router.dismissTo('/gps');}}
    catch(cause){if(active(version))setError((cause as Error).message);}
    finally{running.current=false;if(active(version))setBusy(false);}
  }
  const textStyle={color:theme.text,fontSize:16,lineHeight:24},muted={color:theme.muted,fontSize:13,lineHeight:20};
  const vehicleLabel=(vehicle:MobileGpsMappingVehicle|null)=>vehicle?`${vehicle.license||vehicle.name} · ${vehicle.storeName||'Chưa có cơ sở'}`:'Không ghép xe';
  if(!/^[1-9]\d{0,14}$/.test(id))return <StateView title="Mã thiết bị không hợp lệ"/>;
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}><ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,gap:16,paddingBottom:32}}>
    {!!(error||context.error)&&<InlineError message={error||context.error?.message||'Chưa tải được thiết bị.'}/>}
    {!!notice&&<Text accessibilityLiveRegion="polite" style={textStyle}>{notice}</Text>}
    {context.isPending&&<StateView title="Đang kiểm tra thiết bị và mã lần lưu" loading/>}
    {context.isError&&<Button label="Tải lại thiết bị GPS" secondary onPress={()=>void context.refetch()}/>}
    {key?<Card style={{gap:12}}>
      <Text accessibilityRole="header" style={{...textStyle,fontSize:20,fontWeight:'700'}}>{proof?'Kết quả ghép GPS đã ghi':'Cần đối chiếu lần ghép GPS'}</Text>
      <Text selectable style={muted}>Mã lần lưu: {key}</Text>
      {proof?<><Text style={textStyle}>{proof.device.provider} · {proof.device.externalId}</Text><Text style={muted}>Trước: {vehicleLabel(proof.before)}</Text><Text style={textStyle}>Đã ghi: {vehicleLabel(proof.after)}</Text><Text style={muted}>{proof.actorName} · {new Date(proof.recordedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</Text>
        <Text style={muted}>{proof.current?'Thiết bị vẫn khớp kết quả này.':'Ghép hiện tại đã thay đổi hoặc thiết bị không còn. Đây là kết quả gốc của mã lần lưu.'}</Text>
        <Button label="Đã kiểm tra kết quả ghép GPS" loading={busy} onPress={()=>void acknowledge()}/>
      </>:<><Text style={textStyle}>Chưa xác định được kết quả. Đối chiếu sẽ mở kết quả gốc nếu đã lưu; nếu chưa lưu, server khóa mã cũ trước khi cho thử lại.</Text><Button label="Đối chiếu và kết thúc mã ghép GPS" loading={busy} onPress={()=>void resolve()}/></>}
    </Card>:preparation?<>
      <Card style={{gap:10}}><Text accessibilityRole="header" style={{...textStyle,fontSize:20,fontWeight:'700'}}>{preparation.device.name||preparation.device.externalId}</Text><Text selectable style={muted}>{preparation.device.provider} · IMEI {preparation.device.externalId}</Text><Text style={textStyle}>Đang ghép: {vehicleLabel(preparation.vehicle)}</Text><Text style={textStyle}>Sẽ ghép: {vehicleLabel(selected)}</Text>
        <Text style={muted}>Đổi sang xe khác sẽ xóa cả hai mốc dừng hiện tại. Ghép lại cùng xe giữ các mốc này.</Text><Button label={selected?'Lưu ghép GPS với xe đã chọn':'Lưu bỏ ghép GPS khỏi xe'} loading={busy} onPress={()=>void save()}/><Button label="Chọn không ghép xe" secondary disabled={busy} onPress={()=>setSelection(null)}/>
      </Card>
      <FormField label="Tìm xe để ghép GPS" value={search} onChangeText={setSearch} maxLength={120} returnKeyType="search" onSubmitEditing={()=>{setAppliedSearch(search);setPage(1);}}/>
      <Button label="Tìm xe ghép GPS" secondary disabled={busy} onPress={()=>{setAppliedSearch(search);setPage(1);}}/>
      {candidates.error&&<InlineError message={candidates.error.message}/>}
      {candidates.isPending&&<StateView title="Đang tải xe để ghép" loading/>}
      {candidates.data?.rows.map(vehicle=><Card key={vehicle.id} style={{gap:8}}><Text style={textStyle}>{vehicleLabel(vehicle)}</Text><Text style={muted}>{vehicle.name}</Text><Button label={`Chọn ghép ${vehicle.license||vehicle.name}`} secondary disabled={busy||selected?.id===vehicle.id} onPress={()=>{setSelection(vehicle);scroll.current?.scrollTo({y:0,animated:!reducedMotion});}}/></Card>)}
      {!!candidates.data&&!candidates.data.rows.length&&<Text style={muted}>Không tìm thấy xe phù hợp.</Text>}
      <View style={{gap:10}}><Button label="Trang xe ghép trước" secondary disabled={busy||page<=1} onPress={()=>setPage(old=>old-1)}/><Button label="Trang xe ghép tiếp" secondary disabled={busy||!candidates.data?.hasMore} onPress={()=>setPage(old=>old+1)}/></View>
    </>:null}
  </ScrollView></SafeAreaView>;
}
