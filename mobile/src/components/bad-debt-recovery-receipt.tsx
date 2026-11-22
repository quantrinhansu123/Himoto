import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {router,useFocusEffect} from 'expo-router';
import {useQueryClient} from '@tanstack/react-query';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {MobileRecoveryReceipt} from '../../../shared/mobile-bad-debt-recovery';
import {useSession} from '@/providers/session';
import {pendingWrites} from '@/lib/pending-writes';
import {dateTime,money,statuses,useTheme} from '@/theme';
import {Button,Card,InlineError,KeyValueRow,StateView,StatusBadge} from './ui';
import {ConfirmEdit} from './editor-sheet';

export function BadDebtRecoveryReceipt({id}:{id:string}) {
  const {api,session}=useSession();
  if(!/^[1-9]\d{0,14}$/.test(id)||!api||!session||!session.user.permissions.includes('contracts.read')||!session.user.permissions.includes('contracts.return'))
    return <StateView title="Không thể mở phiếu thu hồi" message="Kiểm tra hợp đồng và quyền trả/thu hồi xe của tài khoản."/>;
  return <Receipt key={[api.origin,session.token,session.user.storeId,session.user.allStores,id].join('|')} id={id}/>;
}
function Receipt({id}:{id:string}) {
  const {api,session}=useSession(),theme=useTheme(),cache=useQueryClient();
  const scope=useMemo(()=>({origin:api!.origin,userId:session!.user.id,storeId:session!.user.allStores?null:session!.user.storeId,allStores:session!.user.allStores}),[api,session]);
  const operation='return.recover:'+id;
  const [key,setKey]=useState<string|null>(null),[receipt,setReceipt]=useState<MobileRecoveryReceipt|null>(null);
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirm,setConfirm]=useState(false);
  const alive=useRef(false),running=useRef(false),epoch=useRef(0);
  const load=useCallback(async()=>{
    if(!api||running.current)return;
    running.current=true;const current=++epoch.current;setBusy(true);setError('');
    try{
      const pending=await pendingWrites.lookup(scope,operation);if(!alive.current||epoch.current!==current)return;
      setKey(pending);setReceipt(null);
      if(pending){
        const saved=await api.recoveryReceipt(pending);if(!alive.current||epoch.current!==current)return;
        if(saved.receipt&&String(saved.receipt.id)!==id)throw Error('Phiếu thu hồi không khớp hợp đồng. Giữ mã để đối chiếu.');
        setReceipt(saved.receipt);
      }
    }catch(cause){if(alive.current&&epoch.current===current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current&&epoch.current===current)setBusy(false);}
  },[api,scope,operation,id]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useFocusEffect(useCallback(()=>{void load();},[load]));
  async function resolve(){
    if(!api||!key||running.current)return;
    running.current=true;setBusy(true);setConfirm(false);setError('');const current=epoch.current;
    try{
      const result=await api.resolveWrite(key,operation);if(!alive.current||epoch.current!==current)return;
      if(result.status==='cancelled'){
        await pendingWrites.complete(scope,operation,key);if(!alive.current||epoch.current!==current)return;
        setKey(null);setReceipt(null);setNotice('Máy chủ xác nhận chưa ghi thu hồi và đã khóa mã cũ. Có thể mở lại hợp đồng để tiếp tục.');
      }else{
        const saved=await api.recoveryReceipt(key);if(!alive.current||epoch.current!==current)return;
        if(!saved.receipt||String(saved.receipt.id)!==id)throw Error('Chưa đọc được phiếu thu hồi gốc. Giữ mã để đối chiếu.');
        setReceipt(saved.receipt);
      }
    }catch(cause){if(alive.current&&epoch.current===current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current&&epoch.current===current)setBusy(false);}
  }
  const openContract=()=>router.dismissTo({pathname:'/record/[kind]/[id]',params:{kind:'contracts',id}});
  async function acknowledge(){
    if(!key||!receipt||receipt.requestId!==key||running.current)return;
    running.current=true;setBusy(true);setError('');const current=epoch.current;
    try{
      await pendingWrites.complete(scope,operation,key);if(!alive.current||epoch.current!==current)return;
      for(const queryKey of [['record'],['catalogue'],['overview'],['recovery-preparation'],['return-preparation'],['swap-preparation'],['finance'],['contract-history'],['vehicle-profile'],['vehicle-history'],['fleet-inventory']])void cache.invalidateQueries({queryKey});
      openContract();
    }catch(cause){if(alive.current&&epoch.current===current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current&&epoch.current===current)setBusy(false);}
  }
  const amount=(value:number|null)=>value===null?'Chưa đối chiếu':money(value);
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}>
    <ScrollView contentContainerStyle={{padding:20,gap:18,maxWidth:760,width:'100%',alignSelf:'center'}}>
      {!!error&&<InlineError message={error}/>}
      {!!notice&&<Text accessibilityLiveRegion="polite" style={{color:theme.text,fontSize:16,lineHeight:25}}>{notice}</Text>}
      {!receipt?<Card style={{gap:16}}>
        <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:'800'}}>{key?'Thu hồi xe đang chờ đối chiếu':'Đối chiếu thu hồi xe'}</Text>
        <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>{key?'Giữ mã đến khi đã kiểm tra phiếu gốc hoặc máy chủ xác nhận chưa ghi.':'Không có yêu cầu thu hồi xe chờ đối chiếu cho hợp đồng này.'}</Text>
        {key&&<Button label="Đối chiếu thu hồi với máy chủ" loading={busy} onPress={()=>setConfirm(true)}/>}
        <Button label="Tải lại phiếu thu hồi" secondary loading={busy} onPress={()=>{void load();}}/>
        {!key&&<Button label="Mở hợp đồng" secondary disabled={busy} onPress={openContract}/>}
      </Card>:<>
        <Card style={{gap:14}}>
          <Text accessibilityRole="header" style={{color:theme.text,fontSize:20,fontWeight:'800'}}>Thu hồi xe đã được ghi nhận</Text>
          <View style={{gap:2}}>
            <KeyValueRow label="Mã hợp đồng" value={receipt.review.code} emphasize />
            <KeyValueRow label="Biển số" value={receipt.review.item.license||('Xe #'+receipt.review.item.vehicleId)} emphasize />
            <KeyValueRow label="Tên xe" value={receipt.review.item.name} />
            <KeyValueRow label="Thu hồi thực tế" value={dateTime(receipt.event.recoveredAt)} emphasize />
            <KeyValueRow label="Người ghi nhận" value={`${receipt.actorName} · ${dateTime(receipt.recordedAt)}`} />
            {!!receipt.event.note&&<KeyValueRow label="Ghi chú" value={receipt.event.note} />}
          </View>
          <Text selectable style={{color:theme.muted,fontSize:13,lineHeight:19}}>Mã đối chiếu: {receipt.requestId}</Text>
          {!receipt.current&&<InlineError message="Hồ sơ có thay đổi sau lần thu hồi này. Đây là phiếu gốc; kiểm tra dữ liệu hiện tại trước khi thao tác tiếp."/>}
          {!receipt.itemCurrent&&<Text style={{color:theme.warning,fontSize:14,lineHeight:21}}>Dòng xe hoặc ngày thu hồi đã thay đổi.</Text>}
          {!receipt.historyCurrent&&<Text style={{color:theme.warning,fontSize:14,lineHeight:21}}>Lịch sử thu hồi đã thay đổi sau khi ghi.</Text>}
          {!receipt.moneyCurrent&&<Text style={{color:theme.warning,fontSize:14,lineHeight:21}}>Số dư hoặc lịch sử tiền đã thay đổi sau khi ghi.</Text>}
        </Card>
        <Card style={{gap:12}}>
          <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8}}>
            <Text accessibilityRole="header" style={{color:theme.text,fontSize:18,fontWeight:'700'}}>Số dư được giữ nguyên khi thu hồi</Text>
            <StatusBadge status={receipt.review.after.status} label={statuses[receipt.review.after.status]||receipt.review.after.status} />
          </View>
          <View style={{gap:2}}>
            <KeyValueRow label="Còn nợ thuê" value={amount(receipt.review.after.rentalRemaining)} emphasize />
            <KeyValueRow label="Cọc đang giữ" value={amount(receipt.review.after.depositHeld)} />
          </View>
          <Text style={{color:theme.muted,fontSize:13.5,lineHeight:20}}>Không phát sinh thu hoặc hoàn tiền. Kiểm tra tình trạng kho hiện tại trước khi bàn giao xe tiếp.</Text>
        </Card>
        <Button label="Xác nhận đã kiểm tra phiếu thu hồi" loading={busy} onPress={()=>{void acknowledge();}}/>
        <Button label="Tải lại phiếu thu hồi" secondary loading={busy} onPress={()=>{void load();}}/>
      </>}
    </ScrollView>
    {confirm&&<ConfirmEdit title="Đối chiếu thu hồi xe?" message="Nếu đã ghi, mở đúng phiếu gốc. Nếu chưa ghi, máy chủ khóa mã cũ để chặn yêu cầu đến muộn."
      confirmLabel="Đối chiếu với máy chủ" onCancel={()=>setConfirm(false)} onConfirm={()=>{void resolve();}}/>}
  </SafeAreaView>;
}
