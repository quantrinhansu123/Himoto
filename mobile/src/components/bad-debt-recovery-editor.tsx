import { KeyboardFormScrollView } from "./keyboard-form-scroll-view";
import {useEffect,useRef,useState} from 'react';
import {Keyboard,Pressable,Text,View,type ScrollViewInstance} from 'react-native';
import {keepPreviousData,useQuery} from '@tanstack/react-query';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {MobileRecoveryInput,MobileRecoveryItem,MobileRecoveryPreparation,MobileRecoveryPreview} from '../../../shared/mobile-bad-debt-recovery';
import {useSession} from '@/providers/session';
import {useRecoveryWrite} from '@/hooks/use-recovery-write';
import {useReducedMotion} from '@/hooks/use-reduced-motion';
import {recoveryFormInput} from '@/lib/recovery-form';
import {returnLocalTime} from '@/lib/return-form';
import {dateTime,money,statuses,useTheme} from '@/theme';
import {Button,Card,InlineError,KeyValueRow,StateView,StatusBadge} from './ui';
import {FormField} from './form-fields';
import {RentalDateTime} from './rental-date-time';
import {ConfirmEdit} from './editor-sheet';

export function BadDebtRecoveryEditor({id}:{id:string}) {
  const {api,session}=useSession();
  if(!api||!session||!/^[1-9]\d{0,14}$/.test(id)||!session.user.permissions.includes('contracts.read')||!session.user.permissions.includes('contracts.return'))
    return <StateView title="Không mở được thu hồi xe" message="Tài khoản cần quyền xem hợp đồng và trả/thu hồi xe."/>;
  return <RecoveryForm key={[api.origin,session.token,session.user.storeId,session.user.allStores,session.user.permissions.join(','),id].join('|')} id={id}/>;
}
function RecoveryForm({id}:{id:string}) {
  const {api,session}=useSession(),theme=useTheme(),reduced=useReducedMotion(),scroll=useRef<ScrollViewInstance>(null);
  const [step,setStep]=useState(0),[page,setPage]=useState(1);
  const [selection,setSelection]=useState<{order:MobileRecoveryPreparation;item:MobileRecoveryItem}|null>(null);
  const [recoveredAt,setRecoveredAt]=useState(()=>returnLocalTime()),[note,setNote]=useState('');
  const [review,setReview]=useState<MobileRecoveryPreview|null>(null),[input,setInput]=useState<MobileRecoveryInput|null>(null);
  const [previewing,setPreviewing]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(false),[resolve,setResolve]=useState(false),[reload,setReload]=useState(false);
  const alive=useRef(true),running=useRef(false),abort=useRef<AbortController|null>(null);
  const action=useRecoveryWrite(id,!!selection||!!note);
  const query=useQuery({queryKey:['recovery-preparation',session?.user.id,session?.user.storeId,session?.user.allStores,id,page],
    queryFn:({signal})=>api!.recoveryPreparation(id,page,signal),enabled:action.checked&&!action.key&&step===0,placeholderData:keepPreviousData,
    staleTime:0,gcTime:0,refetchOnWindowFocus:false,refetchOnReconnect:false});
  const locked=previewing||action.busy||!action.checked||!!action.key;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;abort.current?.abort();};},[]);
  const top=()=>{Keyboard.dismiss();scroll.current?.scrollTo({y:0,animated:!reduced});};
  function clearReview(){setReview(null);setInput(null);setError('');}
  async function preview(){
    if(!api||!selection||locked||running.current)return;
    setError('');Keyboard.dismiss();
    let body:MobileRecoveryInput;
    try{body=recoveryFormInput(selection.order,selection.item,recoveredAt,note);}
    catch(cause){setError((cause as Error).message);return;}
    running.current=true;setPreviewing(true);abort.current=new AbortController();
    try{
      const reviewed=await api.recoveryPreview(id,body,abort.current.signal);if(!alive.current)return;
      setInput(body);setReview(reviewed);setStep(2);top();
    }catch(cause){if(alive.current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current)setPreviewing(false);}
  }
  function refresh(){
    setReload(false);setSelection(null);setPage(1);setStep(0);clearReview();top();void query.refetch();
  }
  const overlays=<>
    {resolve&&<ConfirmEdit title="Đối chiếu thu hồi xe?" message="Nếu đã ghi, mở đúng phiếu gốc. Nếu chưa ghi, máy chủ khóa mã cũ để chặn yêu cầu đến muộn."
      confirmLabel="Đối chiếu với máy chủ" onCancel={()=>setResolve(false)} onConfirm={()=>{setResolve(false);void action.resolve().then(cancelled=>{
        if(cancelled&&alive.current){clearReview();setStep(selection?1:0);top();}
      });}}/>}
    {action.exit&&<ConfirmEdit title={action.busy?'Đang ghi thu hồi xe':'Rời bước thu hồi xe?'} busy={action.busy}
      message={action.busy?'Chờ máy chủ xác nhận kết quả.':'Lựa chọn chưa gửi sẽ mất. Mã đã gửi vẫn được giữ để đối chiếu.'}
      confirmLabel="Rời bước thu hồi xe" onCancel={action.dismissExit} onConfirm={action.leave}/>}
    {reload&&<ConfirmEdit title="Tải lại xe cần thu hồi?" message="Lấy hợp đồng mới nhất và chọn lại xe. Ngày thu hồi và ghi chú đang nhập được giữ."
      confirmLabel="Tải lại và chọn lại xe" onCancel={()=>setReload(false)} onConfirm={refresh}/>}
    {confirm&&review&&input&&<ConfirmEdit title="Xác nhận thu hồi xe?"
      message={(review.item.license||review.item.name)+' · '+dateTime(review.recoveredAt)+'. Chỉ ghi nhận xe đã thu hồi thực tế; nợ thuê và cọc được giữ nguyên.'}
      confirmLabel="Xác nhận ghi thu hồi xe" onCancel={()=>setConfirm(false)} onConfirm={()=>{setConfirm(false);void action.submit({...input,review_snapshot:review.snapshot});}}/>}
  </>;
  const frame=(children:React.ReactNode)=><SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}>

      <KeyboardFormScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{padding:20,gap:18,maxWidth:760,width:'100%',alignSelf:'center'}}>{children}</KeyboardFormScrollView>
    {overlays}
  </SafeAreaView>;
  if(action.key)return frame(<Card style={{gap:14}}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:20,fontWeight:'800'}}>Thu hồi xe đang chờ đối chiếu</Text>
    <Text style={{color:theme.muted,fontSize:14,lineHeight:21}}>Kiểm tra phiếu gốc trước khi gửi thêm. Xe, ngày thu hồi và ghi chú đang nhập được giữ trong màn hình này.</Text>
    {!!action.error&&<InlineError message={action.error}/>}
    <Button label="Đối chiếu thu hồi với máy chủ" loading={action.busy} onPress={()=>setResolve(true)}/>
    <Button label="Mở phiếu thu hồi xe" secondary disabled={action.busy} onPress={action.openReceipt}/>
  </Card>);
  if(!action.checked)return frame(<Card style={{gap:14}}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:19,fontWeight:'700'}}>Kiểm tra thao tác đang chờ</Text>
    {!!action.error&&<InlineError message={action.error}/>}
    <Button label="Kiểm tra lại thao tác thu hồi" loading={action.checking} onPress={()=>{void action.checkPending();}}/>
    <Button label="Mở Tài khoản để đối chiếu" secondary disabled={action.checking} onPress={action.openAccount}/>
  </Card>);
  const data=query.data,amount=(v:number|null)=>v===null?'Chưa đối chiếu':money(v);
  return frame(<>
    <Text style={{color:theme.muted,fontSize:13.5,lineHeight:20,fontWeight:'600'}}>Bước {step+1}/3 · {selection?.order.code||data?.code||'Hợp đồng'}</Text>
    {!!(error||action.error)&&<InlineError message={error||action.error}/>}
    {!!action.notice&&<Text accessibilityLiveRegion="polite" style={{color:theme.text,fontSize:14,lineHeight:21}}>{action.notice}</Text>}
    {step===0&&<Card style={{gap:14}}>
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:18,fontWeight:'700'}}>1. Chọn xe đã thu hồi</Text>
      <Text style={{color:theme.muted,fontSize:13.5,lineHeight:20}}>Mỗi lần ghi nhận một xe đã nhận lại thực tế. Thao tác không thu tiền, hoàn cọc hoặc xóa nợ.</Text>
      {!!selection&&<KeyValueRow label="Đã chọn xe" value={selection.item.license||selection.item.name} emphasize />}
      {query.isError&&<InlineError message={(query.error as Error).message}/>}
      {query.isFetching&&<Text style={{color:theme.muted}}>Đang tải xe…</Text>}
      {!!data?.blockedReason&&<InlineError message={data.blockedReason}/>}
      {data?.items.rows.map(row=><Pressable key={row.id} accessibilityRole="radio" accessibilityLabel={'Chọn thu hồi xe '+(row.license||row.name||('#'+row.vehicleId))}
        accessibilityState={{checked:selection?.item.id===row.id,disabled:locked||query.isFetching||!row.available}} disabled={locked||query.isFetching||!row.available}
        onPress={()=>{setSelection({order:data,item:row});clearReview();}}
        style={{minHeight:64,gap:6,padding:14,borderRadius:12,borderWidth:selection?.item.id===row.id?2:1,borderColor:selection?.item.id===row.id?theme.primary:theme.border,opacity:row.available?1:0.65}}>
        <Text style={{color:theme.text,fontSize:16,fontWeight:'700'}}>{row.license||('Xe #'+row.vehicleId)}</Text>
        <Text style={{color:theme.muted,fontSize:14,lineHeight:21}}>{row.name}</Text>
        {!!row.completedAt&&<Text style={{color:theme.muted,fontSize:14,lineHeight:21}}>Đã nhận lại: {dateTime(row.completedAt)}</Text>}
        {!!row.blockedReason&&<Text style={{color:theme.warning,fontSize:14,lineHeight:21}}>{row.blockedReason}</Text>}
      </Pressable>)}
      {data?.items.total===0&&<Text style={{color:theme.muted,fontSize:14,lineHeight:21}}>Không có dòng xe cần thu hồi.</Text>}
      {data&&<Text style={{color:theme.muted,fontSize:13.5}}>Trang {data.items.page}/{data.items.pages} · {data.items.total} dòng xe</Text>}
      <View style={{flexDirection:'row',gap:10}}>
        <Button size="sm" equalWidth label="Trang xe thu hồi trước" secondary disabled={locked||query.isFetching||page===1} onPress={()=>{setPage(p=>p-1);top();}}/>
        <Button size="sm" equalWidth label="Trang xe thu hồi tiếp" secondary disabled={locked||query.isFetching||!data||page>=data.items.pages} onPress={()=>{setPage(p=>p+1);top();}}/>
      </View>
      <Button label="Tải lại xe cần thu hồi" secondary loading={query.isFetching} disabled={locked} onPress={()=>selection?setReload(true):void query.refetch()}/>
      <Button label="Nhập ngày thu hồi" disabled={locked||!selection||query.isFetching||query.isError} onPress={()=>{setStep(1);top();}}/>
    </Card>}
    {step===1&&selection&&<Card style={{gap:14}}>
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:18,fontWeight:'700'}}>2. Ngày thu hồi và ghi chú</Text>
      <View style={{gap:2}}>
        <KeyValueRow label="Xe thu hồi" value={selection.item.license||selection.item.name} emphasize />
        <KeyValueRow label="Nhận xe từ" value={`${selection.item.startsAt?dateTime(selection.item.startsAt):'Chưa có ngày'}${selection.order.ownership?' · Thuê sở hữu':''}`} />
      </View>
      <Text style={{color:theme.muted,fontSize:13.5,lineHeight:20}}>Ngày và giờ thực tế theo giờ Việt Nam.</Text>
      <RentalDateTime label="thu hồi thực tế" value={recoveredAt} onChange={v=>{setRecoveredAt(v);clearReview();}} disabled={locked}/>
      <FormField label="Ghi chú thu hồi" hint="Tối đa 1.000 ký tự" value={note} onChangeText={v=>{setNote(v);clearReview();}} editable={!locked} multiline maxLength={1000}/>
      <Button label="Rà soát thu hồi xe" loading={previewing} disabled={locked} onPress={()=>{void preview();}}/>
      <View style={{flexDirection:'row',gap:10}}>
        <Button size="sm" equalWidth label="Chọn lại xe thu hồi" secondary disabled={locked} onPress={()=>{clearReview();setStep(0);top();}}/>
        <Button size="sm" equalWidth label="Tải lại xe cần thu hồi" secondary disabled={locked} onPress={()=>setReload(true)}/>
      </View>
    </Card>}
    {step===2&&review&&input&&<>
      <Card style={{gap:12}}>
        <Text accessibilityRole="header" style={{color:theme.text,fontSize:18,fontWeight:'700'}}>3. Rà soát thu hồi xe</Text>
        <View style={{gap:2}}>
          <KeyValueRow label="Biển số" value={review.item.license||('Xe #'+review.item.vehicleId)} emphasize />
          <KeyValueRow label="Tên xe" value={`${review.item.name}${review.ownership?' · Thuê sở hữu':''}`} />
          <KeyValueRow label="Thu hồi thực tế" value={dateTime(review.recoveredAt)} emphasize />
          <KeyValueRow label="Mốc chốt nợ" value={review.billingStoppedAt?dateTime(review.billingStoppedAt):review.badDebtAt?dateTime(review.badDebtAt):'Chưa có mốc'} />
          {!!review.note&&<KeyValueRow label="Ghi chú" value={review.note} />}
        </View>
      </Card>
      <Card style={{gap:12}}>
        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8}}>
          <Text accessibilityRole="header" style={{color:theme.text,fontSize:18,fontWeight:'700'}}>Giữ nguyên số dư và cọc</Text>
          <StatusBadge status={review.after.status} label={statuses[review.after.status]||review.after.status} />
        </View>
        <View style={{gap:2}}>
          <KeyValueRow label="Tổng thuê" value={amount(review.after.totalAmount)} />
          <KeyValueRow label="Đã thu thuê" value={amount(review.after.rentalPaid)} />
          <KeyValueRow label="Còn nợ thuê" value={amount(review.after.rentalRemaining)} emphasize />
          <KeyValueRow label="Cọc đang giữ" value={amount(review.after.depositHeld)} />
          <KeyValueRow label="Số xe còn giữ sau thu hồi" value={String(review.after.remainingItems)} />
        </View>
        <Text style={{color:theme.muted,fontSize:13.5,lineHeight:20}}>Thu hồi xe không xóa khoản nợ và không phát sinh thu/hoàn tiền. Xe chỉ sẵn sàng bàn giao tiếp khi đáp ứng tình trạng kho hiện tại.</Text>
      </Card>
      <Button label="Ghi thu hồi xe nợ xấu" disabled={locked} onPress={()=>setConfirm(true)}/>
      <View style={{flexDirection:'row',gap:10}}>
        <Button size="sm" equalWidth label="Sửa ngày hoặc ghi chú thu hồi" secondary disabled={locked} onPress={()=>{clearReview();setStep(1);top();}}/>
        <Button size="sm" equalWidth label="Tải lại xe cần thu hồi" secondary disabled={locked} onPress={()=>setReload(true)}/>
      </View>
    </>}
  </>);
}
