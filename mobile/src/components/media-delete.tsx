import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Pressable,ScrollView,Text} from 'react-native';
import {router,useFocusEffect} from 'expo-router';
import {uuid} from 'expo';
import {useQueryClient} from '@tanstack/react-query';
import {SafeAreaView} from 'react-native-safe-area-context';
import {isMobileMediaIdentity,isMobileMediaSlot,type MobileMediaEntity,type MobileMediaIdentity,type MobileMediaSlotInfo} from '../../../shared/mobile-record-media';
import {mediaDeleteOperation,mediaMutationOperations,type MobileMediaDeleteReceipt} from '../../../shared/mobile-media-delete';
import {useSession} from '@/providers/session';
import {pendingWrites} from '@/lib/pending-writes';
import {dateTime,useTheme} from '@/theme';
import {Button,Card,InlineError,StateView} from './ui';
import {BillPhoto} from './bill-photo';
import {RecordVideoPlayer} from './record-video-player';
import {ConfirmEdit} from './editor-sheet';

export function MediaDeleteScreen({entity,id,kind,referenceId,slot}:{entity:string;id:string;kind?:string;referenceId?:string;slot?:string}){
  const {api,session}=useSession(),initial=kind&&referenceId?{entity,id:Number(id),kind,referenceId:Number(referenceId)}:null;
  if(!api||!session||!['contracts','customers','vehicles'].includes(entity)||!/^[1-9]\d{0,14}$/.test(id)||initial&&(!isMobileMediaIdentity(initial)||!isMobileMediaSlot(initial,slot)))
    return <StateView title="Không mở được thao tác xóa ảnh" message="Kiểm tra hồ sơ, lượt ghi nhận và ảnh đã chọn."/>;
  return <DeleteForm key={[api.origin,session.token,session.user.storeId,session.user.allStores,entity,id,kind,referenceId,slot].join('|')} entity={entity as MobileMediaEntity} id={Number(id)} initial={initial as MobileMediaIdentity|null} slot={slot}/>;
}
function DeleteForm({entity,id,initial,slot}:{entity:MobileMediaEntity;id:number;initial:MobileMediaIdentity|null;slot?:string}){
  const {api,session}=useSession(),theme=useTheme(),cache=useQueryClient();
  const scope=useMemo(()=>({origin:api!.origin,userId:session!.user.id,storeId:session!.user.allStores?null:session!.user.storeId,allStores:session!.user.allStores}),[api,session]);
  const operation=mediaDeleteOperation(entity,id),alive=useRef(true),running=useRef(false);
  const [key,setKey]=useState<string|null>(null),[checked,setChecked]=useState(false),[busy,setBusy]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [info,setInfo]=useState<MobileMediaSlotInfo|null>(null),[receipt,setReceipt]=useState<MobileMediaDeleteReceipt|null>(null),[confirm,setConfirm]=useState<MobileMediaSlotInfo|null>(null);
  const [imageReady,setImageReady]=useState(false),[imageFailed,setImageFailed]=useState(false),[metadataConfirmed,setMetadataConfirmed]=useState(false),[imageEpoch,setImageEpoch]=useState(0);
  const previewVersion=useRef(0);
  const resetPreview=useCallback(()=>{previewVersion.current++;setImageEpoch(previewVersion.current);setImageReady(false);setImageFailed(false);setMetadataConfirmed(false);},[]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const verify=useCallback((proof:MobileMediaDeleteReceipt)=>{if(proof.id!==id||proof.target.entity!==entity||proof.actorId!==scope.userId)throw Error('Phiếu xóa không khớp hồ sơ hoặc người thực hiện. Giữ mã để đối chiếu.');},[id,entity,scope.userId]);
  const load=useCallback(async()=>{
    if(!api||running.current)return;running.current=true;setBusy(true);setChecked(false);setError('');setInfo(null);resetPreview();
    try{
      const pending=await pendingWrites.lookup(scope,operation);if(!alive.current)return;setKey(pending);setReceipt(null);
      if(pending){const found=await api.mediaDeleteReceipt(entity,id,pending);if(!alive.current)return;if(found.receipt)verify(found.receipt);setReceipt(found.receipt);}
      else if(initial&&slot){const found=await api.mediaSlotInfo(initial,slot);if(!alive.current)return;setInfo(found);}
      setChecked(true);
    }catch(cause){if(alive.current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current)setBusy(false);}
  },[api,scope,operation,entity,id,initial,slot,verify,resetPreview]);
  useFocusEffect(useCallback(()=>{void load();},[load]));
  async function remove(prepared:MobileMediaSlotInfo){
    if(!api||running.current||key||!prepared.photo)return;running.current=true;setBusy(true);setConfirm(null);setError('');setNotice('');
    try{
      const pending=await pendingWrites.reserveExclusive(scope,operation,mediaMutationOperations(entity,id),()=>uuid.v4().toLowerCase());if(!alive.current)return;
      if(pending.operation!==operation)throw Error('Còn thao tác ảnh trên hồ sơ này. Vào Tài khoản để đối chiếu trước khi xóa.');setKey(pending.key);
      if(!pending.created)throw Error('Còn yêu cầu xóa chưa đối chiếu. Giữ mã và kiểm tra kết quả trước.');
      const proof=await api.deleteRecordMedia(prepared,pending.key);if(!alive.current)return;verify(proof);setReceipt(proof);setNotice('Đã xóa tệp khỏi đúng mục hồ sơ. Kiểm tra phiếu trước khi tiếp tục.');
      void cache.invalidateQueries({queryKey:['record-media']});
    }catch(cause){if(alive.current){setError((cause as Error).message);setNotice('Chưa xác nhận kết quả xóa. Đối chiếu yêu cầu trước khi thử lại.');}}
    finally{running.current=false;if(alive.current)setBusy(false);}
  }
  async function resolve(){
    if(!api||!key||running.current)return;running.current=true;setBusy(true);setError('');const pending=key;
    try{
      const result=await api.resolveWrite(pending,operation);if(!alive.current)return;
      if(result.status==='committed'){const found=await api.mediaDeleteReceipt(entity,id,pending);if(!alive.current)return;if(!found.receipt)throw Error('Đã xóa nhưng chưa đọc được phiếu gốc. Giữ mã để tải lại.');verify(found.receipt);setReceipt(found.receipt);setNotice('Đã tìm thấy phiếu xóa gốc. Kiểm tra trước khi tiếp tục.');}
      else{await pendingWrites.complete(scope,operation,pending);if(!alive.current)return;setKey(null);setReceipt(null);setInfo(null);resetPreview();setNotice('Ảnh chưa bị xóa; mã cũ đã khóa. Tải lại ảnh để kiểm tra trước khi thao tác tiếp.');}
    }catch(cause){if(alive.current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current)setBusy(false);}
  }
  const openPhotos=()=>router.replace({pathname:'/record-media/[entity]/[id]',params:{entity,id:String(id)}});
  async function acknowledge(){
    if(!key||!receipt||running.current)return;running.current=true;setBusy(true);setError('');
    try{verify(receipt);if(receipt.requestId!==key)throw Error('Phiếu xóa không khớp mã đang chờ.');await pendingWrites.complete(scope,operation,key);if(!alive.current)return;void cache.invalidateQueries({queryKey:['record-media']});openPhotos();}
    catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setBusy(false);}
  }
  const photo=info?.photo,metadataReview=!!photo&&(!photo.readable||imageFailed);
  const canDelete=checked&&!busy&&!key&&!!photo&&info?.target.canWrite!==false&&(metadataReview?metadataConfirmed:imageReady);
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}>
    <ScrollView contentContainerStyle={{padding:20,gap:18,maxWidth:760,width:'100%',alignSelf:'center'}}>
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:24,fontWeight:'800'}}>{receipt?'Phiếu xóa ảnh đã ghi':'Rà soát tệp trước khi xóa'}</Text>
      {!!error&&<InlineError message={error}/>}{!!notice&&<Text accessibilityLiveRegion="polite" style={{color:theme.text,fontSize:15,lineHeight:24}}>{notice}</Text>}
      {receipt?<>
        <Card style={{gap:12}}><Text style={{color:theme.text,fontSize:19,fontWeight:'700'}}>{receipt.target.label}</Text><Text style={{color:theme.text,fontSize:17}}>{receipt.photo.label}</Text>
          <Text style={{color:theme.muted,fontSize:15}}>{receipt.actorName} · {dateTime(receipt.recordedAt)} · {receipt.photo.mimeType}</Text>
          {!receipt.parentCurrent&&<InlineError message="Hồ sơ đã thay đổi sau lần xóa. Đây là phiếu của lần xóa gốc."/>}
          {!receipt.referenceCurrent&&<InlineError message="Lượt ghi nhận đã thay đổi sau lần xóa. Kiểm tra lại hồ sơ hiện tại."/>}
          {!receipt.slotEmpty&&<InlineError message="Mục này đã có tệp khác sau lần xóa. Phiếu gốc được giữ; tệp mới không bị xóa lại."/>}
          {receipt.current&&<Text style={{color:theme.success,fontSize:16}}>Đã xóa đúng tệp; mục này hiện đang trống.</Text>}</Card>
        <Button label="Đã kiểm tra phiếu xóa ảnh" disabled={busy} loading={busy} onPress={()=>void acknowledge()}/>
      </>:key?<Card style={{gap:12}}><Text style={{color:theme.text,fontSize:18,fontWeight:'700'}}>Yêu cầu xóa đang chờ đối chiếu</Text><Text style={{color:theme.muted,fontSize:15,lineHeight:24}}>Giữ yêu cầu gốc để kiểm tra; chưa gửi thêm lần xóa.</Text><Button label="Đối chiếu xóa ảnh với máy chủ" loading={busy} onPress={()=>void resolve()}/></Card>:info?<>
        <Card style={{gap:14}}><Text style={{color:theme.text,fontSize:19,fontWeight:'700'}}>{info.target.label}</Text><Text style={{color:theme.text,fontSize:17}}>{info.label}</Text>
          {photo?<><Text style={{color:theme.muted,fontSize:15,lineHeight:24}}>{dateTime(photo.updatedAt)} · {photo.mimeType}{photo.bytes===null?'':` · ${Math.ceil(photo.bytes/1024)} KB`}</Text>
            {photo.readable&&photo.kind==='video'&&<RecordVideoPlayer key={photo.revision+':'+imageEpoch} source={api!.recordVideoSource(info.target,photo)} label="Video hồ sơ sẽ xóa" onReady={ready=>{if(!alive.current||previewVersion.current!==imageEpoch)return;setImageReady(ready);setImageFailed(!ready);setMetadataConfirmed(false);}}/>}
            {photo.readable&&photo.kind==='image'&&<BillPhoto key={photo.revision+':'+imageEpoch} context="hồ sơ" source={api!.recordMediaImageSource(info.target,photo)} label="Tệp hồ sơ sẽ xóa" onReady={ready=>{if(!alive.current||previewVersion.current!==imageEpoch)return;setImageReady(ready);setImageFailed(!ready);setMetadataConfirmed(false);}}/>}
            {photo.readable&&<Button secondary label="Tải lại ảnh cần xóa" disabled={busy} onPress={resetPreview}/>}
            {metadataReview&&<>
              <Text style={{color:theme.warning,fontSize:15,lineHeight:24}}>{imageFailed?'Không tải được ảnh. Có thể tải lại hoặc xác nhận theo thông tin tệp.':photo.blockedReason} Kiểm tra tên mục và thời điểm tệp trước khi xác nhận xóa.</Text>
              <Pressable accessibilityRole="checkbox" accessibilityLabel="Xác nhận xóa tệp theo thông tin hồ sơ" accessibilityState={{checked:metadataConfirmed,disabled:busy}} disabled={busy} onPress={()=>setMetadataConfirmed(v=>!v)} style={{minHeight:56,padding:14,borderWidth:1,borderColor:theme.border,borderRadius:12}}>
                <Text style={{color:theme.text,fontSize:16}}>{metadataConfirmed?'Đã xác nhận':'Xác nhận'} xóa tệp theo thông tin hồ sơ</Text></Pressable>
            </>}
            <Text style={{color:theme.muted,fontSize:15,lineHeight:24}}>Tệp được gỡ khỏi đúng mục đã chọn. Thông tin hợp đồng và các tệp khác được giữ.</Text></>:<Text style={{color:theme.muted,fontSize:16}}>Mục này hiện không có tệp để xóa.</Text>}
        </Card>
        {info.target.canWrite===false&&<InlineError message="Hồ sơ này chỉ được xem trong phạm vi hiện tại."/>}
        {photo&&<Button label="Xóa tệp đã rà soát" disabled={!canDelete} onPress={()=>setConfirm(info)}/>}
      </>:<Text style={{color:theme.muted,fontSize:16,lineHeight:24}}>{busy?'Đang tải thông tin tệp…':'Mở ảnh hồ sơ hoặc tải lại để chọn đúng tệp cần xóa.'}</Text>}
      <Button label="Tải lại kết quả xóa ảnh" secondary loading={busy} onPress={()=>void load()}/>
      {!key&&<Button label="Mở ảnh hồ sơ" secondary disabled={busy} onPress={openPhotos}/>}
    </ScrollView>
    {confirm&&<ConfirmEdit title="Xóa tệp khỏi hồ sơ?" message={confirm.target.label+' · '+confirm.label+'. Tệp tại mục này sẽ được xóa khỏi hồ sơ. Kiểm tra đúng ảnh hoặc video trước khi xác nhận.'} confirmLabel="Xác nhận xóa tệp" onCancel={()=>setConfirm(null)} onConfirm={()=>void remove(confirm)}/>}
  </SafeAreaView>;
}
