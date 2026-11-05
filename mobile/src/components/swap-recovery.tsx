import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ScrollView,Text} from 'react-native';
import {router,useFocusEffect} from 'expo-router';
import {useQueryClient} from '@tanstack/react-query';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {MobileSwapReceipt} from '../../../shared/mobile-swaps';
import {useSession} from '@/providers/session';
import {pendingWrites} from '@/lib/pending-writes';
import {dateTime,useTheme} from '@/theme';
import {Button,Card,InlineError,StateView} from './ui';
import {ConfirmEdit} from './editor-sheet';

export function SwapRecovery({id}:{id:string}) {
  const {api,session}=useSession();
  if(!/^[1-9]\d{0,14}$/.test(id)||!api||!session||!session.user.permissions.includes('contracts.read')||!session.user.permissions.includes('contracts.return'))
    return <StateView title="Không thể mở phiếu đổi xe" message="Kiểm tra hợp đồng và quyền trả/đổi xe của tài khoản."/>;
  return <Recovery key={[api.origin,session.token,session.user.id,session.user.storeId,session.user.allStores,session.user.permissions.join(',')].join('|')} id={id}/>;
}
function Recovery({id}:{id:string}) {
  const {api,session}=useSession(),theme=useTheme(),cache=useQueryClient();
  const scope=useMemo(()=>({origin:api!.origin,userId:session!.user.id,storeId:session!.user.allStores?null:session!.user.storeId,allStores:session!.user.allStores}),[api,session]);
  const operation='return.swap:'+id;
  const [key,setKey]=useState<string|null>(null),[receipt,setReceipt]=useState<MobileSwapReceipt|null>(null);
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirm,setConfirm]=useState(false);
  const alive=useRef(false),running=useRef(false),epoch=useRef(0);
  const load=useCallback(async()=>{
    if(!api||running.current)return;
    running.current=true;const current=++epoch.current;setBusy(true);setError('');
    try{
      const pending=await pendingWrites.lookup(scope,operation);
      if(!alive.current||epoch.current!==current)return;
      setKey(pending);setReceipt(null);
      if(pending){
        const result=await api.swapReceipt(pending);
        if(!alive.current||epoch.current!==current)return;
        if(result.receipt&&String(result.receipt.id)!==id)throw Error('Phiếu đổi xe không khớp hợp đồng. Giữ mã để đối chiếu.');
        setReceipt(result.receipt);
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
      const result=await api.resolveWrite(key,operation);
      if(!alive.current||epoch.current!==current)return;
      if(result.status==='cancelled'){
        await pendingWrites.complete(scope,operation,key);
        if(!alive.current||epoch.current!==current)return;
        setKey(null);setReceipt(null);setNotice('Đã xác nhận chưa ghi đổi xe và khóa mã cũ. Có thể mở lại hợp đồng để tiếp tục.');
      }else{
        const saved=await api.swapReceipt(key);
        if(!alive.current||epoch.current!==current)return;
        if(!saved.receipt||String(saved.receipt.id)!==id)throw Error('Chưa đọc được phiếu đổi xe gốc. Giữ mã để đối chiếu.');
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
      await pendingWrites.complete(scope,operation,key);
      if(!alive.current||epoch.current!==current)return;
      for(const queryKey of [['record'],['catalogue'],['overview'],['swap-preparation'],['return-preparation']])void cache.invalidateQueries({queryKey});
      openContract();
    }catch(cause){if(alive.current&&epoch.current===current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current&&epoch.current===current)setBusy(false);}
  }
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}>
    <ScrollView contentContainerStyle={{padding:20,gap:18,maxWidth:760,width:'100%',alignSelf:'center'}}>
      {!!error&&<InlineError message={error}/>}
      {!!notice&&<Text accessibilityLiveRegion="polite" style={{color:theme.text,fontSize:16,lineHeight:25}}>{notice}</Text>}
      {!receipt?<Card style={{gap:16}}>
        <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:'800'}}>{key?'Đổi xe đang chờ đối chiếu':'Đối chiếu đổi xe'}</Text>
        <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>{key?'Giữ mã đến khi đã kiểm tra phiếu gốc hoặc máy chủ xác nhận chưa ghi.':'Không có yêu cầu đổi xe chờ đối chiếu cho hợp đồng này.'}</Text>
        {key&&<Button label="Đối chiếu đổi xe với máy chủ" loading={busy} onPress={()=>setConfirm(true)}/>}
        <Button label="Tải lại kết quả đổi xe" secondary loading={busy} onPress={()=>{void load();}}/>
        {!key&&<Button label="Mở hợp đồng" secondary disabled={busy} onPress={openContract}/>}
      </Card>:<>
        <Card style={{gap:16}}>
          <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:'800'}}>Đổi xe đã được ghi nhận</Text>
          <Text style={{color:theme.text,fontSize:19,fontWeight:'700'}}>{receipt.code}</Text>
          <Text selectable style={{color:theme.muted,fontSize:15,lineHeight:24}}>Ghi lúc {dateTime(receipt.recordedAt)} · phiếu #{receipt.swapId} · mã {receipt.requestId}</Text>
          {!receipt.current&&<InlineError message="Hồ sơ có thay đổi sau lần đổi xe này. Đây là phiếu gốc; kiểm tra dữ liệu hiện tại trước khi thao tác tiếp."/>}
          {!receipt.itemCurrent&&<Text style={{color:theme.warning,fontSize:16}}>Dòng thuê xe đã thay đổi.</Text>}
          {!receipt.vehicleCurrent&&<Text style={{color:theme.warning,fontSize:16}}>Thông tin hoặc trạng thái xe thay thế đã thay đổi.</Text>}
          {!receipt.historyCurrent&&<Text style={{color:theme.warning,fontSize:16}}>Lịch sử đổi xe đã được chỉnh sửa sau khi ghi.</Text>}
        </Card>
        <Card style={{gap:16}}>
          <Text accessibilityRole="header" style={{color:theme.text,fontSize:21,fontWeight:'700'}}>Xe cũ đã thay</Text>
          <Text style={{color:theme.text,fontSize:19,fontWeight:'700'}}>{receipt.from.license||('Xe #'+receipt.from.id)}</Text>
          <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>{receipt.from.name}</Text>
          <Text accessibilityRole="header" style={{color:theme.text,fontSize:21,fontWeight:'700'}}>Xe thay thế</Text>
          <Text style={{color:theme.text,fontSize:19,fontWeight:'700'}}>{receipt.to.license||('Xe #'+receipt.to.id)}</Text>
          <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>{[receipt.to.name,receipt.to.brand,receipt.to.color,receipt.to.year].filter(Boolean).join(' · ')}</Text>
          <Text style={{color:theme.text,fontSize:16,lineHeight:25}}>Kho khi đổi: {receipt.to.storeName||('#'+receipt.to.storeId)}</Text>
          <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>Lượt đổi xe giữ nguyên kỳ thuê, giá, tiền cọc và các khoản đã thu/hoàn.</Text>
        </Card>
        <Button label="Xác nhận đã kiểm tra phiếu đổi xe" loading={busy} onPress={()=>{void acknowledge();}}/>
        <Button label="Tải lại phiếu đổi xe" secondary loading={busy} onPress={()=>{void load();}}/>
      </>}
    </ScrollView>
    {confirm&&<ConfirmEdit title="Đối chiếu đổi xe?" message="Nếu đã ghi, mở đúng phiếu gốc để kiểm tra. Nếu chưa ghi, máy chủ khóa mã cũ để chặn yêu cầu đến muộn."
      confirmLabel="Đối chiếu với máy chủ" onCancel={()=>setConfirm(false)} onConfirm={()=>{void resolve();}}/>}
  </SafeAreaView>;
}
