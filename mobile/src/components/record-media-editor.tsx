import {useEffect,useRef,useState} from 'react';
import {FlatList,Platform,Pressable,ScrollView,Text,type ScrollViewInstance} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router} from 'expo-router';
import * as Linking from 'expo-linking';
import {useQuery} from '@tanstack/react-query';
import {isMobileMediaIdentity,matchesMobileMediaTarget,type MobileMediaEntity,type MobileMediaIdentity,type MobileMediaSlotInfo,type MobileMediaSlot,type MobileRecordMedia,type MobileMediaTargets} from '../../../shared/mobile-record-media';
import {useSession} from '@/providers/session';
import {useRecordMediaWrite} from '@/hooks/use-record-media-write';
import {useReducedMotion} from '@/hooks/use-reduced-motion';
import {selectRecordMediaPhoto,type RecordMediaPhoto} from '@/lib/record-media-photo';
import {dateTime,useTheme} from '@/theme';
import {Button,Card,InlineError,StateView} from './ui';
import {ConfirmEdit,EditorSheet} from './editor-sheet';
import {BillPhoto} from './bill-photo';

export function RecordMediaEditor({entity,id,kind,referenceId}:{entity:string;id:string;kind?:string;referenceId?:string}) {
  const {api,session}=useSession();
  const initial=kind&&referenceId?{entity,id:Number(id),kind,referenceId:Number(referenceId)}:null;
  if(!api||!session||!['contracts','vehicles','customers'].includes(entity)||!/^[1-9]\d{0,14}$/.test(id)||
    initial&&!isMobileMediaIdentity(initial))return <StateView title="Không mở được ảnh hồ sơ" message="Kiểm tra hồ sơ, lượt ghi nhận và quyền truy cập."/>;
  return <MediaForm key={[api.origin,session.token,session.user.storeId,session.user.allStores,entity,id,kind,referenceId].join('|')}
    entity={entity as MobileMediaEntity} id={id} initial={initial as MobileMediaIdentity|null}/>;
}
function MediaForm({entity,id,initial}:{entity:MobileMediaEntity;id:string;initial:MobileMediaIdentity|null}) {
  const {api,session}=useSession(),theme=useTheme(),reduced=useReducedMotion(),scroll=useRef<ScrollViewInstance>(null);
  const [target,setTarget]=useState<MobileMediaIdentity|null>(initial),[targetPage,setTargetPage]=useState(1),[page,setPage]=useState(1),[historyTargets,setHistoryTargets]=useState(false);
  const [slot,setSlot]=useState<string|null>(null),[sheet,setSheet]=useState(false),[review,setReview]=useState<MobileMediaSlotInfo|null>(null),[confirm,setConfirm]=useState(false),[resolving,setResolving]=useState(false);
  const [photo,setPhoto]=useState<RecordMediaPhoto|null>(null),[picking,setPicking]=useState(false),[error,setError]=useState(''),[currentReady,setCurrentReady]=useState<string|null>(null),[selectedReady,setSelectedReady]=useState(false);
  const [imageEpoch,setImageEpoch]=useState(0),[discard,setDiscard]=useState<(()=>void)|null>(null);
  const alive=useRef(true),pickerBusy=useRef(false),controller=useRef<AbortController|null>(null),local=useRef<RecordMediaPhoto|null>(null);
  const [previousGallery,setPreviousGallery]=useState<MobileRecordMedia|undefined>(undefined),[previousTargets,setPreviousTargets]=useState<MobileMediaTargets|undefined>(undefined);
  const write=useRecordMediaWrite(entity,id,!!photo||picking);
  const scope=[session?.user.id,session?.user.storeId,session?.user.allStores];
  const targets=useQuery({queryKey:['record-media','targets',...scope,entity,id,targetPage,historyTargets],queryFn:async({signal})=>{
    const data=await(historyTargets?api!.mediaHistoryTargets(id,targetPage,signal):api!.mediaTargets(entity,id,targetPage,signal));if(alive.current&&!signal.aborted)setPreviousTargets(data);return data;
  },
    enabled:write.checked&&!write.key&&!target,staleTime:0,gcTime:0,refetchOnWindowFocus:false,refetchOnReconnect:false});
  const gallery=useQuery({queryKey:['record-media','gallery',...scope,target?.entity,target?.id,target?.kind,target?.referenceId,page],queryFn:async({signal})=>{
    const data=await api!.recordMedia(target!,page,signal);if(alive.current&&!signal.aborted)setPreviousGallery(data);return data;
  },
    enabled:write.checked&&!write.key&&!!target&&!slot,staleTime:0,gcTime:0,refetchOnWindowFocus:false,refetchOnReconnect:false});
  const info=useQuery({queryKey:['record-media','slot',...scope,target?.entity,target?.id,target?.kind,target?.referenceId,slot],queryFn:({signal})=>api!.mediaSlotInfo(target!,slot!,signal),
    enabled:write.checked&&!write.key&&!!target&&!!slot,staleTime:0,gcTime:0,refetchOnWindowFocus:false,refetchOnReconnect:false});
  const galleryData=gallery.data??(target&&previousGallery&&matchesMobileMediaTarget(previousGallery.target,target)?previousGallery:undefined);
  const targetsData=targets.data??previousTargets;
  const canMutate=entity!=='customers'||(info.data?.target.canWrite??gallery.data?.target.canWrite)===true;
  const canUpload=canMutate&&!/-video-[1-3]$/.test(slot||'');
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();local.current?.dispose();};},[]);
  const top=()=>scroll.current?.scrollTo({y:0,animated:!reduced});
  const locked=write.busy||picking||!write.checked||!!write.key;
  function choose(value:string){
    if(target?.entity==='contracts'&&/-video-[1-3]$/.test(value)){setSheet(false);router.push({pathname:'/record-video/[id]',params:{id,kind:target.kind,referenceId:String(target.referenceId),slot:value}});return;}
    setSlot(value);setSheet(false);setReview(null);setCurrentReady(null);setError('');top();
  }
  function clearPhoto(){local.current?.dispose();local.current=null;setPhoto(null);setSelectedReady(false);}
  function changeSlot(){const change=()=>{clearPhoto();setSlot(null);setReview(null);setError('');top();};if(photo)setDiscard(()=>change);else change();}
  async function pick(camera:boolean){
    if(locked||pickerBusy.current||!canUpload)return;
    pickerBusy.current=true;setPicking(true);setError('');const abort=new AbortController();controller.current=abort;
    try{
      const prepared=await selectRecordMediaPhoto(camera,abort.signal);
      if(!prepared)return;if(!alive.current){prepared.dispose();return;}
      local.current?.dispose();local.current=prepared;setPhoto(prepared);setSelectedReady(false);setReview(null);
    }catch(cause){if(alive.current&&!abort.signal.aborted)setError((cause as Error).message);}
    finally{pickerBusy.current=false;if(alive.current)setPicking(false);}
  }
  const data=info.data;
  const overlays=<>
    {write.exit&&<ConfirmEdit title={write.busy?'Đang lưu ảnh':'Rời ảnh hồ sơ?'} busy={write.busy} message={write.busy?'Chờ máy chủ xác nhận kết quả.':'Ảnh chưa gửi sẽ cần chọn lại. Mã đã gửi vẫn được giữ để đối chiếu.'} confirmLabel="Rời ảnh hồ sơ" onCancel={write.dismissExit} onConfirm={write.leave}/>}
    {discard&&<ConfirmEdit title="Chọn mục ảnh khác?" message="Ảnh đang chọn chưa được lưu. Chọn mục khác sẽ bỏ ảnh này khỏi biểu mẫu." confirmLabel="Bỏ ảnh chưa lưu" onCancel={()=>setDiscard(null)} onConfirm={()=>{const change=discard;setDiscard(null);change();}}/>}
    {resolving&&<ConfirmEdit title="Đối chiếu lưu ảnh?" message="Nếu đã lưu, mở đúng phiếu gốc. Nếu chưa lưu, khóa mã cũ trước khi cho phép lưu ảnh mới." confirmLabel="Đối chiếu với máy chủ" onCancel={()=>setResolving(false)} onConfirm={()=>{setResolving(false);void write.resolve().then(cancelled=>{if(cancelled&&alive.current){setReview(null);top();}});}}/>}
    {confirm&&review&&<ConfirmEdit title={review.photo?'Thay ảnh trong hồ sơ?':'Lưu ảnh vào hồ sơ?'} message={review.target.label+' · '+review.label+'. '+(review.photo?'Ảnh hiện tại tại mục này sẽ được thay bằng ảnh đã rà soát.':'Ảnh được gắn vào đúng lượt ghi nhận đã chọn.')+' Thao tác này không ghi trả/đổi/chuyển xe hoặc tiền.'}
      confirmLabel="Xác nhận lưu ảnh hồ sơ" onCancel={()=>setConfirm(false)} onConfirm={()=>{setConfirm(false);if(photo)void write.submit(review,photo);}}/>}
    {sheet&&galleryData&&<EditorSheet title="Chọn mục ảnh" onClose={()=>setSheet(false)}>
      <FlatList data={galleryData.slots} keyExtractor={row=>row.slot} contentContainerStyle={{padding:18,gap:10}} renderItem={({item}:{item:MobileMediaSlot})=><Pressable accessibilityRole="button" accessibilityLabel={'Chọn mục '+item.label}
        onPress={()=>choose(item.slot)}
        style={({pressed})=>({minHeight:56,padding:16,borderWidth:1,borderColor:theme.border,borderRadius:12,backgroundColor:pressed?theme.background:theme.surface})}>
        <Text style={{color:theme.text,fontSize:17,fontWeight:'600'}}>{item.label}</Text>
        {item.kind==='video'&&<Text style={{color:theme.muted,fontSize:15}}>Xem hoặc lưu video · tối đa 45 MB / 60 giây</Text>}
      </Pressable>}/>
    </EditorSheet>}
  </>;
  const frame=(children:React.ReactNode)=><SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}>
    <ScrollView ref={scroll} contentContainerStyle={{padding:20,gap:18,maxWidth:760,width:'100%',alignSelf:'center'}}>{children}</ScrollView>{overlays}
  </SafeAreaView>;
  if(write.key)return frame(<Card style={{gap:16}}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:'800'}}>Ảnh đang chờ đối chiếu</Text>
    <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>Có yêu cầu lưu ảnh trên hồ sơ này. Đối chiếu phiếu gốc trước khi gửi thêm ảnh ở bất kỳ lượt ghi nhận nào.</Text>
    {!!write.error&&<InlineError message={write.error}/>}
    <Button label="Đối chiếu lưu ảnh với máy chủ" loading={write.busy} onPress={()=>setResolving(true)}/>
    <Button label="Mở phiếu lưu ảnh" secondary disabled={write.busy} onPress={write.openReceipt}/>
  </Card>);
  if(!write.checked)return frame(<Card style={{gap:16}}><Text accessibilityRole="header" style={{color:theme.text,fontSize:23,fontWeight:'700'}}>Kiểm tra ảnh trên thiết bị</Text>
    {!!write.error&&<InlineError message={write.error}/>}<Button label="Đọc lại mã lưu ảnh" loading={write.busy} onPress={()=>{void write.check();}}/></Card>);
  const messages=<>
    {!!(error||write.error)&&<InlineError message={error||write.error}/>}
    {!!write.notice&&<Text accessibilityLiveRegion="polite" style={{color:theme.text,fontSize:16,lineHeight:25}}>{write.notice}</Text>}
  </>;
  if(!target)return frame(<>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:'800'}}>Ảnh và hồ sơ nghiệp vụ</Text>{messages}
    <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>{entity==='customers'?'Mở hồ sơ khách để xem giấy tờ; quyền bổ sung ảnh theo cơ sở quản lý.':'Chọn ảnh lập/giao hợp đồng, biển số từng xe hoặc đúng lượt trả/đổi/chuyển/nhận để xem và bổ sung ảnh.'}</Text>
    {targets.isPending&&<Text style={{color:theme.muted}}>Đang tải hồ sơ ảnh…</Text>}
    {targets.isError&&<InlineError message={targets.error.message}/>}
    {entity==='contracts'&&<><Button secondary label={historyTargets?'Ảnh lập, giao, trả và đổi xe':'Ảnh/video gia hạn, phiếu và đổi pin'} disabled={locked} onPress={()=>{setHistoryTargets(v=>!v);setTargetPage(1);setPreviousTargets(undefined);top();}}/>
      {!historyTargets&&<Button secondary label="Lấy giấy tờ từ hồ sơ khách" disabled={locked} onPress={()=>router.push({pathname:'/customer-photo-copy/[id]',params:{id}})}/>}</>}
    {targetsData?.rows.map(row=><Card key={row.kind+row.referenceId} style={{gap:10}}><Button label={['renewal','renewal_receipt','battery_swap'].includes(row.kind)?row.label:row.label+' · #'+row.referenceId} secondary disabled={locked||targets.isFetching||targets.isError} onPress={()=>{setTarget(row);setPage(1);top();}}/></Card>)}
    {targetsData&&!targetsData.rows.length&&<Text style={{color:theme.muted,fontSize:16}}>Chưa có dòng xe hoặc lượt ghi nhận phù hợp.</Text>}
    {targetsData&&targetsData.page!==targetPage&&<Text style={{color:theme.muted,fontSize:15}}>Đang giữ trang {targetsData.page} trong khi tải trang {targetPage}.</Text>}
    <Text style={{color:theme.muted,fontSize:15}}>Trang hồ sơ {targetPage}</Text>
    <Button label="Trang hồ sơ ảnh trước" secondary disabled={locked||targets.isFetching||targetPage===1} onPress={()=>{setTargetPage(p=>p-1);top();}}/>
    <Button label="Trang hồ sơ ảnh tiếp" secondary disabled={locked||targets.isFetching||targets.isError||!targets.data?.hasMore} onPress={()=>{setTargetPage(p=>p+1);top();}}/>
    <Button label="Tải lại hồ sơ ảnh" secondary loading={targets.isFetching} onPress={()=>{void targets.refetch();}}/>
  </>);
  if(!slot)return frame(<>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:'800'}}>{galleryData?.target.label||'Ảnh của lượt ghi nhận'}</Text>{messages}
    {gallery.isPending&&<Text style={{color:theme.muted}}>Đang tải ảnh đã lưu…</Text>}
    {gallery.isError&&<InlineError message={gallery.error.message}/>}
    <Button label="Chọn mục ảnh hoặc video" disabled={locked||!canUpload||!gallery.data||gallery.isFetching||gallery.isError} onPress={()=>setSheet(true)}/>
    {galleryData?.rows.map(row=><Card key={row.slot} style={{gap:10}}>
      <Text style={{color:theme.text,fontSize:18,fontWeight:'700'}}>{row.label}</Text>
      <Text style={{color:theme.muted,fontSize:15,lineHeight:24}}>{dateTime(row.updatedAt)} · {row.kind==='video'?'Video':row.bytes?Math.ceil(row.bytes/1024)+' KB':'Ảnh đã lưu'}</Text>
      {!!row.blockedReason&&<Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>{row.blockedReason}</Text>}
      <Button secondary label={'Mở mục '+row.label} disabled={locked||gallery.isFetching||gallery.isError} onPress={()=>choose(row.slot)}/>
    </Card>)}
    {galleryData&&!galleryData.rows.length&&<Text style={{color:theme.muted,fontSize:16}}>Chưa có ảnh cho lượt ghi nhận này.</Text>}
    {galleryData&&galleryData.page!==page&&<Text style={{color:theme.muted,fontSize:15}}>Đang giữ trang {galleryData.page} trong khi tải trang {page}.</Text>}
    <Text style={{color:theme.muted,fontSize:15}}>Trang ảnh {page}</Text>
    <Button label="Trang ảnh trước" secondary disabled={locked||gallery.isFetching||page===1} onPress={()=>{setPage(p=>p-1);top();}}/>
    <Button label="Trang ảnh tiếp" secondary disabled={locked||gallery.isFetching||gallery.isError||!gallery.data?.hasMore} onPress={()=>{setPage(p=>p+1);top();}}/>
    <Button label="Tải lại danh sách ảnh" secondary loading={gallery.isFetching} onPress={()=>{void gallery.refetch();}}/>
    <Button label="Chọn lượt ghi nhận khác" secondary disabled={locked} onPress={()=>{setTarget(null);top();}}/>
  </>);
  if(!data)return frame(<>{messages}<Text accessibilityRole="header" style={{color:theme.text,fontSize:24,fontWeight:'700'}}>Đọc ô ảnh đã chọn</Text>
    {info.isError&&<InlineError message={info.error.message}/>}<Button label="Tải lại ô ảnh" loading={info.isFetching} onPress={()=>{void info.refetch();}}/>
    <Button label="Chọn mục ảnh khác" secondary onPress={changeSlot}/></>);
  if(review)return frame(<>
    <Card style={{gap:14}}>
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:24,fontWeight:'800'}}>Rà soát ảnh trước khi lưu</Text>
      <Text style={{color:theme.text,fontSize:19,fontWeight:'700'}}>{review.target.label}</Text>
      <Text style={{color:theme.text,fontSize:17,lineHeight:26}}>{review.label}</Text>
      {photo&&<BillPhoto key={photo.uri} context="hồ sơ" source={{uri:photo.uri}} label="Ảnh hồ sơ sẽ lưu" onReady={setSelectedReady}/>}
      <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>{review.photo?'Ảnh mới sẽ thay ảnh đang lưu trong mục này.':'Bổ sung ảnh mới vào mục đã chọn.'} Không ghi nhận trả xe, đổi xe, điều chuyển hoặc khoản thu/hoàn.</Text>
    </Card>{messages}
    <Button label="Lưu ảnh hồ sơ" disabled={locked||!canUpload||!photo||!selectedReady} loading={write.busy} onPress={()=>setConfirm(true)}/>
    <Button label="Sửa ảnh đã chọn" secondary disabled={locked} onPress={()=>{setReview(null);top();}}/>
  </>);
  return frame(<>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:24,fontWeight:'800'}}>{data.target.label}</Text>{messages}
    <Text style={{color:theme.text,fontSize:19,fontWeight:'700'}}>{data.label}</Text>
    {info.isError&&<InlineError message="Chưa cập nhật được ô ảnh. Ảnh đang chọn được giữ; tải lại trước khi lưu."/>}
    <Card style={{gap:14}}>
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:20,fontWeight:'700'}}>Ảnh hiện tại</Text>
      {data.photo?.readable&&data.photo.kind==='image'?<BillPhoto key={data.photo.revision+':'+imageEpoch} context="hồ sơ" source={api!.recordMediaImageSource(data.target,data.photo)} label="Ảnh hồ sơ hiện tại" onReady={ready=>setCurrentReady(ready?data.photo!.revision:null)}/>:
        <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>{data.photo?.blockedReason||'Ô này chưa có ảnh.'}</Text>}
      {data.photo&&data.nextSlot&&<Button secondary label="Thêm ảnh cùng mục, giữ ảnh hiện tại" disabled={locked||!canUpload||info.isFetching||info.isError} onPress={()=>choose(data.nextSlot!)}/>}
    </Card>
    {data.photo&&canMutate&&<Button secondary label="Xóa tệp khỏi hồ sơ" disabled={locked||!!photo||info.isFetching||info.isError} onPress={()=>router.push({pathname:'/media-delete/[entity]/[id]',params:{entity,id,kind:data.target.kind,referenceId:String(data.target.referenceId),slot:data.slot}})}/>}
    {!canUpload&&<Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>{canMutate?'Video chưa hỗ trợ tải trong ứng dụng. Có thể rà soát thông tin để xóa tệp đã có.':'Anh/chị chỉ được xem giấy tờ của hồ sơ này.'}</Text>}
    {canUpload&&<Card style={{gap:14}}>
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:20,fontWeight:'700'}}>Ảnh sẽ lưu</Text>
      {photo&&<><BillPhoto key={photo.uri} context="hồ sơ" source={{uri:photo.uri}} label="Ảnh hồ sơ đang chọn" onReady={setSelectedReady}/><Text style={{color:theme.muted,fontSize:15}}>{photo.width} × {photo.height} · {Math.ceil(photo.size/1024)} KB</Text></>}
      <Button label="Chọn ảnh hồ sơ" secondary loading={picking} disabled={locked} onPress={()=>{void pick(false);}}/>
      <Button label="Chụp ảnh hồ sơ" secondary disabled={locked||Platform.OS==='web'} onPress={()=>{void pick(true);}}/>
      {!!error&&Platform.OS!=='web'&&<Button label="Mở cài đặt quyền camera" secondary disabled={locked} onPress={()=>{void Linking.openSettings().catch(()=>{if(alive.current)setError('Mở Cài đặt điện thoại để kiểm tra quyền Camera của Himoto.');});}}/>}
    </Card>}
    {canUpload&&<Button label="Rà soát ảnh hồ sơ" disabled={locked||!photo||!selectedReady||info.isFetching||info.isError||!!data.photo&&(!data.photo.readable||currentReady!==data.photo.revision)} onPress={()=>{setSelectedReady(false);setReview(data);top();}}/>}
    <Button label="Tải lại ô ảnh, giữ ảnh đang chọn" secondary loading={info.isFetching} disabled={locked} onPress={()=>{setReview(null);setCurrentReady(null);setImageEpoch(e=>e+1);void info.refetch();}}/>
    <Button label="Chọn mục ảnh khác" secondary disabled={locked} onPress={changeSlot}/>
  </>);
}
