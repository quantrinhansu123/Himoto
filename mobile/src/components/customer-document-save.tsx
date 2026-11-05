import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {AccessibilityInfo,Modal,ScrollView,Text,View,type ScrollViewInstance} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {uuid} from 'expo';
import type {MobileDraftCustomer} from '@himoto/mobile-contract';
import type {MobileMediaReceipt,MobileMediaSlotInfo} from '../../../shared/mobile-record-media';
import type {useCustomerDocuments} from '@/hooks/use-customer-documents';
import {useSession} from '@/providers/session';
import {pendingWrites} from '@/lib/pending-writes';
import {useReducedMotion} from '@/hooks/use-reduced-motion';
import {useTheme} from '@/theme';
import {Button,Card,InlineError} from './ui';
import {BillPhoto} from './bill-photo';
import {ConfirmEdit} from './editor-sheet';

export function CustomerDocumentSave({customer,documents,onClose,onComplete}:{customer:MobileDraftCustomer;documents:ReturnType<typeof useCustomerDocuments>;onClose:()=>void;onComplete:()=>Promise<void>}){
  const {api,session}=useSession(),theme=useTheme(),reduced=useReducedMotion();
  const scroll=useRef<ScrollViewInstance>(null),alive=useRef(true),running=useRef(false);
  const token=useRef(session?.token);
  const docs=useRef(documents);
  useEffect(()=>{token.current=session?.token;docs.current=documents;},[session?.token,documents]);
  const scope=useMemo(()=>api&&session?{origin:api.origin,userId:session.user.id,storeId:session.user.allStores?null:session.user.storeId,allStores:session.user.allStores}:null,[api,session]);
  const target=useMemo(()=>({entity:'customers' as const,id:customer.id,kind:'customer' as const,referenceId:customer.id}),[customer.id]);
  const operation=`media.customer:${customer.id}`;
  const [infos,setInfos]=useState<Record<string,MobileMediaSlotInfo>>({}),[ready,setReady]=useState<Record<string,boolean>>({});
  const [busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[key,setKey]=useState<string|null>(null);
  const [receipt,setReceipt]=useState<MobileMediaReceipt|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [confirm,setConfirm]=useState<'save'|'discard'|null>(null),[reviewVersion,setReviewVersion]=useState(0);
  const attempt=useRef<{key:string;photoId:string}|null>(null);
  const current=useCallback((at:string|undefined)=>alive.current&&token.current===at,[]);
  const remaining=documents.photos.filter(row=>row.savedTo!==customer.id);
  const fail=useCallback((cause:unknown)=>{const message=(cause as Error).message;setError(message);scroll.current?.scrollTo({y:0,animated:!reduced});AccessibilityInfo.announceForAccessibility(message);},[reduced]);
  const load=useCallback(async()=>{
    if(!api||!scope||running.current)return;
    const at=token.current;running.current=true;setBusy(true);setError('');
    try{
      const pending=await pendingWrites.lookup(scope,operation);if(!current(at))return;
      setKey(pending);
      if(pending){
        const found=await api.mediaReceipt(pending);if(!current(at))return;
        if(found.receipt){if(found.receipt.id!==customer.id||found.receipt.actorId!==scope.userId)throw Error('Phiếu ảnh không khớp hồ sơ hoặc người lưu. Giữ mã để đối chiếu.');setReceipt(found.receipt);}
      }else{
        const next:Record<string,MobileMediaSlotInfo>={};
        for(const row of docs.current.photos.filter(row=>row.savedTo!==customer.id)){
          next[row.id]=await api.mediaSlotInfo(target,row.slot);if(!current(at))return;
        }
        setReady({});setReviewVersion(v=>v+1);setInfos(next);setLoaded(true);
      }
    }catch(cause){if(current(at))fail(cause);}
    finally{running.current=false;if(alive.current)setBusy(false);}
  },[api,scope,operation,target,customer.id,fail,current]);
  useEffect(()=>{alive.current=true;void Promise.resolve().then(()=>{if(alive.current)void load();});return()=>{alive.current=false;};},[load]);
  async function acknowledge(proof:MobileMediaReceipt,pending:string){
    const at=token.current;
    if(!scope)throw Error('Chưa có phiên để đối chiếu ảnh.');
    if(proof.requestId!==pending||proof.id!==customer.id||proof.actorId!==scope.userId)throw Error('Phiếu ảnh không khớp hồ sơ hoặc người lưu.');
    await pendingWrites.complete(scope,operation,pending);
    if(!current(at))return;
    if(attempt.current?.key===pending)docs.current.markSaved(attempt.current.photoId,customer.id);
    attempt.current=null;setKey(null);setReceipt(null);setLoaded(false);
  }
  async function resolve(){
    if(!api||!scope||!key||running.current)return;
    const at=token.current,pending=key;running.current=true;setBusy(true);setError('');
    try{
      const result=await api.resolveWrite(pending,operation);if(!current(at))return;
      if(result.status==='committed'){
        const found=await api.mediaReceipt(pending);if(!current(at))return;
        if(!found.receipt)throw Error('Ảnh đã lưu nhưng chưa tải được phiếu. Giữ mã và thử lại.');
        setReceipt(found.receipt);setNotice('Đã tìm thấy ảnh đã lưu. Xem và xác nhận phiếu trước khi tiếp tục.');
      }else{
        await pendingWrites.complete(scope,operation,pending);if(!current(at))return;
        attempt.current=null;setKey(null);setReceipt(null);setLoaded(false);setNotice('Ảnh chưa được lưu; mã cũ đã khóa. Ảnh đang chọn được giữ để rà soát và lưu lại.');
      }
    }catch(cause){if(current(at))fail(cause);}
    finally{running.current=false;if(alive.current)setBusy(false);}
  }
  async function acceptReceipt(){
    if(!receipt||!key||running.current)return;
    const at=token.current;running.current=true;setBusy(true);setError('');
    try{await acknowledge(receipt,key);if(current(at))setNotice('Đã đối chiếu ảnh gốc. Tải lại phần ảnh còn lại để tiếp tục.');}
    catch(cause){if(current(at))fail(cause);}
    finally{running.current=false;if(alive.current)setBusy(false);}
  }
  async function save(){
    if(!api||!scope||!loaded||key||running.current)return;
    const at=token.current;running.current=true;setBusy(true);setError('');setConfirm(null);
    try{
      for(const row of docs.current.photos.filter(row=>row.savedTo!==customer.id)){
        const info=infos[row.id];if(!info||!info.target.canWrite||!ready[row.id]||info.photo&&(!info.photo.readable||!ready['old:'+row.id]))throw Error('Tải lại và xem đầy đủ ảnh trước khi lưu.');
        const reserved=await pendingWrites.reserveExclusive(scope,operation,[operation],()=>uuid.v4().toLowerCase());if(!current(at))return;
        setKey(reserved.key);
        if(!reserved.created)throw Error('Có yêu cầu ảnh khác trên hồ sơ. Đối chiếu mã cũ trước khi gửi.');
        attempt.current={key:reserved.key,photoId:row.id};
        const bytes=await row.photo.bytes();if(!current(at))return;
        if(bytes.byteLength!==row.photo.size||bytes.byteLength>2*1024*1024)throw Error('Tệp ảnh đã thay đổi. Giữ mã để đối chiếu.');
        const proof=await api.uploadRecordMedia(info.target,info.slot,info.photo?.revision??null,bytes,reserved.key);if(!current(at))return;
        await acknowledge(proof,reserved.key);if(!current(at))return;
      }
      await onComplete();
    }catch(cause){if(current(at))fail(cause);}
    finally{running.current=false;if(alive.current)setBusy(false);}
  }
  function close(){if(busy||key||running.current){setNotice('Đối chiếu yêu cầu ảnh đang gửi trước khi quay lại. Ảnh và thông tin đang nhập được giữ.');scroll.current?.scrollTo({y:0,animated:!reduced});}else onClose();}
  const canSave=loaded&&remaining.every(row=>infos[row.id]?.target.canWrite&&ready[row.id]&&(!infos[row.id].photo||infos[row.id].photo!.readable&&ready['old:'+row.id]));
  return <Modal animationType={reduced?'none':'slide'} onRequestClose={close} accessibilityViewIsModal>
    <SafeAreaView style={{flex:1,backgroundColor:theme.background}}>
      <ScrollView ref={scroll} contentContainerStyle={{padding:18,gap:16,maxWidth:760,width:'100%',alignSelf:'center'}}>
        <Text accessibilityRole="header" style={{color:theme.text,fontSize:23,fontWeight:'800'}}>Hoàn tất ảnh khách hàng</Text>
        <Card style={{gap:10}}><Text style={{color:theme.text,fontSize:19,fontWeight:'700'}}>{customer.details.name} · #{customer.id}</Text>
          <Text style={{color:theme.muted,fontSize:15,lineHeight:23}}>{customer.storeName} · {customer.details.id_card||customer.details.phone}</Text>
          <Text style={{color:theme.muted,fontSize:15,lineHeight:23}}>Hồ sơ khách đã được chọn. Hoàn tất ảnh vào đúng hồ sơ này rồi tiếp tục hợp đồng; không tạo thêm khách.</Text></Card>
        {!!error&&<InlineError message={error}/>}{!!notice&&<Text accessibilityLiveRegion="polite" style={{color:theme.muted,fontSize:15,lineHeight:23}}>{notice}</Text>}
        {loaded&&remaining.some(row=>infos[row.id]?.target.canWrite===false)&&<InlineError message="Hồ sơ này chỉ được xem theo quyền hiện tại; chưa được gắn ảnh vào cơ sở khác. Có thể quay lại để giữ ảnh hoặc chọn bỏ ảnh chưa lưu và dùng hồ sơ đã có."/>}
        {key?<Card style={{gap:12}}>
          <Text style={{color:theme.text,fontSize:18,fontWeight:'700'}}>Ảnh đang chờ đối chiếu</Text>
          {receipt&&<><Text style={{color:theme.text,fontSize:16}}>{receipt.label} · khách #{receipt.id}</Text>
            {receipt.current?<BillPhoto context="giấy tờ" source={api!.recordMediaImageSource(receipt.target,{slot:receipt.slot,label:receipt.label,revision:receipt.photoRevision,mimeType:'image/jpeg',bytes:receipt.bytes,updatedAt:receipt.recordedAt,kind:'image',readable:true,blockedReason:null})} label="Giấy tờ đã lưu" onReady={value=>setReady(old=>({...old,receipt:value}))}/>:<Text style={{color:theme.muted,fontSize:15}}>Ảnh hoặc hồ sơ đã đổi sau lần lưu này. Phiếu gốc được giữ để đối chiếu.</Text>}
            <Button label="Đã kiểm tra phiếu ảnh" disabled={busy||receipt.current&&!ready.receipt} onPress={()=>{void acceptReceipt();}}/></>}
          <Button secondary label="Đối chiếu ảnh với máy chủ" loading={busy} onPress={()=>{void resolve();}}/>
        </Card>:<>
          {documents.photos.map(row=><Card key={row.id} style={{gap:12}}>
            <Text style={{color:theme.text,fontSize:17,fontWeight:'700'}}>{infos[row.id]?.label||row.slot}{row.savedTo===customer.id?' · Đã lưu':''}</Text>
            {infos[row.id]?.photo&&<><Text style={{color:theme.muted,fontSize:15}}>Ảnh mới sẽ thay ảnh hiện có ở mục này.</Text>
              {infos[row.id].photo!.readable?<BillPhoto context="giấy tờ" key={`old:${reviewVersion}:${row.id}`} source={api!.recordMediaImageSource(infos[row.id].target,infos[row.id].photo!)} label={`Ảnh cũ ${row.slot}`} onReady={value=>setReady(old=>({...old,['old:'+row.id]:value}))}/>:<InlineError message="Chưa xem được ảnh cũ. Tải lại để kiểm tra trước khi thay."/>}</>}
            <BillPhoto context="giấy tờ" key={`new:${reviewVersion}:${row.id}`} source={{uri:row.photo.uri}} label={`Ảnh sẽ gắn ${row.slot}`} onReady={value=>setReady(old=>({...old,[row.id]:value}))}/>
          </Card>)}
          <Button secondary label="Tải lại ô ảnh, giữ ảnh đang chọn" disabled={busy} loading={busy} onPress={()=>{void load();}}/>
          <Button secondary label="Bỏ ảnh đang chọn và tiếp tục với hồ sơ" disabled={busy} onPress={()=>setConfirm('discard')}/>
        </>}
      </ScrollView>
      <View style={{padding:16,gap:10,borderTopWidth:1,borderTopColor:theme.border,backgroundColor:theme.surface}}>
        {!key&&<Button label={remaining.length?'Lưu ảnh vào đúng hồ sơ':'Tiếp tục với hồ sơ đã lưu'} loading={busy} disabled={busy||!canSave} onPress={()=>{if(remaining.length)setConfirm('save');else void save();}}/>}
        <Button secondary label="Quay lại biểu mẫu khách" disabled={busy||!!key} onPress={close}/>
      </View>
      {confirm&&<ConfirmEdit title={confirm==='save'?'Lưu ảnh vào hồ sơ này?':'Tiếp tục và bỏ ảnh chưa lưu?'}
        message={confirm==='save'?`Các ảnh đang chọn sẽ gắn vào ${customer.details.name} #${customer.id}. Ảnh mới thay đúng mục đã rà soát; thông tin hợp đồng đang nhập được giữ.`:'Ảnh đã lưu vẫn ở hồ sơ. Phần ảnh chưa lưu sẽ không được tải lên; ảnh gốc trên thiết bị được giữ.'}
        confirmLabel={confirm==='save'?'Xác nhận lưu ảnh':'Bỏ ảnh chưa lưu và tiếp tục'} onCancel={()=>setConfirm(null)}
        onConfirm={()=>{
          if(confirm==='save')void save();
          else{setConfirm(null);docs.current.clear();void onComplete().catch(fail);}
        }}/>
      }
    </SafeAreaView>
  </Modal>;
}
