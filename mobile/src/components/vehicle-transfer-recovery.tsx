import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {router,useFocusEffect} from 'expo-router';
import {useQueryClient} from '@tanstack/react-query';
import {SafeAreaView} from 'react-native-safe-area-context';
import {vehicleTransferActions,type MobileVehicleTransferAction,type MobileVehicleTransferReceipt} from '../../../shared/mobile-vehicle-transfers';
import {useSession} from '@/providers/session';
import {pendingWrites} from '@/lib/pending-writes';
import {dateTime,statuses,useTheme} from '@/theme';
import {Button,Card,InlineError,KeyValueRow,StateView,StatusBadge} from './ui';
import {ConfirmEdit} from './editor-sheet';

const labels={transfer:'Chuyển kho',receive:'Nhận xe',reject:'Từ chối điều chuyển',cancel:'Hủy điều chuyển'};
const effects={awaiting_receipt:'Chờ người nhận xác nhận',immediate_transfer:'Đã chuyển kho, giữ nguyên trạng thái xe',received:'Đã nhận xe vào kho',rejected:'Đã từ chối và trả xe về kho đi',cancelled:'Đã hủy và trả xe về kho đi'};
export function VehicleTransferRecovery({id,action}:{id:string;action?:string}) {
  const {api,session}=useSession();
  if(!/^[1-9]\d{0,14}$/.test(id)||!vehicleTransferActions.some(v=>v===action)||!api||!session||!session.user.permissions.includes('vehicles.read'))
    return <StateView title="Không thể mở phiếu kho" message="Kiểm tra xe và loại thao tác cần đối chiếu."/>;
  return <Recovery key={[api.origin,session.token,session.user.storeId,session.user.allStores,id,action].join('|')} id={id} action={action as MobileVehicleTransferAction}/>;
}
function Recovery({id,action}:{id:string;action:MobileVehicleTransferAction}) {
  const {api,session}=useSession(),theme=useTheme(),cache=useQueryClient();
  const scope=useMemo(()=>({origin:api!.origin,userId:session!.user.id,storeId:session!.user.allStores?null:session!.user.storeId,allStores:session!.user.allStores}),[api,session]);
  const operation='vehicle.'+action+':'+id;
  const [key,setKey]=useState<string|null>(null),[receipt,setReceipt]=useState<MobileVehicleTransferReceipt|null>(null);
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirm,setConfirm]=useState(false);
  const alive=useRef(false),running=useRef(false),epoch=useRef(0);
  const load=useCallback(async()=>{
    if(!api||running.current)return;
    running.current=true;const current=++epoch.current;setBusy(true);setError('');
    try{
      const pending=await pendingWrites.lookup(scope,operation);if(!alive.current||epoch.current!==current)return;
      setKey(pending);setReceipt(null);
      if(pending){
        const saved=await api.vehicleTransferReceipt(pending);if(!alive.current||epoch.current!==current)return;
        if(saved.receipt&&(String(saved.receipt.id)!==id||saved.receipt.action!==action))throw Error('Phiếu kho không khớp xe hoặc thao tác. Giữ mã để đối chiếu.');
        setReceipt(saved.receipt);
      }
    }catch(cause){if(alive.current&&epoch.current===current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current&&epoch.current===current)setBusy(false);}
  },[api,scope,operation,id,action]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useFocusEffect(useCallback(()=>{void load();},[load]));
  async function resolve(){
    if(!api||!key||running.current)return;
    running.current=true;setBusy(true);setConfirm(false);setError('');const current=epoch.current;
    try{
      const result=await api.resolveWrite(key,operation);if(!alive.current||epoch.current!==current)return;
      if(result.status==='cancelled'){
        await pendingWrites.complete(scope,operation,key);if(!alive.current||epoch.current!==current)return;
        setKey(null);setReceipt(null);setNotice('Đã xác nhận chưa ghi và khóa mã cũ. Có thể mở lại xe để tiếp tục.');
      }else{
        const saved=await api.vehicleTransferReceipt(key);if(!alive.current||epoch.current!==current)return;
        if(!saved.receipt||String(saved.receipt.id)!==id||saved.receipt.action!==action)throw Error('Chưa đọc được phiếu kho gốc. Giữ mã để đối chiếu.');
        setReceipt(saved.receipt);
      }
    }catch(cause){if(alive.current&&epoch.current===current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current&&epoch.current===current)setBusy(false);}
  }
  const openVehicle=()=>router.dismissTo({pathname:'/vehicle/[id]',params:{id}});
  async function acknowledge(next?:'media'|'telegram'){
    if(!key||!receipt||receipt.requestId!==key||running.current)return;
    running.current=true;setBusy(true);setError('');const current=epoch.current;
    try{
      await pendingWrites.complete(scope,operation,key);if(!alive.current||epoch.current!==current)return;
      for(const queryKey of [['record'],['catalogue'],['overview'],['vehicle-transfer-preparation'],['vehicle-profile'],['vehicle-history'],['fleet-inventory'],['transfer-history']])void cache.invalidateQueries({queryKey});
      if(next==='media')router.replace({pathname:'/record-media/[entity]/[id]',params:{entity:'vehicles',id,kind:'vehicle',referenceId:id}});
      else if(next==='telegram'&&receipt.events[0])router.replace({pathname:'/transfer-telegram/[id]/[eventId]',params:{id,eventId:String(receipt.events[0].id)}});
      else openVehicle();
    }catch(cause){if(alive.current&&epoch.current===current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current&&epoch.current===current)setBusy(false);}
  }
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}>
    <ScrollView contentContainerStyle={{padding:20,gap:18,maxWidth:760,width:'100%',alignSelf:'center'}}>
      {!!error&&<InlineError message={error}/>}
      {!!notice&&<Text accessibilityLiveRegion="polite" style={{color:theme.text,fontSize:16,lineHeight:25}}>{notice}</Text>}
      {!receipt?<Card style={{gap:14}}>
        <Text accessibilityRole="header" style={{color:theme.text,fontSize:20,fontWeight:'800'}}>{key?'Thao tác kho đang chờ đối chiếu':'Đối chiếu thao tác kho'}</Text>
        <Text style={{color:theme.muted,fontSize:14,lineHeight:21}}>{labels[action]} · {key?'Giữ mã đến khi đã kiểm tra phiếu gốc hoặc máy chủ xác nhận chưa ghi.':'Không có yêu cầu chờ đối chiếu cho xe và thao tác này.'}</Text>
        {key&&<Button label="Đối chiếu thao tác kho với máy chủ" loading={busy} onPress={()=>setConfirm(true)}/>}
        <Button label="Tải lại phiếu kho" secondary loading={busy} onPress={()=>{void load();}}/>
        {!key&&<Button label="Mở xe" secondary disabled={busy} onPress={openVehicle}/>}
      </Card>:<>
        <Card style={{gap:10}}>
          <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8}}>
            <Text accessibilityRole="header" style={{color:theme.text,fontSize:18,fontWeight:'800',flex:1}}>{labels[receipt.action]} đã được ghi nhận</Text>
            <StatusBadge status={receipt.review.after.status} label={statuses[receipt.review.after.status]||receipt.review.after.status}/>
          </View>
          <KeyValueRow label="Xe" value={receipt.review.vehicle.license||receipt.review.vehicle.name} emphasize/>
          <KeyValueRow label="Kết quả" value={effects[receipt.review.effect]}/>
          <KeyValueRow label="Thời điểm ghi" value={dateTime(receipt.recordedAt)}/>
          <KeyValueRow label="Mã yêu cầu" value={receipt.requestId} selectable/>
          {!receipt.current&&<InlineError message="Xe hoặc lượt chuyển đã được xử lý tiếp hay chỉnh sửa. Đây là phiếu gốc; kiểm tra trạng thái hiện tại trước thao tác mới."/>}
          {!receipt.eventsCurrent&&<Text style={{color:theme.warning,fontSize:14,lineHeight:21}}>Lịch sử kho đã thay đổi sau khi ghi.</Text>}
          <KeyValueRow label="Kho đi" value={receipt.review.fromStore?.name||'Chưa rõ kho đi'}/>
          <KeyValueRow label="Kho đến" value={receipt.review.toStore.name} emphasize/>
          {receipt.review.after.ownerStoreId!==undefined?<>
            <KeyValueRow label="Cơ sở sở hữu trước" value={receipt.review.vehicle.ownerStoreName||'Chưa xác định'}/>
            <KeyValueRow label="Cơ sở sở hữu sau" value={receipt.review.after.ownerStoreId===receipt.review.toStore.id?receipt.review.toStore.name:receipt.review.fromStore?.name}/>
          </>:<Text style={{color:theme.muted,fontSize:13,lineHeight:19}}>Phiếu cũ không lưu cơ sở sở hữu trước/sau.</Text>}
          {!!receipt.review.note&&<KeyValueRow label="Ghi chú" value={receipt.review.note}/>}
        </Card>
        <Card style={{gap:10}}>
          <Text accessibilityRole="header" style={{color:theme.text,fontSize:16,fontWeight:'800'}}>Lịch sử đã ghi</Text>
          {receipt.events.map(event=><View key={event.id} style={{gap:4}}>
            <KeyValueRow label={`Phiếu #${event.id}`} value={`${event.fromStoreName||'Chưa rõ kho đi'} → ${event.toStoreName||'Chưa rõ kho đến'}`} emphasize selectable/>
            <KeyValueRow label="Người thực hiện" value={`${event.actorName} · ${dateTime(event.recordedAt)}`}/>
            {!!event.note&&<Text style={{color:theme.text,fontSize:13.5,lineHeight:20}}>{event.note}</Text>}
          </View>)}
        </Card>
        <Button label="Xác nhận đã kiểm tra phiếu kho" loading={busy} onPress={()=>{void acknowledge();}}/>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
          <Button size="sm" equalWidth label="Ảnh & giấy tờ xe" secondary disabled={busy} onPress={()=>{void acknowledge('media');}}/>
          {!!receipt.events[0]&&(receipt.action==='transfer'||receipt.action==='receive')&&<Button size="sm" equalWidth label="Gửi Telegram điều chuyển" secondary disabled={busy} onPress={()=>{void acknowledge('telegram');}}/>}
        </View>
        <Button label="Tải lại phiếu kho" secondary loading={busy} onPress={()=>{void load();}}/>
      </>}
    </ScrollView>
    {confirm&&<ConfirmEdit title="Đối chiếu thao tác kho?" message="Nếu đã ghi, mở đúng phiếu gốc. Nếu chưa ghi, máy chủ khóa mã cũ để chặn yêu cầu đến muộn."
      confirmLabel="Đối chiếu với máy chủ" onCancel={()=>setConfirm(false)} onConfirm={()=>{void resolve();}}/>}
  </SafeAreaView>;
}
