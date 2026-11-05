import { useEffect, useRef, useState } from "react";
import { Platform, ScrollView, Text, View, type ScrollViewInstance } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/providers/session";
import { useBillWrite } from "@/hooks/use-bill-write";
import { preparePhoto, type PreparedPhoto } from "@/lib/prepare-photo";
import { useTheme } from "@/theme";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { Button, Card, InlineError, StateView } from "./ui";
import { ConfirmEdit } from "./editor-sheet";
import { BillPhoto } from "./bill-photo";

type BillScreenProps={id:string;backfill?:boolean;returnToRenewal?:boolean;collection?:boolean;collectionVersion?:string;returnToCollection?:boolean};
export function RenewalBillScreen({id,returnToRenewal=false,collection=false,collectionVersion,returnToCollection=false,backfill=false}:BillScreenProps) {
  const {session}=useSession();
  if(!/^[1-9]\d{0,14}$/.test(id)||!session?.user.permissions.includes("contracts.read")||!session.user.permissions.includes(collection?"finance.write":"contracts.renew"))
    return <StateView title="Không mở được bill gia hạn" message={collection?"Tài khoản cần quyền ghi thu/chi để chuẩn bị bill khoản thu.":"Tài khoản cần quyền gia hạn để chuẩn bị và xem bill."}/>;
  return <BillForm key={`${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}:${id}:${collection}:${collectionVersion??"recover"}:${backfill}`} id={id} returnToRenewal={returnToRenewal} collection={collection} collectionVersion={collectionVersion} returnToCollection={returnToCollection} backfill={backfill}/>;
}
function BillForm({id,returnToRenewal,collection=false,collectionVersion,returnToCollection=false,backfill=false}:BillScreenProps) {
  const {api,session}=useSession(),theme=useTheme();
  const [photo,setPhoto]=useState<PreparedPhoto|null>(null),[picking,setPicking]=useState(false),[localError,setLocalError]=useState("");
  const [review,setReview]=useState<{version:number;revision:string;expected:string|null}|null>(null),[resolving,setResolving]=useState(false),[imageEpoch,setImageEpoch]=useState(0);
  const [receiptImageReady,setReceiptImageReady]=useState(false);
  const [selectedPhotoReady,setSelectedPhotoReady]=useState(false),[cameraDenied,setCameraDenied]=useState(false);
  const localPhoto=useRef<PreparedPhoto|null>(null),alive=useRef(true),pickerBusy=useRef(false),abort=useRef<AbortController|null>(null);
  const form=useRef<ScrollViewInstance>(null),reducedMotion=useReducedMotion();
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;abort.current?.abort();localPhoto.current?.dispose();};},[]);
  const action=useBillWrite(id,!!photo||picking,returnToRenewal,collection,returnToCollection,backfill);
  useEffect(()=>{
    if(!localError&&!action.error&&!action.key)return;
    const frame=requestAnimationFrame(()=>form.current?.scrollTo({y:0,animated:!reducedMotion}));
    return()=>cancelAnimationFrame(frame);
  },[localError,action.error,action.key,reducedMotion]);
  const targetVersion=collectionVersion&&/^[1-9]\d{0,14}$/.test(collectionVersion)&&Number(collectionVersion)>=2?Number(collectionVersion):null;
  const preparation=useQuery({queryKey:[collection?"collection-bill-preparation":"renewal-preparation",session?.user.id,session?.user.storeId,session?.user.allStores,id,targetVersion,backfill],queryFn:async({signal})=>{
    if(!collection)return api!.renewalPreparation(id,1,"",signal,backfill);
    const context=await api!.renewalCollection(id,targetVersion!,signal);
    return{code:context.code,revision:context.revision,available:context.canWrite&&context.available,blockedReason:context.blockedReason,nextVersion:context.period.version,evidence:{present:false}};
  },enabled:!!api&&(!collection||targetVersion!==null)&&!action.receipt,staleTime:0,gcTime:0,refetchOnWindowFocus:false});
  const data=preparation.data;
  const info=useQuery({queryKey:[collection?"renewal-collection-bill":"renewal-bill",session?.user.id,session?.user.storeId,session?.user.allStores,id,data?.nextVersion],queryFn:({signal})=>(collection?api!.collectionBill:api!.renewalBill)(id,data!.nextVersion,signal),enabled:!!api&&!!data&&!action.receipt,staleTime:0,gcTime:0,refetchOnWindowFocus:false});
  const locked=!action.checked||action.busy||action.checking||!!action.key||picking;
  const source=(version:number,revision:string)=>({uri:`${api!.origin}/api/mobile/v1/contracts/${encodeURIComponent(id)}/renewals/${version}/${collection?"collection/":""}bill?revision=${encodeURIComponent(revision)}`,headers:{Authorization:`Bearer ${session!.token}`}});
  async function pick(camera:boolean){
    if(locked||pickerBusy.current)return;
    pickerBusy.current=true;setPicking(true);setLocalError("");const controller=new AbortController();abort.current=controller;
    try{
      if(camera){const permission=await ImagePicker.requestCameraPermissionsAsync();if(!alive.current)return;
        setCameraDenied(!permission.granted);
        if(!permission.granted)throw Error("Chưa được cấp quyền camera. Có thể chọn ảnh đã có hoặc cấp quyền camera trong Cài đặt điện thoại.");}
      const options:ImagePicker.ImagePickerOptions={mediaTypes:["images"],allowsEditing:false,allowsMultipleSelection:false,quality:1,exif:false,base64:false};
      const selected=await(camera?ImagePicker.launchCameraAsync(options):ImagePicker.launchImageLibraryAsync(options));
      if(!alive.current||selected.canceled)return;
      const asset=selected.assets[0];if(!asset?.uri)throw Error("Chưa chọn được ảnh bill.");
      const prepared=await preparePhoto(asset.uri,controller.signal);
      if(!alive.current){prepared.dispose();return;}
      localPhoto.current?.dispose();localPhoto.current=prepared;setSelectedPhotoReady(false);setPhoto(prepared);
    }catch(cause){if(alive.current&&!controller.signal.aborted)setLocalError((cause as Error).message);}
    finally{pickerBusy.current=false;if(alive.current)setPicking(false);}
  }
  async function refresh(){setLocalError("");await preparation.refetch();await info.refetch();if(alive.current)setImageEpoch(value=>value+1);}
  const recoverySheets=<>
    {resolving&&<ConfirmEdit title="Đối chiếu yêu cầu lưu bill?" message="Nếu đã lưu, ứng dụng mở đúng kết quả đã nhận. Nếu chưa lưu, máy chủ khóa mã cũ trước khi cho phép gửi ảnh khác. Ảnh đang chọn được giữ khi đối chiếu." confirmLabel="Đối chiếu bill với máy chủ" onCancel={()=>setResolving(false)} onConfirm={()=>{setResolving(false);void action.resolve();}}/>}
    {action.exit&&<ConfirmEdit title={action.busy?"Đang lưu bill":"Rời bước chuẩn bị bill?"} busy={action.busy} message={action.busy?"Chờ máy chủ xác nhận kết quả.":"Ảnh chưa gửi sẽ cần chọn lại. Mã lần lưu đã gửi được giữ trên thiết bị để đối chiếu sau khi mở lại."} confirmLabel="Rời bước bill" onCancel={action.dismissExit} onConfirm={action.leave}/>}
  </>;
  if(action.receipt)return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:theme.background}}>
    <ScrollView contentContainerStyle={{padding:20,gap:18,maxWidth:760,width:"100%",alignSelf:"center"}}>
      <Card style={{gap:16}}>
        <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:"800"}}>Bill đã được lưu</Text>
        <Text style={{color:theme.text,fontSize:18}}>Phiên bản gia hạn #{action.receipt.version}</Text>
        {action.receipt.current?<BillPhoto key={`${action.receipt.photoRevision}:${imageEpoch}`} source={source(action.receipt.version,action.receipt.photoRevision)} label="Bill đã lưu trên máy chủ" onReady={setReceiptImageReady}/>:
          <InlineError message="Ảnh tại vị trí này đã được thay đổi sau lần lưu. Kết quả lần lưu vẫn được giữ; rà soát ảnh hiện tại trong hồ sơ trước khi thao tác tiếp."/>}
        <Text style={{color:theme.muted,fontSize:15,lineHeight:24}}>{collection?"Ảnh bill đã gắn đúng kỳ đã lưu. Quay lại rà soát số tiền và xác nhận khoản thực thu; lưu ảnh chưa ghi tiền.":"Ảnh bill được gắn vào hồ sơ để rà soát khi gia hạn. Ngày hẹn trả và khoản thu được xử lý ở bước gia hạn."}</Text>
        {!!action.error&&<InlineError message={action.error}/>}
        {action.receipt.current&&<Button secondary label="Tải lại ảnh bill đã lưu" disabled={action.checking} onPress={()=>{setReceiptImageReady(false);setImageEpoch(value=>value+1);}}/>}
        <Button label="Xác nhận đã kiểm tra bill" loading={action.checking} disabled={action.receipt.current&&!receiptImageReady} onPress={()=>{void action.acknowledge();}}/>
      </Card>
    </ScrollView>
  </SafeAreaView>;
  if(!data&&action.key)return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:theme.background}}><View style={{padding:20,gap:18}}><Card style={{gap:16}}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:24,fontWeight:"800"}}>Bill đang chờ đối chiếu</Text>
    <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>Giữ mã để mở đúng ảnh đã lưu trước khi chọn hoặc gửi ảnh khác.</Text>
    {!!action.error&&<InlineError message={action.error}/>}
    <Button label="Đối chiếu yêu cầu lưu bill" loading={action.busy||action.checking} onPress={()=>setResolving(true)}/>
  </Card></View>{recoverySheets}</SafeAreaView>;
  if(!data&&(!action.checked||preparation.isPending&&(!collection||targetVersion!==null)))return <StateView title="Đang tải phiên bản gia hạn" loading/>;
  if(!data&&collection&&targetVersion===null)return <StateView title="Chưa chọn kỳ của bill" message={action.error||"Mở kỳ gia hạn đã lưu để chọn bill khoản thu."}/>;
  if(!data)return <StateView title="Chưa tải được bill gia hạn" message={preparation.error?.message||action.error} retry={()=>{void preparation.refetch();}}/>;
  return <SafeAreaView edges={["left","right","bottom"]} style={{flex:1,backgroundColor:theme.background}}>
    <ScrollView ref={form} contentContainerStyle={{padding:20,gap:18,maxWidth:760,width:"100%",alignSelf:"center"}}>
      <View style={{gap:8}}>
        <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:"800"}}>{data.code}</Text>
        <Text style={{color:theme.muted,fontSize:16}}>Chuẩn bị bill · phiên bản gia hạn #{data.nextVersion}</Text>
      </View>
      {!!(localError||action.error)&&<InlineError message={localError||action.error}/>}
      {!!action.notice&&<Text accessibilityLiveRegion="polite" style={{color:theme.text,fontSize:15,lineHeight:24}}>{action.notice}</Text>}
      {preparation.isError&&<InlineError message="Chưa cập nhật được hợp đồng. Ảnh đang chọn được giữ; tải lại số liệu trước khi lưu."/>}
      {!data.available&&<InlineError message={data.blockedReason||"Hợp đồng chưa thể gia hạn."}/>}
      <Card style={{gap:14}}>
        <Text accessibilityRole="header" style={{color:theme.text,fontSize:18,fontWeight:"700"}}>Bill hiện tại</Text>
        {info.isPending?<Text style={{color:theme.muted}}>Đang kiểm tra ảnh đã lưu…</Text>:info.isError?<InlineError message={info.error.message}/>:
          info.data?.photoRevision?<BillPhoto key={`${info.data.photoRevision}:${imageEpoch}`} source={source(data.nextVersion,info.data.photoRevision)} label="Bill chính hiện tại"/>:
            <Text style={{color:theme.muted,fontSize:15,lineHeight:24}}>{data.evidence.present?"Phiên bản này có ảnh chứng từ khác. Có thể bổ sung bill chính sau khi rà soát hồ sơ.":"Chưa có bill chính cho phiên bản này."}</Text>}
      </Card>
      <View onLayout={event=>{if(photo)form.current?.scrollTo({y:event.nativeEvent.layout.y,animated:!reducedMotion});}}><Card style={{gap:14}}>
        <Text accessibilityRole="header" style={{color:theme.text,fontSize:18,fontWeight:"700"}}>Ảnh bill sẽ lưu</Text>
        <Text style={{color:theme.muted,fontSize:15,lineHeight:24}}>Chọn ảnh rõ số tiền, thời gian và tài khoản giao dịch. Mở ảnh lớn để kiểm tra trước khi lưu.</Text>
        {photo&&<><BillPhoto key={photo.uri} source={{uri:photo.uri}} label="Ảnh bill đang chọn" onReady={setSelectedPhotoReady}/><Text style={{color:theme.muted,fontSize:15}}>{photo.width} × {photo.height} · {Math.ceil(photo.size/1024)} KB</Text></>}
        {Platform.OS==="web"&&<Text style={{color:theme.muted,fontSize:15}}>Chọn hoặc chụp ảnh bill trên điện thoại.</Text>}
        <Button secondary label="Chọn ảnh bill" loading={picking} disabled={locked||!data.available||Platform.OS==="web"} onPress={()=>{void pick(false);}}/>
        <Button secondary label="Chụp ảnh bill" disabled={locked||!data.available||Platform.OS==="web"} onPress={()=>{void pick(true);}}/>
        {cameraDenied&&<Button secondary label="Mở cài đặt quyền camera" disabled={locked} onPress={()=>{void Linking.openSettings().catch(()=>{if(alive.current)setLocalError("Chưa mở được Cài đặt. Mở Cài đặt điện thoại và chọn quyền Camera của Himoto.");});}}/>}
      </Card></View>
      <Button secondary label="Tải lại số liệu bill" loading={preparation.isFetching||info.isFetching} disabled={action.busy||action.checking||picking} onPress={()=>{void refresh();}}/>
    </ScrollView>
    <View style={{padding:16,borderTopWidth:1,borderColor:theme.border,backgroundColor:theme.surface}}>
      <View style={{maxWidth:724,width:"100%",alignSelf:"center"}}>
        {action.key?<Button label={action.busy?"Đang lưu bill":"Đối chiếu yêu cầu lưu bill"} loading={action.busy||action.checking} onPress={()=>setResolving(true)}/>:
          <Button label="Lưu ảnh bill" disabled={locked||!photo||!selectedPhotoReady||!data.available||!info.data||info.isError||info.isFetching||preparation.isError||preparation.isFetching}
            onPress={()=>{if(!locked&&!pickerBusy.current&&photo&&selectedPhotoReady&&info.data)setReview({version:data.nextVersion,revision:data.revision,expected:info.data.photoRevision});}}/>}
      </View>
    </View>
    {review&&<ConfirmEdit title={review.expected?"Thay ảnh bill chính?":"Lưu ảnh bill?"} message={`Gắn ảnh đã kiểm tra vào ${data.code}, phiên bản gia hạn #${review.version}.${review.expected?" Ảnh bill chính hiện tại sẽ được thay thế. Xác nhận ảnh mới rõ và đúng giao dịch.":collection?" Ảnh sẽ được rà soát ở bước xác nhận khoản thu của kỳ đã lưu.":" Ảnh sẽ được lưu vào hồ sơ để rà soát trước khi lưu gia hạn."}`}
      confirmLabel="Xác nhận lưu bill" onCancel={()=>setReview(null)} onConfirm={()=>{const input=review;setReview(null);if(photo)void action.submit(photo,input.version,input.revision,input.expected);}}/>}
    {recoverySheets}
  </SafeAreaView>;
}
