import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ScrollView,Text} from 'react-native';
import {router,useFocusEffect} from 'expo-router';
import {useQueryClient} from '@tanstack/react-query';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {MobileRecoveryReceipt} from '../../../shared/mobile-bad-debt-recovery';
import {useSession} from '@/providers/session';
import {pendingWrites} from '@/lib/pending-writes';
import {dateTime,money,statuses,useTheme} from '@/theme';
import {Button,Card,InlineError,StateView} from './ui';
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
      for(const queryKey of [['record'],['catalogue'],['overview'],['recovery-preparation'],['return-preparation'],['swap-preparation']])void cache.invalidateQueries({queryKey});
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
        <Card style={{gap:16}}>
          <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:'800'}}>Thu hồi xe đã được ghi nhận</Text>
          <Text style={{color:theme.text,fontSize:19,fontWeight:'700'}}>{receipt.review.code}</Text>
          <Text style={{color:theme.text,fontSize:19,fontWeight:'700'}}>{receipt.review.item.license||('Xe #'+receipt.review.item.vehicleId)}</Text>
          <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>{receipt.review.item.name}</Text>
          <Text style={{color:theme.text,fontSize:17,lineHeight:26}}>Thu hồi thực tế: {dateTime(receipt.event.recoveredAt)}</Text>
          <Text selectable style={{color:theme.muted,fontSize:15,lineHeight:24}}>Ghi bởi {receipt.actorName} · {dateTime(receipt.recordedAt)} · mã {receipt.requestId}</Text>
          {!!receipt.event.note&&<Text style={{color:theme.text,fontSize:16,lineHeight:25}}>{receipt.event.note}</Text>}
          {!receipt.current&&<InlineError message="Hồ sơ có thay đổi sau lần thu hồi này. Đây là phiếu gốc; kiểm tra dữ liệu hiện tại trước khi thao tác tiếp."/>}
          {!receipt.itemCurrent&&<Text style={{color:theme.warning,fontSize:16,lineHeight:25}}>Dòng xe hoặc ngày thu hồi đã thay đổi.</Text>}
          {!receipt.historyCurrent&&<Text style={{color:theme.warning,fontSize:16,lineHeight:25}}>Lịch sử thu hồi đã thay đổi sau khi ghi.</Text>}
          {!receipt.moneyCurrent&&<Text style={{color:theme.warning,fontSize:16,lineHeight:25}}>Số dư hoặc lịch sử tiền đã thay đổi sau khi ghi.</Text>}
        </Card>
        <Card style={{gap:14}}>
          <Text accessibilityRole="header" style={{color:theme.text,fontSize:21,fontWeight:'700'}}>Số dư được giữ nguyên khi thu hồi</Text>
          <Text style={{color:theme.text,fontSize:17,lineHeight:26}}>Còn nợ thuê: {amount(receipt.review.after.rentalRemaining)}</Text>
          <Text style={{color:theme.text,fontSize:17,lineHeight:26}}>Cọc đang giữ: {amount(receipt.review.after.depositHeld)}</Text>
          <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>Trạng thái sau ghi: {statuses[receipt.review.after.status]||receipt.review.after.status}</Text>
          <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>Không phát sinh thu hoặc hoàn tiền. Kiểm tra tình trạng kho hiện tại trước khi bàn giao xe tiếp.</Text>
        </Card>
        <Button label="Xác nhận đã kiểm tra phiếu thu hồi" loading={busy} onPress={()=>{void acknowledge();}}/>
        <Button label="Tải lại phiếu thu hồi" secondary loading={busy} onPress={()=>{void load();}}/>
      </>}
    </ScrollView>
    {confirm&&<ConfirmEdit title="Đối chiếu thu hồi xe?" message="Nếu đã ghi, mở đúng phiếu gốc. Nếu chưa ghi, máy chủ khóa mã cũ để chặn yêu cầu đến muộn."
      confirmLabel="Đối chiếu với máy chủ" onCancel={()=>setConfirm(false)} onConfirm={()=>{void resolve();}}/>}
  </SafeAreaView>;
}
