import { KeyboardFormScrollView } from "./keyboard-form-scroll-view";
import {useEffect,useRef,useState} from 'react';
import {Keyboard,Text,type ScrollViewInstance} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import {SafeAreaView} from 'react-native-safe-area-context';
import {VEHICLE_INVENTORY_STATUSES,type MobileInventoryStatusInput,type MobileVehicleStatusPreparation,type MobileVehicleStatusReview} from '../../../shared/mobile-vehicle-status';
import {useSession} from '@/providers/session';
import {useVehicleStatusWrite} from '@/hooks/use-vehicle-status-write';
import {useReducedMotion} from '@/hooks/use-reduced-motion';
import {dateTime,statuses,useTheme} from '@/theme';
import {Button,Card,InlineError,StateView} from './ui';
import {ChoiceField,FormField} from './form-fields';
import {ConfirmEdit} from './editor-sheet';

export function VehicleStatusEditor({id}:{id:string}) {
  const {api,session}=useSession();
  if(!api||!session||!/^[1-9]\d{0,14}$/.test(id)||!session.user.permissions.includes('vehicles.write'))return <StateView title="Không thể đổi trạng thái xe" message="Kiểm tra xe và quyền thao tác đội xe."/>;
  return <StatusForm key={[api.origin,session.token,session.user.storeId,session.user.allStores,id].join('|')} id={id}/>;
}
function StatusForm({id}:{id:string}) {
  const {api}=useSession(),theme=useTheme(),reduced=useReducedMotion(),scroll=useRef<ScrollViewInstance>(null);
  const [data,setData]=useState<MobileVehicleStatusPreparation|null>(null),[status,setStatus]=useState(''),[note,setNote]=useState('');
  const [review,setReview]=useState<MobileVehicleStatusReview|null>(null),[error,setError]=useState(''),[previewing,setPreviewing]=useState(false),[confirm,setConfirm]=useState(false),[reload,setReload]=useState(false);
  const [openedAt]=useState(()=>new Date().toISOString()),alive=useRef(true),running=useRef(false),abort=useRef<AbortController|null>(null);
  const write=useVehicleStatusWrite(id,data!==null||!!note);
  const query=useQuery({queryKey:['vehicle-status-preparation',api?.origin,id],queryFn:({signal})=>api!.vehicleStatusPreparation(id,signal),
    enabled:write.checked&&!write.pending.length&&!data,staleTime:0,gcTime:0,refetchOnWindowFocus:false,refetchOnReconnect:false});
  const locked=write.busy||previewing||!write.checked||write.pending.length>0;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;abort.current?.abort();};},[]);
  const top=()=>{Keyboard.dismiss();scroll.current?.scrollTo({y:0,animated:!reduced});};
  function start(next:MobileVehicleStatusPreparation){setData(next);setStatus(next.inventory?.status||'');setReview(null);setError('');top();}
  async function preview(){
    if(!api||!data||locked||running.current)return;
    setError('');Keyboard.dismiss();
    const choice=VEHICLE_INVENTORY_STATUSES.find(row=>row.value===status);
    if(!choice)return setError('Chọn trạng thái xe hợp lệ.');
    if(status===data.inventory?.status)return setError('Xe đang ở trạng thái đã chọn. Chọn thao tác khác.');
    const input:MobileInventoryStatusInput={action:'inventory_status',revision:data.vehicle.revision,status:choice.value,note:note.trim()};
    running.current=true;setPreviewing(true);abort.current=new AbortController();
    try{const result=await api.vehicleStatusPreview(id,input,abort.current.signal);if(alive.current){setReview(result);top();}}
    catch(cause){if(alive.current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current)setPreviewing(false);}
  }
  const vehicle=data?.vehicle??query.data?.vehicle;
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}>

      <KeyboardFormScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{padding:20,gap:18,maxWidth:760,width:'100%',alignSelf:'center'}}>
        <Card style={{gap:10}}>
          <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:'800'}}>Đổi trạng thái xe</Text>
          <Text style={{color:theme.text,fontSize:20,fontWeight:'700'}}>{vehicle?.license||vehicle?.name||`Xe #${id}`}</Text>
          {vehicle&&<Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>{statuses[vehicle.status]||vehicle.status} · Kho hiện tại: {vehicle.storeName}</Text>}
          <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>Đổi trạng thái độc lập trong Danh sách xe, kể cả Nợ xấu → Lưu kho. Cơ sở và hợp đồng hiện có được giữ nguyên.</Text>
          {!!(data?.inventory||query.data?.inventory)?.hasOpenContract&&<Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>Xe còn hợp đồng liên quan. Đổi trạng thái xe không thay đổi hợp đồng hoặc công nợ.</Text>}
        </Card>
        {!!(error||write.error)&&<InlineError message={error||write.error}/>}
        {write.pending.length>0?<Card style={{gap:16}}>
          <Text accessibilityRole="header" style={{color:theme.text,fontSize:21,fontWeight:'700'}}>Thao tác xe đang chờ đối chiếu</Text>
          <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>Kiểm tra kết quả gốc trước khi gửi thêm. Nội dung đang nhập được giữ trong màn hình.</Text>
          {write.pending.filter(e=>e.operation===`vehicle.status:${id}`).map(e=><Button key={e.key} label="Mở kết quả đổi trạng thái" disabled={write.busy} onPress={()=>write.open(e.key)}/>)}
          <Button label="Vào Tài khoản để đối chiếu" secondary disabled={write.busy} onPress={write.account}/>
        </Card>:!write.checked?<Button label="Kiểm tra thao tác trên thiết bị" loading={write.checking} onPress={()=>{void write.check();}}/>:!data?<Card style={{gap:16}}>
          {query.isError&&<InlineError message={(query.error as Error).message}/>}
          {!!query.data?.inventory?.blockedReason&&<InlineError message={query.data.inventory.blockedReason}/>}
          {query.data?.inventory?.available&&<Button label="Nhập thông tin đổi trạng thái" disabled={query.isFetching||query.isError} onPress={()=>start(query.data!)}/>}
          <Button label="Tải lại thông tin xe" secondary loading={query.isFetching} onPress={()=>{void query.refetch();}}/>
        </Card>:review?<>
          <Card style={{gap:14}}>
            <Text accessibilityRole="header" style={{color:theme.text,fontSize:23,fontWeight:'700'}}>Rà soát trước khi ghi</Text>
            <Text style={{color:theme.text,fontSize:19,fontWeight:'700'}}>{statuses[review.vehicle.status]||review.vehicle.status} → {statuses[review.input.status]||review.input.status}</Text>
            <Text style={{color:theme.text,fontSize:16,lineHeight:25}}>Cơ sở hiện tại: {review.store.name}</Text>
            <Text style={{color:theme.text,fontSize:16,lineHeight:25}}>Người nhập: {review.actor.name}</Text>
            {!!review.input.note&&<Text style={{color:theme.text,fontSize:16,lineHeight:25}}>Ghi chú: {review.input.note}</Text>}
            <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>Không cần nhập khách hàng, không tạo hợp đồng nháp, không trả xe hoặc xóa công nợ.</Text>
          </Card>
          <Button label="Lưu đổi trạng thái" disabled={locked} loading={write.busy} onPress={()=>setConfirm(true)}/>
          <Button label="Sửa thông tin" secondary disabled={locked} onPress={()=>{setReview(null);setError('');top();}}/>
        </>:<>
          <Card style={{gap:18}}>
            <ChoiceField label="Trạng thái" value={status} choices={VEHICLE_INVENTORY_STATUSES.map(row=>({...row,label:row.label+(row.value===data.inventory?.status?' (hiện tại)':'')}))} onChange={setStatus} disabled={locked}/>
            <FormField label="Ghi chú" value={note} onChangeText={setNote} maxLength={500} multiline editable={!locked}/>
            <Text style={{color:theme.muted,fontSize:15,lineHeight:24}}>Người nhập: {data.actor.name} · Mở lúc {dateTime(openedAt)}</Text>
          </Card>
          <Button label="Rà soát đổi trạng thái" loading={previewing} disabled={locked} onPress={()=>{void preview();}}/>
          <Button label="Tải lại để nhập lại" secondary disabled={locked} onPress={()=>setReload(true)}/>
        </>}
      </KeyboardFormScrollView>

    {confirm&&review&&<ConfirmEdit title="Lưu đổi trạng thái xe?" message={`${review.vehicle.license||review.vehicle.name} · ${statuses[review.input.status]||review.input.status}. Ghi lịch sử thao tác, giữ nguyên cơ sở, hợp đồng và công nợ.`}
      confirmLabel="Lưu đổi trạng thái" onCancel={()=>setConfirm(false)} onConfirm={()=>{setConfirm(false);void write.submit({...review.input,review_snapshot:review.snapshot});}}/>}
    {reload&&<ConfirmEdit title="Tải lại xe và nhập lại?" message="Nội dung đang nhập sẽ được bỏ. Lấy thông tin xe mới nhất trước khi tiếp tục." confirmLabel="Tải lại và nhập lại" onCancel={()=>setReload(false)} onConfirm={()=>{setReload(false);setData(null);setReview(null);setNote('');setError('');top();void query.refetch();}}/>}
    {write.exit&&<ConfirmEdit title="Rời màn đổi trạng thái?" busy={write.busy} message="Nội dung chưa gửi sẽ mất. Mã đã gửi vẫn giữ để đối chiếu trong Tài khoản." confirmLabel="Rời màn đổi trạng thái" onCancel={write.dismissExit} onConfirm={write.leave}/>}
  </SafeAreaView>;
}
