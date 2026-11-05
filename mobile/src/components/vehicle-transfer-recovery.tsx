import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {router,useFocusEffect} from 'expo-router';
import {useQueryClient} from '@tanstack/react-query';
import {SafeAreaView} from 'react-native-safe-area-context';
import {vehicleTransferActions,type MobileVehicleTransferAction,type MobileVehicleTransferReceipt} from '../../../shared/mobile-vehicle-transfers';
import {useSession} from '@/providers/session';
import {pendingWrites} from '@/lib/pending-writes';
import {dateTime,statuses,useTheme} from '@/theme';
import {Button,Card,InlineError,StateView} from './ui';
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
  const openVehicle=()=>router.dismissTo({pathname:'/record/[kind]/[id]',params:{kind:'vehicles',id}});
  async function acknowledge(){
    if(!key||!receipt||receipt.requestId!==key||running.current)return;
    running.current=true;setBusy(true);setError('');const current=epoch.current;
    try{
      await pendingWrites.complete(scope,operation,key);if(!alive.current||epoch.current!==current)return;
      for(const queryKey of [['record'],['catalogue'],['overview'],['vehicle-transfer-preparation']])void cache.invalidateQueries({queryKey});
      openVehicle();
    }catch(cause){if(alive.current&&epoch.current===current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current&&epoch.current===current)setBusy(false);}
  }
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}>
    <ScrollView contentContainerStyle={{padding:20,gap:18,maxWidth:760,width:'100%',alignSelf:'center'}}>
      {!!error&&<InlineError message={error}/>}
      {!!notice&&<Text accessibilityLiveRegion="polite" style={{color:theme.text,fontSize:16,lineHeight:25}}>{notice}</Text>}
      {!receipt?<Card style={{gap:16}}>
        <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:'800'}}>{key?'Thao tác kho đang chờ đối chiếu':'Đối chiếu thao tác kho'}</Text>
        <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>{labels[action]} · {key?'Giữ mã đến khi đã kiểm tra phiếu gốc hoặc máy chủ xác nhận chưa ghi.':'Không có yêu cầu chờ đối chiếu cho xe và thao tác này.'}</Text>
        {key&&<Button label="Đối chiếu thao tác kho với máy chủ" loading={busy} onPress={()=>setConfirm(true)}/>}
        <Button label="Tải lại phiếu kho" secondary loading={busy} onPress={()=>{void load();}}/>
        {!key&&<Button label="Mở xe" secondary disabled={busy} onPress={openVehicle}/>}
      </Card>:<>
        <Card style={{gap:14}}>
          <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:'800'}}>{labels[receipt.action]} đã được ghi nhận</Text>
          <Text style={{color:theme.text,fontSize:20,fontWeight:'700'}}>{receipt.review.vehicle.license||receipt.review.vehicle.name}</Text>
          <Text style={{color:theme.text,fontSize:17,lineHeight:26}}>{effects[receipt.review.effect]}</Text>
          <Text selectable style={{color:theme.muted,fontSize:15,lineHeight:24}}>Ghi lúc {dateTime(receipt.recordedAt)} · mã {receipt.requestId}</Text>
          {!receipt.current&&<InlineError message="Xe hoặc lượt chuyển đã được xử lý tiếp hay chỉnh sửa. Đây là phiếu gốc; kiểm tra trạng thái hiện tại trước thao tác mới."/>}
          {!receipt.eventsCurrent&&<Text style={{color:theme.warning,fontSize:16,lineHeight:25}}>Lịch sử kho đã thay đổi sau khi ghi.</Text>}
          <Text style={{color:theme.text,fontSize:16,lineHeight:25}}>Kho đi: {receipt.review.fromStore?.name||'Chưa rõ kho đi'}</Text>
          <Text style={{color:theme.text,fontSize:16,lineHeight:25}}>Kho đến: {receipt.review.toStore.name}</Text>
          <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>Trạng thái sau ghi: {statuses[receipt.review.after.status]||receipt.review.after.status}</Text>
          {receipt.review.after.ownerStoreId!==undefined?<>
            <Text style={{color:theme.text,fontSize:16,lineHeight:25}}>Cơ sở sở hữu trước: {receipt.review.vehicle.ownerStoreName||'Chưa xác định'}</Text>
            <Text style={{color:theme.text,fontSize:16,lineHeight:25}}>Cơ sở sở hữu sau: {receipt.review.after.ownerStoreId===receipt.review.toStore.id?receipt.review.toStore.name:receipt.review.fromStore?.name}</Text>
          </>:<Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>Phiếu cũ không lưu cơ sở sở hữu trước/sau.</Text>}
          {!!receipt.review.note&&<Text style={{color:theme.text,fontSize:16,lineHeight:25}}>{receipt.review.note}</Text>}
        </Card>
        <Card style={{gap:14}}>
          <Text accessibilityRole="header" style={{color:theme.text,fontSize:21,fontWeight:'700'}}>Lịch sử đã ghi</Text>
          {receipt.events.map(event=><View key={event.id} style={{gap:6}}>
            <Text selectable style={{color:theme.text,fontSize:17,fontWeight:'700'}}>Phiếu #{event.id} · {event.fromStoreName||'Chưa rõ kho đi'} → {event.toStoreName||'Chưa rõ kho đến'}</Text>
            <Text style={{color:theme.muted,fontSize:15,lineHeight:24}}>{event.actorName} · {dateTime(event.recordedAt)}</Text>
            {!!event.note&&<Text style={{color:theme.text,fontSize:16,lineHeight:25}}>{event.note}</Text>}
          </View>)}
        </Card>
        <Button label="Xác nhận đã kiểm tra phiếu kho" loading={busy} onPress={()=>{void acknowledge();}}/>
        <Button label="Tải lại phiếu kho" secondary loading={busy} onPress={()=>{void load();}}/>
      </>}
    </ScrollView>
    {confirm&&<ConfirmEdit title="Đối chiếu thao tác kho?" message="Nếu đã ghi, mở đúng phiếu gốc. Nếu chưa ghi, máy chủ khóa mã cũ để chặn yêu cầu đến muộn."
      confirmLabel="Đối chiếu với máy chủ" onCancel={()=>setConfirm(false)} onConfirm={()=>{void resolve();}}/>}
  </SafeAreaView>;
}
