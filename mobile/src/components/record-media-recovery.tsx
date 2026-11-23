import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {router,useFocusEffect} from 'expo-router';
import {useQueryClient} from '@tanstack/react-query';
import {SafeAreaView} from 'react-native-safe-area-context';
import {mediaOperation,type MobileMediaEntity,type MobileMediaReceipt} from '../../../shared/mobile-record-media';
import {useSession} from '@/providers/session';
import {pendingWrites} from '@/lib/pending-writes';
import {dateTime,useTheme} from '@/theme';
import {Button,Card,InfoBanner,InlineError,KeyValueRow,StateView,StatusBadge} from './ui';
import {ConfirmEdit} from './editor-sheet';
import {BillPhoto} from './bill-photo';

export function RecordMediaRecovery({entity,id}:{entity:string;id:string}) {
  const {api,session}=useSession();
  if(!api||!session||!['contracts','vehicles','customers'].includes(entity)||!/^[1-9]\d{0,14}$/.test(id))return <StateView title="Không mở được phiếu lưu ảnh" message="Kiểm tra hồ sơ và quyền truy cập hiện tại."/>;
  return <Recovery key={[api.origin,session.token,session.user.storeId,session.user.allStores,entity,id].join('|')} entity={entity as MobileMediaEntity} id={id}/>;
}
function Recovery({entity,id}:{entity:MobileMediaEntity;id:string}) {
  const {api,session}=useSession(),theme=useTheme(),cache=useQueryClient();
  const scope=useMemo(()=>({origin:api!.origin,userId:session!.user.id,storeId:session!.user.allStores?null:session!.user.storeId,allStores:session!.user.allStores}),[api,session]);
  const operation=mediaOperation(entity,Number(id));
  const [key,setKey]=useState<string|null>(null),[receipt,setReceipt]=useState<MobileMediaReceipt|null>(null);
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirm,setConfirm]=useState(false);
  const [imageReady,setImageReady]=useState(false),[imageEpoch,setImageEpoch]=useState(0);
  const alive=useRef(false),running=useRef(false),epoch=useRef(0);
  const load=useCallback(async()=>{
    if(!api||running.current)return;
    running.current=true;const current=++epoch.current;setBusy(true);setError('');
    try{
      const pending=await pendingWrites.lookup(scope,operation);if(!alive.current||epoch.current!==current)return;
      setKey(pending);setReceipt(null);setImageReady(false);
      if(pending){
        const found=await api.mediaReceipt(pending);if(!alive.current||epoch.current!==current)return;
        if(found.receipt&&(String(found.receipt.id)!==id||found.receipt.target.entity!==entity))throw Error('Phiếu lưu ảnh không khớp hồ sơ. Giữ mã để đối chiếu.');
        setReceipt(found.receipt);
      }
    }catch(cause){if(alive.current&&epoch.current===current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current&&epoch.current===current)setBusy(false);}
  },[api,scope,operation,id,entity]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useFocusEffect(useCallback(()=>{void load();},[load]));
  const openRecord=()=>router.dismissTo({pathname:'/record/[kind]/[id]',params:{kind:entity,id}});
  async function resolve(){
    if(!api||!key||running.current)return;
    running.current=true;setBusy(true);setConfirm(false);setError('');const current=epoch.current;
    try{
      const result=await api.resolveWrite(key,operation);if(!alive.current||epoch.current!==current)return;
      if(result.status==='cancelled'){
        await pendingWrites.complete(scope,operation,key);if(!alive.current||epoch.current!==current)return;
        setKey(null);setReceipt(null);setNotice('Máy chủ xác nhận chưa lưu ảnh và đã khóa mã cũ. Có thể mở lại hồ sơ để tiếp tục.');
      }else{
        const found=await api.mediaReceipt(key);if(!alive.current||epoch.current!==current)return;
        if(!found.receipt||String(found.receipt.id)!==id||found.receipt.target.entity!==entity)throw Error('Chưa đọc được phiếu lưu ảnh gốc. Giữ mã để đối chiếu.');
        setReceipt(found.receipt);
      }
    }catch(cause){if(alive.current&&epoch.current===current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current&&epoch.current===current)setBusy(false);}
  }
  async function acknowledge(){
    if(!key||!receipt||receipt.requestId!==key||running.current)return;
    running.current=true;setBusy(true);setError('');const current=epoch.current;
    try{
      await pendingWrites.complete(scope,operation,key);if(!alive.current||epoch.current!==current)return;
      void cache.invalidateQueries({queryKey:['record-media']});openRecord();
    }catch(cause){if(alive.current&&epoch.current===current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current&&epoch.current===current)setBusy(false);}
  }
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}>
    <ScrollView contentContainerStyle={{padding:16,paddingBottom:36,gap:12,maxWidth:760,width:'100%',alignSelf:'center'}}>
      {!!error&&<InlineError message={error}/>}
      {!!notice&&<InfoBanner tone="info" message={notice}/>}
      {!receipt?<Card style={{gap:12}}>
        <Text accessibilityRole="header" style={{color:theme.text,fontSize:20,fontWeight:'800'}}>{key?'Ảnh đang chờ đối chiếu':'Đối chiếu lưu ảnh'}</Text>
        <Text style={{color:theme.muted,fontSize:14,lineHeight:21}}>{key?'Giữ mã đến khi đã kiểm tra phiếu gốc hoặc máy chủ xác nhận chưa lưu ảnh.':'Không có yêu cầu lưu ảnh đang chờ cho hồ sơ này.'}</Text>
        {key&&<Button label="Đối chiếu lưu ảnh với máy chủ" loading={busy} onPress={()=>setConfirm(true)}/>}
        <Button label="Tải lại phiếu lưu ảnh" secondary loading={busy} onPress={()=>{void load();}}/>
        {!key&&<Button label="Mở hồ sơ" secondary disabled={busy} onPress={openRecord}/>}
      </Card>:<>
        <Card style={{gap:10}}>
          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
            <Text accessibilityRole="header" style={{color:theme.success,fontSize:20,fontWeight:'800',flexShrink:1}}>Ảnh đã được lưu vào hồ sơ</Text>
            <StatusBadge label={`${Math.ceil(receipt.bytes/1024)} KB`} tone="success"/>
          </View>
          <KeyValueRow label="Hồ sơ" value={receipt.target.label} emphasize/>
          <KeyValueRow label="Vị trí ảnh" value={receipt.label}/>
          <KeyValueRow label="Ghi nhận bởi" value={`${receipt.actorName||'Nhân viên'} · ${dateTime(receipt.recordedAt)}`}/>
          <Text selectable style={{color:theme.muted,fontSize:12}}>Mã {receipt.requestId}</Text>
          {receipt.current&&<BillPhoto key={receipt.requestId+':'+imageEpoch} context="hồ sơ" label="Ảnh đã lưu trong hồ sơ" onReady={setImageReady}
            source={api!.recordMediaImageSource(receipt.target,{slot:receipt.slot,label:receipt.label,revision:receipt.photoRevision,mimeType:'image/jpeg',bytes:receipt.bytes,updatedAt:receipt.recordedAt,kind:'image',readable:true,blockedReason:null})}/>}
          {!receipt.current&&<InlineError message="Hồ sơ, lượt ghi nhận hoặc ảnh đã thay đổi. Đây là thông tin của lần lưu gốc."/>}
          {!receipt.parentCurrent&&<InfoBanner tone="warning" message="Hồ sơ đã thay đổi sau khi lưu ảnh."/>}
          {!receipt.referenceCurrent&&<InfoBanner tone="warning" message="Dòng xe hoặc lượt ghi nhận đã thay đổi sau khi lưu ảnh."/>}
          {!receipt.photoCurrent&&<InfoBanner tone="warning" message="Ảnh trong ô này đã được thay hoặc gỡ. Phiếu vẫn giữ thông tin ảnh lúc lưu."/>}
        </Card>
        {receipt.current&&<Button secondary label="Tải lại ảnh đã lưu" disabled={busy} onPress={()=>{setImageReady(false);setImageEpoch(e=>e+1);}}/>}
        <Button label="Xác nhận đã kiểm tra phiếu lưu ảnh" loading={busy} disabled={receipt.current&&!imageReady} onPress={()=>{void acknowledge();}}/>
        <Button label="Tải lại phiếu lưu ảnh" secondary loading={busy} onPress={()=>{void load();}}/>
      </>}
    </ScrollView>
    {confirm&&<ConfirmEdit title="Đối chiếu lưu ảnh?" message="Nếu đã lưu, mở phiếu gốc. Nếu chưa lưu, máy chủ khóa mã cũ để chặn ảnh gửi đến muộn."
      confirmLabel="Đối chiếu với máy chủ" onCancel={()=>setConfirm(false)} onConfirm={()=>{void resolve();}}/>}
  </SafeAreaView>;
}
