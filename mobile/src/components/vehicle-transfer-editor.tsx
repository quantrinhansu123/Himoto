import {useEffect,useRef,useState} from 'react';
import {Keyboard,KeyboardAvoidingView,Platform,Pressable,ScrollView,Text,type ScrollViewInstance} from 'react-native';
import {keepPreviousData,useQuery} from '@tanstack/react-query';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {MobileVehicleTransferAction,MobileVehicleTransferInput,MobileVehicleTransferPreparation,MobileVehicleTransferPreview,MobileTransferStore} from '../../../shared/mobile-vehicle-transfers';
import {useSession} from '@/providers/session';
import {useVehicleTransferWrite} from '@/hooks/use-vehicle-transfer-write';
import {useReducedMotion} from '@/hooks/use-reduced-motion';
import {transferLabels,transferEffects,vehicleTransferInput,type TransferPending} from '@/lib/vehicle-transfer-form';
import {statuses,useTheme} from '@/theme';
import {Button,Card,InlineError,StateView} from './ui';
import {FormField} from './form-fields';
import {ConfirmEdit} from './editor-sheet';

export function VehicleTransferEditor({id}:{id:string}){
  const {api,session}=useSession();
  if(!api||!session||!/^[1-9]\d{0,14}$/.test(id)||!session.user.permissions.includes('vehicles.read'))
    return <StateView title="Không mở được điều chuyển" message="Kiểm tra xe và quyền xem đội xe."/>;
  return <TransferForm key={[api.origin,session.token,session.user.storeId,session.user.allStores,id].join('|')} id={id}/>;
}
function TransferForm({id}:{id:string}){
  const {api,session}=useSession(),theme=useTheme(),reduced=useReducedMotion(),scroll=useRef<ScrollViewInstance>(null);
  const [step,setStep]=useState(0),[selection,setSelection]=useState<{action:MobileVehicleTransferAction;data:MobileVehicleTransferPreparation}|null>(null);
  const [destination,setDestination]=useState<MobileTransferStore|null>(null),[note,setNote]=useState(''),[search,setSearch]=useState(''),[applied,setApplied]=useState(''),[page,setPage]=useState(1);
  const [review,setReview]=useState<MobileVehicleTransferPreview|null>(null),[input,setInput]=useState<MobileVehicleTransferInput|null>(null);
  const [previewing,setPreviewing]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(false),[reload,setReload]=useState(false),[resolving,setResolving]=useState<TransferPending|null>(null);
  const alive=useRef(true),running=useRef(false),abort=useRef<AbortController|null>(null);
  const write=useVehicleTransferWrite(id,!!selection||!!note);
  const query=useQuery({queryKey:['vehicle-transfer-preparation',session?.user.id,session?.user.storeId,session?.user.allStores,id],
    queryFn:({signal})=>api!.vehicleTransferPreparation(id,signal),enabled:write.checked&&!write.pending.length&&step===0,staleTime:0,gcTime:0,refetchOnWindowFocus:false,refetchOnReconnect:false});
  const stores=useQuery({queryKey:['transfer-destinations',session?.user.id,session?.user.storeId,session?.user.allStores,id,selection?.data.vehicle.revision,applied,page],
    queryFn:({signal})=>api!.transferDestinations(id,selection!.data.vehicle.revision,applied,page,signal),enabled:write.checked&&!write.pending.length&&selection?.action==='transfer'&&step===1,
    placeholderData:keepPreviousData,staleTime:0,gcTime:0,refetchOnWindowFocus:false,refetchOnReconnect:false});
  const locked=previewing||write.busy||!write.checked||write.pending.length>0;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;abort.current?.abort();};},[]);
  const top=()=>{Keyboard.dismiss();scroll.current?.scrollTo({y:0,animated:!reduced});};
  function clearReview(){setReview(null);setInput(null);setError('');}
  function reset(){setReload(false);setSelection(null);setDestination(null);setNote('');setSearch('');setApplied('');setPage(1);setStep(0);clearReview();top();void query.refetch();}
  async function preview(){
    if(!api||!selection||locked||running.current)return;
    setError('');Keyboard.dismiss();
    try{
      const body=vehicleTransferInput(selection.data,selection.action,destination,note);
      running.current=true;setPreviewing(true);abort.current=new AbortController();
      const result=await api.vehicleTransferPreview(id,body,abort.current.signal);if(!alive.current)return;
      setReview(result);setInput(body);setStep(2);top();
    }catch(cause){if(alive.current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current)setPreviewing(false);}
  }
  const overlays=<>
    {write.exit&&<ConfirmEdit title={write.busy?'Đang ghi thao tác kho':'Rời bước điều chuyển?'} busy={write.busy}
      message={write.busy?'Chờ máy chủ xác nhận kết quả.':'Nội dung chưa gửi sẽ mất. Mã đã gửi vẫn được giữ để đối chiếu.'} confirmLabel="Rời bước điều chuyển" onCancel={write.dismissExit} onConfirm={write.leave}/>}
    {reload&&<ConfirmEdit title="Tải lại xe và lượt chuyển?" message="Lấy thông tin mới nhất. Kho đến và ghi chú đang nhập sẽ được bỏ."
      confirmLabel="Tải lại và nhập lại" onCancel={()=>setReload(false)} onConfirm={reset}/>}
    {resolving&&<ConfirmEdit title="Đối chiếu thao tác kho?" message="Nếu đã ghi, mở phiếu gốc. Nếu chưa ghi, máy chủ khóa mã cũ và chặn yêu cầu đến muộn."
      confirmLabel="Đối chiếu với máy chủ" onCancel={()=>setResolving(null)} onConfirm={()=>{const entry=resolving;setResolving(null);void write.resolve(entry).then(cancelled=>{
        if(cancelled&&alive.current){clearReview();setStep(selection?1:0);top();}
      });}}/>}
    {confirm&&review&&input&&<ConfirmEdit title={transferLabels[review.action]+'?'}
      message={(review.vehicle.license||review.vehicle.name)+' · '+transferEffects[review.effect]+' Kho và cơ sở sở hữu sau ghi: '+
        (review.after.storeId===review.toStore.id?review.toStore.name:review.fromStore?.name)+'. Kiểm tra trước khi xác nhận.'}
      confirmLabel={'Xác nhận '+transferLabels[review.action].toLowerCase()} onCancel={()=>setConfirm(false)} onConfirm={()=>{setConfirm(false);void write.submit({...input,review_snapshot:review.snapshot});}}/>}
  </>;
  const frame=(children:React.ReactNode)=><SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}>
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{padding:20,gap:18,maxWidth:760,width:'100%',alignSelf:'center'}}>{children}</ScrollView>
    </KeyboardAvoidingView>{overlays}
  </SafeAreaView>;
  if(write.pending.length)return frame(<Card style={{gap:16}}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:'800'}}>Thao tác kho đang chờ đối chiếu</Text>
    <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>Đối chiếu các mã của xe này trước thao tác mới. Nội dung đang nhập được giữ trong màn hình.</Text>
    {!!write.error&&<InlineError message={write.error}/>}
    {write.pending.map(entry=><Card key={entry.key} style={{gap:12}}>
      <Text style={{color:theme.text,fontSize:18,fontWeight:'700'}}>{transferLabels[entry.action]}</Text>
      <Button label={'Đối chiếu '+transferLabels[entry.action].toLowerCase()} loading={write.busy} onPress={()=>setResolving(entry)}/>
      <Button label={'Mở phiếu '+transferLabels[entry.action].toLowerCase()} secondary disabled={write.busy} onPress={()=>write.openReceipt(entry.action)}/>
    </Card>)}
  </Card>);
  if(!write.checked)return frame(<Card style={{gap:16}}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:23,fontWeight:'700'}}>Kiểm tra thao tác trên thiết bị</Text>
    {!!write.error&&<InlineError message={write.error}/>}
    <Button label="Đọc lại các thao tác kho" loading={write.checking} onPress={()=>{void write.checkPending();}}/>
  </Card>);
  const data=selection?.data??query.data,vehicle=data?.vehicle;
  return frame(<>
    <Card style={{gap:10}}>
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:'800'}}>Điều chuyển và nhận xe</Text>
      <Text style={{color:theme.text,fontSize:19,fontWeight:'700'}}>{vehicle?.license||vehicle?.name||('#'+id)}</Text>
      {vehicle&&<>
        <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>{statuses[vehicle.status]||vehicle.status} · Kho hiện tại: {vehicle.storeName||'Chưa rõ kho hiện tại'}</Text>
        <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>Cơ sở sở hữu hiện tại: {vehicle.ownerStoreName||'Chưa xác định'}</Text>
      </>}
      <Text accessibilityLiveRegion="polite" style={{color:theme.text,fontSize:16}}>Bước {step+1}/3 · {step===0?'Chọn thao tác':step===1?'Thông tin thực tế':'Rà soát trước khi ghi'}</Text>
    </Card>
    {!!(error||write.error)&&<InlineError message={error||write.error}/>}
    {!!write.notice&&<Text accessibilityLiveRegion="polite" style={{color:theme.text,fontSize:16,lineHeight:25}}>{write.notice}</Text>}
    {step===0&&<Card style={{gap:16}}>
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:21,fontWeight:'700'}}>1. Chọn thao tác kho</Text>
      {query.isPending&&<Text style={{color:theme.muted}}>Đang kiểm tra xe và lượt chuyển…</Text>}
      {query.isError&&<InlineError message={(query.error as Error).message}/>}
      {query.data?.actions.map(gate=><Card key={gate.action} style={{gap:8}}>
        <Button label={transferLabels[gate.action]} secondary disabled={locked||query.isFetching||query.isError||!gate.available}
          onPress={()=>{setSelection({action:gate.action,data:query.data!});setDestination(null);setPage(1);clearReview();setStep(1);top();}}/>
        {!!gate.blockedReason&&<Text style={{color:theme.muted,fontSize:15,lineHeight:23}}>{gate.blockedReason}</Text>}
      </Card>)}
      <Button label="Tải lại xe và lượt chuyển" secondary loading={query.isFetching} disabled={locked} onPress={()=>selection?setReload(true):void query.refetch()}/>
    </Card>}
    {step===1&&selection&&<>
      <Card style={{gap:14}}>
        <Text accessibilityRole="header" style={{color:theme.text,fontSize:21,fontWeight:'700'}}>2. {transferLabels[selection.action]}</Text>
        {selection.action==='transfer'?<>
          <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>{selection.data.vehicle.status==='ready'?transferEffects.awaiting_receipt:transferEffects.immediate_transfer}</Text>
          <Text style={{color:theme.text,fontSize:16,lineHeight:25}}>Cơ sở sở hữu cũng chuyển sang kho đến ngay khi ghi điều chuyển.</Text>
          <FormField label="Tìm kho đến" value={search} onChangeText={setSearch} maxLength={120} editable={!locked} returnKeyType="search"
            onSubmitEditing={()=>{if(!locked){setApplied(search.trim());setPage(1);Keyboard.dismiss();}}}/>
          <Button label="Tìm cơ sở nhận" secondary disabled={locked} onPress={()=>{setApplied(search.trim());setPage(1);Keyboard.dismiss();}}/>
        </>:<>
          <Text style={{color:theme.text,fontSize:16,lineHeight:25}}>Kho đi: {selection.data.transfer?.fromStoreName||'Chưa rõ kho đi'}</Text>
          <Text style={{color:theme.text,fontSize:16,lineHeight:25}}>Kho đến: {selection.data.transfer?.toStoreName||'Chưa rõ kho đến'}</Text>
          <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>{selection.action==='receive'?transferEffects.received:selection.action==='reject'?transferEffects.rejected:transferEffects.cancelled}</Text>
        </>}
      </Card>
      {selection.action==='transfer'&&<Card style={{gap:14}}>
        {stores.isError&&<InlineError message={(stores.error as Error).message}/>}
        {stores.isFetching&&<Text style={{color:theme.muted}}>Đang tải kho đến…</Text>}
        {!stores.isFetching&&!stores.isError&&stores.data?.rows.length===0&&<Text style={{color:theme.muted,fontSize:16}}>Không có kho phù hợp với từ khóa.</Text>}
        {stores.data?.rows.map(store=><Pressable key={store.id} accessibilityRole="radio" accessibilityLabel={'Chọn kho đến '+store.name}
          accessibilityState={{checked:destination?.id===store.id,disabled:locked||stores.isFetching||stores.isError}} disabled={locked||stores.isFetching||stores.isError}
          onPress={()=>{setDestination(store);clearReview();}} style={{minHeight:56,padding:14,borderRadius:12,borderWidth:destination?.id===store.id?2:1,borderColor:destination?.id===store.id?theme.primary:theme.border}}>
          <Text style={{color:theme.text,fontSize:17,fontWeight:'600'}}>{store.name}</Text>
        </Pressable>)}
        <Text style={{color:theme.muted,fontSize:15}}>Trang kho {page}</Text>
        <Button label="Trang cơ sở trước" secondary disabled={locked||stores.isFetching||page===1} onPress={()=>{setPage(p=>p-1);top();}}/>
        <Button label="Trang cơ sở tiếp" secondary disabled={locked||stores.isFetching||!stores.data?.hasMore} onPress={()=>{setPage(p=>p+1);top();}}/>
        <Button label="Tải lại kho đến" secondary loading={stores.isFetching} disabled={locked} onPress={()=>{void stores.refetch();}}/>
      </Card>}
      {selection.action==='transfer'&&destination&&<Text style={{color:theme.text,fontSize:17,fontWeight:'700'}}>Kho đã chọn: {destination.name}</Text>}
      <Card style={{gap:12}}><FormField label="Ghi chú thao tác kho" value={note} onChangeText={value=>{setNote(value);clearReview();}} maxLength={500} multiline editable={!locked}/></Card>
      <Button label="Rà soát thao tác kho" loading={previewing} disabled={locked||selection.action==='transfer'&&(!destination||stores.isFetching||stores.isError)} onPress={()=>{void preview();}}/>
      <Button label="Chọn thao tác khác" secondary disabled={locked} onPress={()=>{setStep(0);clearReview();top();}}/>
      <Button label="Tải lại để nhập lại" secondary disabled={locked} onPress={()=>setReload(true)}/>
    </>}
    {step===2&&review&&<>
      <Card style={{gap:14}}>
        <Text accessibilityRole="header" style={{color:theme.text,fontSize:21,fontWeight:'700'}}>3. Rà soát thao tác kho</Text>
        <Text style={{color:theme.text,fontSize:20,fontWeight:'700'}}>{transferLabels[review.action]} · {review.vehicle.license||review.vehicle.name}</Text>
        <Text style={{color:theme.text,fontSize:17,lineHeight:27}}>Kho đi: {review.fromStore?.name||'Chưa rõ kho đi'}</Text>
        <Text style={{color:theme.text,fontSize:17,lineHeight:27}}>Kho đến: {review.toStore.name}</Text>
        <Text style={{color:theme.text,fontSize:17,lineHeight:27}}>{transferEffects[review.effect]}</Text>
        <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>Sau ghi: {statuses[review.after.status]||review.after.status} · {review.after.storeId===review.toStore.id?review.toStore.name:review.fromStore?.name}</Text>
        <Text style={{color:theme.text,fontSize:16,lineHeight:25}}>Cơ sở sở hữu trước: {review.vehicle.ownerStoreName||'Chưa xác định'}</Text>
        <Text style={{color:theme.text,fontSize:16,lineHeight:25}}>Cơ sở sở hữu sau: {review.after.ownerStoreId===review.toStore.id?review.toStore.name:review.fromStore?.name}</Text>
        {!!review.note&&<Text style={{color:theme.text,fontSize:16,lineHeight:25}}>{review.note}</Text>}
        <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>Không thay đổi hợp đồng, kỳ thuê, tiền cọc hoặc khoản đã thu/hoàn.</Text>
      </Card>
      <Button label="Ghi thao tác kho" loading={write.busy} disabled={locked||!input} onPress={()=>setConfirm(true)}/>
      <Button label="Sửa thông tin thao tác" secondary disabled={locked} onPress={()=>{setStep(1);clearReview();top();}}/>
      <Button label="Tải lại để nhập lại" secondary disabled={locked} onPress={()=>setReload(true)}/>
    </>}
  </>);
}
