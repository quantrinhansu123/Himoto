import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Platform,Text,View} from 'react-native';
import {uuid} from 'expo';
import {usePreventRemove} from 'expo-router';
import {useSession} from '@/providers/session';
import {pendingWrites} from '@/lib/pending-writes';
import {openPhotoBatchStore} from '@/lib/photo-batch-store';
import {savePhotoBatch,type BatchPhoto,type PhotoBatchAdapter,type PhotoBatchStore} from '@/lib/photo-batch';
import {selectRecordMediaPhotos,type RecordMediaPhoto} from '@/lib/record-media-photo';
import {useTheme} from '@/theme';
import {Button,Card,InlineError} from './ui';
import {BillPhoto} from './bill-photo';
import {ConfirmEdit} from './editor-sheet';

function Preview({row,store}:{row:BatchPhoto;store:PhotoBatchStore}){
  const[photo,setPhoto]=useState<RecordMediaPhoto|null>(null),[error,setError]=useState('');
  useEffect(()=>{let alive=true,held:RecordMediaPhoto|undefined;void store.photo(row).then(value=>{held=value;if(alive)setPhoto(value);else value.dispose();}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;held?.dispose();};},[store,row]);
  return <>{photo&&<BillPhoto source={{uri:photo.uri}} label={`Ảnh ${row.slot}`} context="bộ ảnh"/>}{!!error&&<InlineError message={error}/>}</>;
}
type PhotoBatchProps={adapter:PhotoBatchAdapter;nextSlot:(rows:BatchPhoto[])=>string;onSaved?:()=>void;onTelegram?:()=>void;onPrepared?:(photo:RecordMediaPhoto,index:number)=>Promise<void>;onPendingChange?:(pending:boolean)=>void;onBusyChange?:(busy:boolean)=>void;disabled?:boolean;allowSave?:boolean};
export function PhotoBatch(props:PhotoBatchProps){const{api,session}=useSession();return <PhotoBatchForm key={JSON.stringify([api?.origin,session?.user.id,session?.user.allStores?null:session?.user.storeId,session?.user.allStores,props.adapter.identity])} {...props}/>;}
function PhotoBatchForm({adapter,nextSlot,onSaved,onTelegram,onPrepared,onPendingChange,onBusyChange,disabled=false,allowSave=true}:PhotoBatchProps){
  const{api,session}=useSession(),theme=useTheme(),[store,setStore]=useState<PhotoBatchStore|null>(null),[rows,setRows]=useState<BatchPhoto[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [preview,setPreview]=useState<string|null>(null);
  const[exit,setExit]=useState<(()=>void)|null>(null);
  usePreventRemove(busy,({repeat})=>setExit(()=>repeat));
  const alive=useRef(true),running=useRef(false),abort=useRef<AbortController|null>(null),token=useRef(session?.token);
  const scope=api&&session?{origin:api.origin,userId:session.user.id,storeId:session.user.allStores?null:session.user.storeId,allStores:session.user.allStores}:null;
  const identity=JSON.stringify([scope,adapter.identity]);
  const identityRef=useRef(identity);
  useLayoutEffect(()=>{token.current=session?.token;identityRef.current=identity;},[session?.token,identity]);
  useEffect(()=>{alive.current=true;let cancelled=false;void openPhotoBatchStore(identity).then(async value=>{const saved=await value.list();if(!cancelled){setStore(value);setRows(saved);}}).catch(e=>{if(!cancelled)setError(e.message);});return()=>{cancelled=true;alive.current=false;abort.current?.abort();};},[identity]);
  const refresh=async()=>{if(!store)return;const items=await store.list();if(alive.current&&identityRef.current===identity)setRows(items);};
  async function pick(camera:boolean){
    if(!store||running.current||disabled)return;running.current=true;setBusy(true);setError('');const at=token.current;abort.current=new AbortController();
    let first:BatchPhoto|undefined;
    try{await selectRecordMediaPhotos(camera,abort.current.signal,async(photo,index,total)=>{
      try{if(!alive.current||token.current!==at||identityRef.current!==identity)return;const existing=await store.list();const row:BatchPhoto={id:uuid.v4().toLowerCase(),slot:nextSlot(existing),width:photo.width,height:photo.height,size:photo.size,key:uuid.v4().toLowerCase(),attempt:null,state:'queued',error:''};await store.add(row,photo);first??=row;await refresh();if(alive.current&&identityRef.current===identity)setNotice(`Đã giữ ảnh ${index+1}/${total}. Chờ chuẩn bị xong cả bộ để rời màn hình.`);}finally{photo.dispose();}
    });}catch(e){if(alive.current)setError((e as Error).message);}finally{
      // OCR runs only after the whole album is durable; it never delays holding the remaining files.
      running.current=false;if(alive.current)setBusy(false);
      if(first&&onPrepared&&alive.current&&token.current===at&&identityRef.current===identity){const firstPhoto=first;void(async()=>{let held:RecordMediaPhoto|undefined;try{held=await store.photo(firstPhoto);if(alive.current&&token.current===at&&identityRef.current===identity)await onPrepared(held,0);}catch(e){if(alive.current&&identityRef.current===identity)setError((e as Error).message);}finally{held?.dispose();}})();}
    }
  }
  async function save(){
    if(!store||!scope||running.current||disabled||!allowSave)return;running.current=true;setBusy(true);setError('');const at=token.current;
    try{
      // Finish acknowledgements left by an app/process interruption after receipt persistence.
      for(const row of await store.list())if(row.state==='saved')await pendingWrites.complete(scope,adapter.operation,row.key);
      await savePhotoBatch(store,adapter,{
        current:()=>alive.current&&token.current===at&&identityRef.current===identity,
        reserve:async key=>{const result=await pendingWrites.reserveExclusive(scope,adapter.operation,adapter.conflicts,()=>key);if(result.operation!==adapter.operation||result.key!==key)throw Error('Còn yêu cầu khác trên hồ sơ. Đối chiếu mã gốc trong Tài khoản trước khi lưu bộ ảnh.');},
        complete:key=>pendingWrites.complete(scope,adapter.operation,key),
      },refresh);
      if(alive.current&&token.current===at&&identityRef.current===identity){setNotice('Đã lưu toàn bộ ảnh vào đúng hồ sơ.');onSaved?.();}
    }catch(e){if(alive.current)setError((e as Error).message);}finally{running.current=false;if(alive.current)setBusy(false);}
  }
  async function reconcile(row:BatchPhoto){
    if(!api||!scope||!store||running.current||!allowSave)return;running.current=true;setBusy(true);setError('');const at=token.current;
    try{const result=await api.resolveWrite(row.key,adapter.operation);if(!alive.current||token.current!==at||identityRef.current!==identity)return;
      if(result.status==='committed'){row.state='saved';row.error='';await store.update(row);await pendingWrites.complete(scope,adapter.operation,row.key);onSaved?.();}
      else{await pendingWrites.complete(scope,adapter.operation,row.key);row.key=uuid.v4().toLowerCase();row.attempt=null;row.error='';await store.update(row);}
      await refresh();setNotice(result.status==='committed'?'Máy chủ xác nhận ảnh đã lưu. Không tải lại ảnh này.':'Máy chủ xác nhận ảnh chưa lưu và đã khóa mã cũ. Thử lưu tiếp để cập nhật đúng hồ sơ.');
    }catch(e){if(alive.current&&identityRef.current===identity)setError((e as Error).message);}finally{running.current=false;if(alive.current&&identityRef.current===identity)setBusy(false);}
  }
  const pending=rows.filter(r=>r.state!=='saved'),saved=rows.length-pending.length;
  useEffect(()=>{onPendingChange?.(!store||busy||pending.length>0);},[store,busy,pending.length,onPendingChange]);
  useEffect(()=>{onBusyChange?.(busy);},[busy,onBusyChange]);
  return <Card style={{gap:14}}><Text accessibilityRole="header" style={{color:theme.text,fontSize:20,fontWeight:'700'}}>{adapter.label}</Text>
    {exit&&<ConfirmEdit title="Đang xử lý bộ ảnh" message="Chờ giữ ảnh và xác nhận yêu cầu đang chạy. Bộ ảnh đã giữ có thể mở lại; việc thử tiếp không ghi lại nghiệp vụ." busy={busy} confirmLabel="Tiếp tục quay lại" onCancel={()=>setExit(null)} onConfirm={()=>{const repeat=exit;setExit(null);repeat();}}/>}
    <Text accessibilityLiveRegion="polite" style={{color:theme.muted,lineHeight:24}}>Đã lưu {saved}/{rows.length} ảnh · Còn {pending.length}. Ảnh đã lưu sẽ không tải lại khi thử tiếp.</Text>
    {!!notice&&<Text accessibilityLiveRegion="polite" style={{color:theme.text,lineHeight:24}}>{notice}</Text>}{!!error&&<InlineError message={error}/>}
    <Button secondary label="Chọn nhiều ảnh" disabled={!store||busy||disabled} loading={busy} onPress={()=>{void pick(false);}}/>
    <Button secondary label="Chụp thêm ảnh" disabled={!store||busy||disabled||Platform.OS==='web'} onPress={()=>{void pick(true);}}/>
    {store&&rows.map((row,index)=><View key={row.id} style={{gap:10,paddingVertical:8}}><Text style={{color:theme.text,fontWeight:'700'}}>Ảnh {index+1} · {row.state==='saved'?'Đã lưu':row.error?'Cần thử lại':'Chờ lưu'}</Text><Button secondary label={`${preview===row.id?'Thu gọn':'Xem'} ảnh ${index+1}`} onPress={()=>setPreview(preview===row.id?null:row.id)}/>{preview===row.id&&<Preview row={row} store={store}/>}{!!row.error&&<InlineError message={row.error}/>}{row.state==='queued'&&row.attempt!==null&&<Button secondary label={`Đối chiếu ảnh ${index+1} với máy chủ`} disabled={busy} onPress={()=>{void reconcile(row);}}/>}{row.state==='queued'&&row.attempt===null&&<Button secondary label={`Bỏ ảnh ${index+1} chưa gửi`} disabled={busy} onPress={()=>{void store.remove(row.id).then(refresh).catch(e=>setError(e.message));}}/>}</View>)}
    {!allowSave&&<Text style={{color:theme.muted,lineHeight:24}}>Ảnh được giữ trên máy. Lưu thông tin nghiệp vụ trước để gắn bộ ảnh vào đúng hồ sơ vừa tạo.</Text>}
    <Button label={pending.some(r=>r.error)?'Thử lưu tiếp phần ảnh lỗi':'Lưu bộ ảnh vào hồ sơ'} disabled={!store||busy||disabled||!allowSave||!pending.length} loading={busy} onPress={()=>{void save();}}/>
    {onTelegram&&<Button label="Gửi toàn bộ ảnh qua Telegram" disabled={!store||busy||disabled||pending.length>0} onPress={onTelegram}/>}
    {store&&saved>0&&!pending.length&&<Button secondary label="Hoàn tất bộ ảnh đã lưu" disabled={busy||disabled||!allowSave} onPress={()=>{void (async()=>{if(disabled||!allowSave)return;for(const row of await store.list())if(row.state==='saved'){if(scope)await pendingWrites.complete(scope,adapter.operation,row.key);await store.remove(row.id);}setPreview(null);await refresh();})().catch(e=>setError(e.message));}}/>}
  </Card>;
}
