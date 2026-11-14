import { KeyboardFormScrollView } from "./keyboard-form-scroll-view";
import {useEffect,useRef,useState} from 'react';
import {Keyboard,Pressable,Text,type ScrollViewInstance} from 'react-native';
import {keepPreviousData,useQuery} from '@tanstack/react-query';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {MobileSwapInput,MobileSwapLine,MobileSwapPreparation,MobileSwapPreview,MobileSwapVehicle} from '../../../shared/mobile-swaps';
import {useSession} from '@/providers/session';
import {useSwapWrite} from '@/hooks/use-swap-write';
import {useReducedMotion} from '@/hooks/use-reduced-motion';
import {dateTime,useTheme} from '@/theme';
import {Button,Card,InlineError,StateView} from './ui';
import {FormField} from './form-fields';
import {ConfirmEdit} from './editor-sheet';

export function SwapEditor({id}:{id:string}) {
  const {session,api}=useSession();
  if(!api||!session||!/^[1-9]\d{0,14}$/.test(id)||!session.user.permissions.includes('contracts.read')||!session.user.permissions.includes('contracts.return'))
    return <StateView title="Không mở được đổi xe" message="Tài khoản cần quyền xem hợp đồng và trả/đổi xe."/>;
  return <SwapForm key={[api.origin,session.token,session.user.storeId,session.user.allStores,session.user.permissions.join(','),id].join(':')} id={id}/>;
}
function SwapForm({id}:{id:string}) {
  const {api,session}=useSession(),theme=useTheme(),reduced=useReducedMotion(),scroll=useRef<ScrollViewInstance>(null);
  const [step,setStep]=useState(0),[page,setPage]=useState(1),[candidatePage,setCandidatePage]=useState(1);
  const [selection,setSelection]=useState<{order:MobileSwapPreparation;item:MobileSwapLine}|null>(null);
  const [vehicle,setVehicle]=useState<MobileSwapVehicle|null>(null),[search,setSearch]=useState(''),[applied,setApplied]=useState('');
  const [review,setReview]=useState<MobileSwapPreview|null>(null),[input,setInput]=useState<MobileSwapInput|null>(null);
  const [previewing,setPreviewing]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(false),[resolving,setResolving]=useState(false),[reload,setReload]=useState(false);
  const alive=useRef(true),running=useRef(false),abort=useRef<AbortController|null>(null);
  const action=useSwapWrite(id,!!selection);
  const query=useQuery({queryKey:['swap-preparation',session?.user.id,session?.user.storeId,session?.user.allStores,id,page],
    queryFn:({signal})=>api!.swapPreparation(id,page,signal),enabled:action.checked&&!action.key&&step===0,placeholderData:keepPreviousData,
    staleTime:0,gcTime:0,refetchOnWindowFocus:false,refetchOnReconnect:false});
  const candidates=useQuery({queryKey:['swap-candidates',session?.user.id,session?.user.storeId,session?.user.allStores,id,selection?.order.revision,
    selection?.item.id,selection?.item.revision,applied,candidatePage],
    queryFn:({signal})=>api!.swapCandidates(id,selection!.order.revision,selection!.item.id,selection!.item.revision,applied,candidatePage,signal),
    enabled:action.checked&&!action.key&&!!selection&&step===1,placeholderData:keepPreviousData,staleTime:0,gcTime:0,refetchOnWindowFocus:false,refetchOnReconnect:false});
  const locked=previewing||action.busy||!action.checked||!!action.key;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;abort.current?.abort();};},[]);
  const top=()=>{Keyboard.dismiss();scroll.current?.scrollTo({y:0,animated:!reduced});};
  function clearReview(){setReview(null);setInput(null);setError('');}
  function applySearch(){if(locked)return;Keyboard.dismiss();setApplied(search.trim());setCandidatePage(1);}
  async function preview(){
    if(!api||!selection||!vehicle||locked||running.current)return;
    if(vehicle.id===selection.item.vehicleId){setError('Chọn xe thay thế khác xe đang thuê.');return;}
    running.current=true;setPreviewing(true);setError('');Keyboard.dismiss();abort.current=new AbortController();
    const body:MobileSwapInput={revision:selection.order.revision,item_id:selection.item.id,item_revision:selection.item.revision,vehicle_id:vehicle.id,vehicle_revision:vehicle.revision};
    try{
      const result=await api.swapPreview(id,body,abort.current.signal);if(!alive.current)return;
      setInput(body);setReview(result);setStep(2);top();
    }catch(cause){if(alive.current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current)setPreviewing(false);}
  }
  function reset(){
    setReload(false);setSelection(null);setVehicle(null);setSearch('');setApplied('');setCandidatePage(1);setPage(1);setStep(0);clearReview();top();
    void query.refetch();
  }
  const overlays=<>
    {resolving&&<ConfirmEdit title="Đối chiếu đổi xe?" message="Nếu đã ghi, mở phiếu gốc để kiểm tra. Nếu chưa ghi, máy chủ khóa mã cũ và chặn yêu cầu đến muộn."
      confirmLabel="Đối chiếu với máy chủ" onCancel={()=>setResolving(false)} onConfirm={()=>{setResolving(false);void action.resolve().then(cancelled=>{
        if(cancelled&&alive.current){clearReview();setStep(selection?1:0);top();}
      });}}/>}
    {action.exit&&<ConfirmEdit title={action.busy?'Đang ghi đổi xe':'Rời bước đổi xe?'} busy={action.busy}
      message={action.busy?'Chờ máy chủ xác nhận kết quả.':'Lựa chọn chưa gửi sẽ mất. Mã yêu cầu đã gửi vẫn được giữ để đối chiếu.'}
      confirmLabel="Rời bước đổi xe" onCancel={action.dismissExit} onConfirm={action.leave}/>}
    {reload&&<ConfirmEdit title="Tải lại lựa chọn đổi xe?" message="Lấy hợp đồng và kho mới nhất. Các xe đang chọn sẽ được bỏ để chọn lại."
      confirmLabel="Tải lại và chọn lại xe" onCancel={()=>setReload(false)} onConfirm={reset}/>}
    {confirm&&review&&input&&<ConfirmEdit title="Xác nhận đổi xe?"
      message={'Thay '+(review.item.license||review.item.name)+' bằng '+(review.vehicle.license||review.vehicle.name)+' · '+review.vehicle.storeName+'. Giữ nguyên kỳ thuê, giá và tiền cọc.'}
      confirmLabel="Xác nhận đổi xe trong hợp đồng" onCancel={()=>setConfirm(false)} onConfirm={()=>{setConfirm(false);void action.submit(input);}}/>}
  </>;
  const frame=(children:React.ReactNode)=><SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}>

      <KeyboardFormScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{padding:20,gap:18,maxWidth:760,width:'100%',alignSelf:'center'}}>
        {children}
      </KeyboardFormScrollView>
    {overlays}
  </SafeAreaView>;
  if(action.key)return frame(<Card style={{gap:16}}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:'800'}}>Đổi xe đang chờ đối chiếu</Text>
    <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>Kiểm tra phiếu gốc trước khi đổi xe thêm. Lựa chọn đang nhập được giữ trong màn hình này.</Text>
    {!!action.error&&<InlineError message={action.error}/>}
    <Button label="Đối chiếu đổi xe với máy chủ" loading={action.busy} onPress={()=>setResolving(true)}/>
    <Button label="Mở phiếu đổi xe" secondary disabled={action.busy} onPress={action.openReceipt}/>
  </Card>);
  if(!action.checked)return frame(<Card style={{gap:16}}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:23,fontWeight:'700'}}>Kiểm tra thao tác trên thiết bị</Text>
    {!!action.error&&<InlineError message={action.error}/>}
    <Button label="Đọc lại thao tác đổi xe" loading={action.checking} onPress={()=>{void action.checkPending();}}/>
    <Button label="Mở Tài khoản để đối chiếu" secondary disabled={action.checking} onPress={action.openAccount}/>
  </Card>);
  const data=query.data;
  return frame(<>
    <Card style={{gap:10}}>
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:'800'}}>Đổi xe trong hợp đồng</Text>
      <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>{selection?.order.code||data?.code||('#'+id)} · {selection?.order.ownership||data?.ownership?'Thuê sở hữu':'Thuê xe'}</Text>
      <Text accessibilityLiveRegion="polite" style={{color:theme.text,fontSize:16}}>Bước {step+1}/3 · {['Chọn xe đang thuê','Chọn xe thay thế','Rà soát đổi xe'][step]}</Text>
    </Card>
    {!!(error||action.error)&&<InlineError message={error||action.error}/>}
    {!!action.notice&&<Text accessibilityLiveRegion="polite" style={{color:theme.text,fontSize:16,lineHeight:25}}>{action.notice}</Text>}
    {step===0&&<Card style={{gap:14}}>
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:21,fontWeight:'700'}}>1. Chọn xe đang thuê</Text>
      {query.isPending&&<Text style={{color:theme.muted}}>Đang tải hợp đồng…</Text>}
      {query.isError&&<InlineError message={(query.error as Error).message}/>}
      {data?.blockedReason&&<InlineError message={data.blockedReason}/>}
      {data?.items.rows.map(row=><Pressable key={row.id} accessibilityRole="radio" accessibilityLabel={'Chọn đổi xe '+(row.license||row.name||('#'+row.vehicleId))}
        accessibilityState={{checked:selection?.item.id===row.id,disabled:locked||query.isFetching||!row.available}} disabled={locked||query.isFetching||!row.available}
        onPress={()=>{setSelection({order:data,item:row});setVehicle(null);setCandidatePage(1);clearReview();}}
        style={{minHeight:64,gap:6,padding:14,borderRadius:12,borderWidth:selection?.item.id===row.id?2:1,borderColor:selection?.item.id===row.id?theme.primary:theme.border,opacity:row.available?1:0.65}}>
        <Text style={{color:theme.text,fontSize:17,fontWeight:'700'}}>{row.license||('Xe #'+row.vehicleId)}</Text>
        <Text style={{color:theme.muted,fontSize:15,lineHeight:23}}>{row.name}</Text>
        {!!row.blockedReason&&<Text style={{color:theme.warning,fontSize:15,lineHeight:23}}>{row.blockedReason}</Text>}
      </Pressable>)}
      {data&&<Text style={{color:theme.muted,fontSize:15}}>Trang {data.items.page}/{data.items.pages} · {data.items.total} dòng xe</Text>}
      <Button label="Trang xe đang thuê trước" secondary disabled={locked||query.isFetching||page===1} onPress={()=>{setPage(p=>p-1);top();}}/>
      <Button label="Trang xe đang thuê tiếp" secondary disabled={locked||query.isFetching||!data||page>=data.items.pages} onPress={()=>{setPage(p=>p+1);top();}}/>
      <Button label="Tải lại hợp đồng đổi xe" secondary loading={query.isFetching} disabled={locked} onPress={()=>selection?setReload(true):void query.refetch()}/>
      <Button label="Tìm xe thay thế" disabled={locked||!selection||query.isFetching||query.isError} onPress={()=>{setStep(1);top();}}/>
    </Card>}
    {step===1&&selection&&<>
      <Card style={{gap:12}}>
        <Text accessibilityRole="header" style={{color:theme.text,fontSize:21,fontWeight:'700'}}>2. Chọn xe thay thế</Text>
        <Text style={{color:theme.text,fontSize:17,lineHeight:26}}>Xe đang thuê: {selection.item.license||selection.item.name}</Text>
        <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>{selection.order.ownership?'Chỉ chọn xe đã nhận vào kho Thuê sở hữu.':'Chỉ chọn xe đang Lưu kho tại cơ sở nguồn hợp đồng.'}</Text>
        <FormField label="Biển số hoặc tên xe thay thế" value={search} onChangeText={setSearch} maxLength={120} editable={!locked} returnKeyType="search" onSubmitEditing={applySearch}/>
        <Button label="Tìm trong kho thay thế" secondary disabled={locked} onPress={applySearch}/>
      </Card>
      <Card style={{gap:14}}>
        {candidates.isError&&<InlineError message={(candidates.error as Error).message}/>}
        {candidates.isFetching&&<Text style={{color:theme.muted}}>Đang kiểm tra kho…</Text>}
        {!candidates.isFetching&&!candidates.isError&&candidates.data?.rows.length===0&&<Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>Không có xe Lưu kho phù hợp. Kiểm tra từ khóa hoặc hoàn tất điều chuyển/nhận kho trước.</Text>}
        {candidates.data?.rows.map(row=><Pressable key={row.id} accessibilityRole="radio" accessibilityLabel={'Chọn xe thay thế '+(row.license||row.name||('#'+row.id))}
          accessibilityState={{checked:vehicle?.id===row.id,disabled:locked||candidates.isFetching||row.id===selection.item.vehicleId}} disabled={locked||candidates.isFetching||row.id===selection.item.vehicleId}
          onPress={()=>{setVehicle(row);clearReview();}}
          style={{minHeight:64,gap:6,padding:14,borderRadius:12,borderWidth:vehicle?.id===row.id?2:1,borderColor:vehicle?.id===row.id?theme.primary:theme.border}}>
          <Text style={{color:theme.text,fontSize:17,fontWeight:'700'}}>{row.license||('Xe #'+row.id)}</Text>
          <Text style={{color:theme.muted,fontSize:15,lineHeight:23}}>{[row.name,row.color,row.year].filter(Boolean).join(' · ')}</Text>
          <Text style={{color:theme.text,fontSize:15,lineHeight:23}}>Kho: {row.storeName||('#'+row.storeId)}</Text>
          {!!row.draftHolds?.length&&<Text style={{color:theme.warning,fontSize:15,lineHeight:23}}>Đang được giữ trong hợp đồng nháp: {row.draftHolds.map(hold=>[hold.code,hold.customer,hold.storeName].filter(Boolean).join(' · ')).join('; ')}. Kiểm tra trước khi chọn xe.</Text>}
        </Pressable>)}
        <Text style={{color:theme.muted,fontSize:15}}>Trang kho {candidatePage}</Text>
        <Button label="Trang kho trước" secondary disabled={locked||candidates.isFetching||candidatePage===1} onPress={()=>{setCandidatePage(p=>p-1);top();}}/>
        <Button label="Trang kho tiếp" secondary disabled={locked||candidates.isFetching||!candidates.data?.hasMore} onPress={()=>{setCandidatePage(p=>p+1);top();}}/>
        <Button label="Tải lại danh sách xe thay thế" secondary loading={candidates.isFetching} disabled={locked} onPress={()=>{void candidates.refetch();}}/>
      </Card>
      {vehicle&&<Card style={{gap:8}}>
        <Text style={{color:theme.text,fontSize:17,fontWeight:'700'}}>Đã chọn: {vehicle.license||vehicle.name}</Text>
        <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>{vehicle.storeName}</Text>
      </Card>}
      <Button label="Rà soát đổi xe" loading={previewing} disabled={locked||!vehicle||candidates.isFetching||candidates.isError} onPress={()=>{void preview();}}/>
      <Button label="Chọn lại xe đang thuê" secondary disabled={locked} onPress={()=>{setStep(0);clearReview();top();}}/>
      <Button label="Tải lại để chọn lại xe" secondary disabled={locked} onPress={()=>setReload(true)}/>
    </>}
    {step===2&&review&&<>
      <Card style={{gap:14}}>
        <Text accessibilityRole="header" style={{color:theme.text,fontSize:21,fontWeight:'700'}}>3. Rà soát đổi xe</Text>
        <Text style={{color:theme.muted,fontSize:16}}>Xe cũ</Text>
        <Text style={{color:theme.text,fontSize:20,fontWeight:'700'}}>{review.item.license||review.item.name}</Text>
        <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>Nhận xe: {review.item.startsAt?dateTime(review.item.startsAt):'Chưa có giờ nhận'}</Text>
        <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>Hạn trả: {review.item.returnAt?dateTime(review.item.returnAt):'Chưa có hạn trả'}</Text>
        <Text style={{color:theme.muted,fontSize:16}}>Xe thay thế</Text>
        <Text style={{color:theme.text,fontSize:20,fontWeight:'700'}}>{review.vehicle.license||review.vehicle.name}</Text>
        <Text style={{color:theme.text,fontSize:16,lineHeight:25}}>{[review.vehicle.name,review.vehicle.brand,review.vehicle.color,review.vehicle.year].filter(Boolean).join(' · ')}</Text>
        <Text style={{color:theme.text,fontSize:16,lineHeight:25}}>Kho: {review.vehicle.storeName||('#'+review.vehicle.storeId)}</Text>
        {!!review.vehicle.draftHolds?.length&&<Text style={{color:theme.warning,fontSize:16,lineHeight:25}}>Xe đang được giữ trong hợp đồng nháp: {review.vehicle.draftHolds.map(hold=>hold.code).join(', ')}. Kiểm tra trước khi xác nhận đổi xe.</Text>}
        <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>Giữ nguyên kỳ thuê, giá, tiền cọc và các khoản đã thu/hoàn. Lượt đổi này không ghi thêm khoản tiền.</Text>
      </Card>
      <Button label="Ghi đổi xe trong hợp đồng" loading={action.busy} disabled={locked||!input} onPress={()=>setConfirm(true)}/>
      <Button label="Xem lại danh sách xe" secondary disabled={locked} onPress={()=>{setStep(1);clearReview();top();}}/>
      <Button label="Tải lại để chọn lại xe" secondary disabled={locked} onPress={()=>setReload(true)}/>
    </>}
  </>);
}
