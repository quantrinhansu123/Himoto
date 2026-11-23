import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {router,useFocusEffect} from 'expo-router';
import {useQueryClient} from '@tanstack/react-query';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {MobileVehicleStatusReceipt} from '../../../shared/mobile-vehicle-status';
import {useSession} from '@/providers/session';
import {pendingWrites} from '@/lib/pending-writes';
import {dateTime,statuses,useTheme} from '@/theme';
import {Button,Card,InfoBanner,InlineError,KeyValueRow,StateView,StatusBadge} from './ui';
import {ConfirmEdit} from './editor-sheet';

export function VehicleStatusRecovery({requestKey}:{requestKey:string}) {
  const {api,session}=useSession();
  if(!api||!session||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(requestKey)||!session.user.permissions.includes('vehicles.read'))return <StateView title="Không mở được kết quả xe" message="Kiểm tra mã thao tác và quyền xem đội xe."/>;
  return <Recovery key={[api.origin,session.token,session.user.storeId,session.user.allStores,requestKey].join('|')} requestKey={requestKey}/>;
}
function Recovery({requestKey}:{requestKey:string}) {
  const {api,session}=useSession(),theme=useTheme(),cache=useQueryClient();
  const scope=useMemo(()=>({origin:api!.origin,userId:session!.user.id,storeId:session!.user.allStores?null:session!.user.storeId,allStores:session!.user.allStores}),[api,session]);
  const [operation,setOperation]=useState(''),[receipt,setReceipt]=useState<MobileVehicleStatusReceipt|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirm,setConfirm]=useState(false);
  const alive=useRef(true),running=useRef(false);
  const accept=useCallback((value:MobileVehicleStatusReceipt|null,op:string)=>{
    if(value&&(value.actorId!==scope.userId||`vehicle.status:${value.id}`!==op))throw Error('Kết quả không khớp xe hoặc tài khoản. Giữ mã để đối chiếu.');
    setReceipt(value);
  },[scope.userId]);
  const load=useCallback(async()=>{
    if(!api||running.current)return;
    running.current=true;setBusy(true);setError('');
    try{
      const entry=(await pendingWrites.list(scope,true)).find(e=>e.key===requestKey&&e.operation.startsWith('vehicle.status:'));
      if(!alive.current)return;
      setOperation(entry?.operation??'');setReceipt(null);
      if(entry){const result=await api.vehicleStatusReceipt(requestKey);if(alive.current)accept(result.receipt,entry.operation);}
    }catch(cause){if(alive.current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current)setBusy(false);}
  },[api,scope,requestKey,accept]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useFocusEffect(useCallback(()=>{void load();},[load]));
  async function resolve(){
    if(!api||!operation||running.current)return;
    running.current=true;setBusy(true);setError('');setConfirm(false);
    try{
      const result=await api.resolveWrite(requestKey,operation);if(!alive.current)return;
      if(result.status==='cancelled'){
        await pendingWrites.complete(scope,operation,requestKey);if(!alive.current)return;
        setOperation('');setReceipt(null);setNotice('Máy chủ xác nhận chưa ghi và đã khóa mã cũ. Có thể mở xe, rà soát lại trước khi gửi.');
      }else{const saved=await api.vehicleStatusReceipt(requestKey);if(!alive.current)return;if(!saved.receipt)throw Error('Chưa đọc được kết quả gốc. Giữ mã để đối chiếu.');accept(saved.receipt,operation);}
    }catch(cause){if(alive.current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current)setBusy(false);}
  }
  async function acknowledge(openDraft:boolean){
    if(!receipt||!operation||running.current)return;
    running.current=true;setBusy(true);setError('');
    try{
      await pendingWrites.complete(scope,operation,requestKey);if(!alive.current)return;
      for(const queryKey of [['record'],['catalogue'],['overview'],['vehicle-profile'],['vehicle-history'],['vehicle-status-preparation'],['vehicle-contracts'],['fleet-inventory']])void cache.invalidateQueries({queryKey});
      router.replace({pathname:'/record/[kind]/[id]',params:{kind:openDraft&&receipt.draft?'contracts':'vehicles',id:String(openDraft&&receipt.draft?receipt.draft.id:receipt.id)}});
    }catch(cause){if(alive.current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current)setBusy(false);}
  }
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}>
    <ScrollView contentContainerStyle={{padding:16,paddingBottom:36,gap:12,maxWidth:760,width:'100%',alignSelf:'center'}}>
      {!!error&&<InlineError message={error}/>}{!!notice&&<InfoBanner tone="info" message={notice}/>}
      {receipt?<>
        <Card style={{gap:10}}>
          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
            <Text accessibilityRole="header" style={{color:theme.success,fontSize:20,fontWeight:'800',flexShrink:1}}>{receipt.review.effect==='inventory'?`Đã đổi trạng thái: ${statuses[receipt.review.input.status]||receipt.review.input.status}`:receipt.draft?'Đã tạo hợp đồng nháp':'Đã ghi nhận Lưu kho'}</Text>
            <StatusBadge label={receipt.review.effect==='inventory'?(statuses[receipt.review.input.status]||receipt.review.input.status):'Lưu kho'} tone="success"/>
          </View>
          <KeyValueRow label="Xe" value={receipt.review.vehicle.license||receipt.review.vehicle.name} emphasize/>
          {receipt.draft&&<KeyValueRow label="Hợp đồng nháp" value={`${receipt.draft.code} · #${receipt.draft.id}`}/>}
          {receipt.customer&&<KeyValueRow label="Khách hàng" value={`${receipt.customer.name} · #${receipt.customer.id} (${receipt.customer.created?'hồ sơ mới':`khớp ${receipt.customer.matched_by}`})`}/>}
          <KeyValueRow label="Cơ sở sử dụng" value={receipt.review.store.name}/>
          <KeyValueRow label="Ghi nhận bởi" value={`${receipt.actorName} · ${dateTime(receipt.recordedAt)} · #${receipt.eventId}`}/>
          <InfoBanner tone="info" message={`Sau ghi: xe ${receipt.review.effect==='inventory'?(statuses[receipt.review.input.status]||receipt.review.input.status):'Lưu kho'} tại ${receipt.review.vehicle.storeName}. Không phát sinh thu tiền hoặc phiếu thu/hoàn.`}/>
          <Text selectable style={{color:theme.muted,fontSize:12}}>Mã đối chiếu: {receipt.requestId}</Text>
          {!receipt.current&&<InlineError message="Xe, hợp đồng hoặc lịch sử đã được xử lý tiếp. Đây là kết quả gốc của mã này; kiểm tra hồ sơ hiện tại trước thao tác mới."/>}
        </Card>
        {receipt.draft&&<Button label={`Đã kiểm tra · mở hợp đồng ${receipt.draft.code}`} loading={busy} onPress={()=>{void acknowledge(true);}}/>}
        <Button label="Đã kiểm tra · mở hồ sơ xe" secondary={!!receipt.draft} loading={busy} onPress={()=>{void acknowledge(false);}}/>
      </>:<Card style={{gap:12}}>
        <Text accessibilityRole="header" style={{color:theme.text,fontSize:19,fontWeight:'700'}}>{operation?'Đổi trạng thái đang chờ đối chiếu':'Không có mã chờ đối chiếu'}</Text>
        <Text style={{color:theme.muted,fontSize:14,lineHeight:21}}>Giữ mã đến khi đọc được kết quả gốc hoặc máy chủ xác nhận chưa ghi.</Text>
        {operation&&<Button label="Đối chiếu đổi trạng thái với máy chủ" loading={busy} onPress={()=>setConfirm(true)}/>}
        {!operation&&<Button label="Về Tài khoản" secondary disabled={busy} onPress={()=>router.replace('/(tabs)/account')}/>}
      </Card>}
      <Button label="Tải lại kết quả đổi trạng thái" secondary loading={busy} onPress={()=>{void load();}}/>
    </ScrollView>
    {confirm&&<ConfirmEdit title="Đối chiếu đổi trạng thái xe?" message="Nếu đã ghi, mở đúng kết quả gốc và nháp đã tạo. Nếu chưa ghi, khóa mã cũ để chặn yêu cầu đến muộn." confirmLabel="Đối chiếu với máy chủ" onCancel={()=>setConfirm(false)} onConfirm={()=>{void resolve();}}/>}
  </SafeAreaView>;
}
