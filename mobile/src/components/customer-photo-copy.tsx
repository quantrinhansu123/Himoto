import {useEffect,useRef} from 'react';
import {Modal,ScrollView,Text,View} from 'react-native';
import {router} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {DraftWorkController} from '@/lib/draft-work-controller';
import {useCustomerPhotoCopy} from '@/hooks/use-customer-photo-copy';
import {useSession} from '@/providers/session';
import {dateTime,useTheme} from '@/theme';
import {Button,Card,InlineError,StateView} from './ui';

export function CustomerPhotoCopy({id,expectedRevision,autoStart=false,onComplete,onClose,onCloseAvailabilityChange,work=null}:{work?:DraftWorkController|null;id:number;expectedRevision?:string;autoStart?:boolean;onComplete:()=>Promise<void>;onClose?:()=>void;onCloseAvailabilityChange?:(allowed:boolean)=>void}){
  const theme=useTheme(),copy=useCustomerPhotoCopy(id,{expectedRevision,onComplete,autoFinish:autoStart,work}),started=useRef(false);
  useEffect(()=>{if(autoStart&&copy.checked&&!copy.busy&&!copy.key&&!copy.receipt&&!started.current){started.current=true;void copy.save();}},[autoStart,copy]);
  useEffect(()=>{onCloseAvailabilityChange?.(!copy.busy&&!copy.key);},[onCloseAvailabilityChange,copy.busy,copy.key]);
  return <SafeAreaView style={{flex:1,backgroundColor:theme.background}}>
    <ScrollView contentContainerStyle={{padding:18,gap:16,maxWidth:760,width:'100%',alignSelf:'center'}}>
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:24,fontWeight:'800'}}>Giấy tờ khách trên hợp đồng</Text>
      <Card style={{gap:10}}><Text style={{color:theme.text,fontSize:18,fontWeight:'700'}}>Hợp đồng #{id}</Text>
        <Text style={{color:theme.muted,fontSize:15,lineHeight:23}}>Bổ sung giấy tờ từ hồ sơ khách vào các mục còn thiếu. Ảnh hợp đồng đã có được giữ; sửa ảnh khách sau này không đổi bản đã sao chép.</Text>
        {autoStart&&<Text style={{color:theme.muted,fontSize:15,lineHeight:23}}>Thông tin hợp đồng và ảnh đã lưu được giữ. Bước này không tạo thêm bản nháp.</Text>}</Card>
      {!!copy.error&&<InlineError message={copy.error}/>}{!!copy.notice&&<Text accessibilityLiveRegion="polite" style={{color:theme.text,fontSize:15,lineHeight:23}}>{copy.notice}</Text>}
      {copy.busy&&<Text accessibilityLiveRegion="polite" style={{color:theme.muted}}>Đang kiểm tra giấy tờ…</Text>}
      {copy.receipt?<Card style={{gap:12}}>
        <Text accessibilityRole="header" style={{color:theme.text,fontSize:18,fontWeight:'700'}}>Phiếu lấy giấy tờ đã ghi</Text>
        <Text style={{color:theme.text,fontSize:16}}>Đã bổ sung {copy.receipt.copied} ảnh · Đã có {copy.receipt.presentCount} ảnh</Text>
        <Text style={{color:theme.muted,fontSize:15}}>{copy.receipt.customerId===null?'Hợp đồng chưa gắn khách':`Khách #${copy.receipt.customerId}`} · {copy.receipt.actorName} · {dateTime(copy.receipt.recordedAt)}</Text>
        {!copy.receipt.current&&<Text style={{color:theme.warning,fontSize:15,lineHeight:23}}>Hợp đồng hoặc giấy tờ đã thay đổi sau lần lấy này. Phiếu gốc được giữ để đối chiếu; mở lại ảnh hiện tại trước khi bổ sung tiếp.</Text>}
        <Button label="Đã kiểm tra kết quả lấy giấy tờ" disabled={copy.busy} onPress={()=>void copy.acknowledge()}/>
      </Card>:copy.key?<Button label="Đối chiếu lấy giấy tờ với máy chủ" loading={copy.busy} onPress={()=>void copy.resolve()}/>:<>
        {copy.review&&<Card style={{gap:10}}><Text style={{color:theme.text,fontSize:16}}>{copy.review.customerId===null?'Chưa có khách trên hợp đồng':`Khách #${copy.review.customerId}`}</Text>
          <Text style={{color:theme.muted,fontSize:15}}>Giấy tờ nguồn: {copy.review.sourceCount} · Đã có: {copy.review.presentCount} · Còn thiếu: {copy.review.missingCount}</Text></Card>}
        <Button label="Lấy giấy tờ vào hợp đồng" disabled={copy.busy||!copy.checked} loading={copy.busy} onPress={()=>void copy.save()}/>
      </>}
      <Button secondary label="Tải lại kết quả lấy giấy tờ" disabled={copy.busy} onPress={()=>void copy.load()}/>
      {!autoStart&&<Button secondary label="Xem ảnh hợp đồng hiện tại" disabled={copy.busy||!!copy.key} onPress={()=>router.push({pathname:'/record-media/[entity]/[id]',params:{entity:'contracts',id:String(id)}})}/>}
    </ScrollView>
    {onClose&&<View style={{padding:16,borderTopWidth:1,borderTopColor:theme.border}}><Button secondary label="Quay lại hợp đồng đã lưu" disabled={copy.busy||!!copy.key} onPress={onClose}/></View>}
  </SafeAreaView>;
}
export function CustomerPhotoCopyScreen({id}:{id:string}){
  const {api,session}=useSession();
  if(!api||!session||!/^[1-9]\d{0,14}$/.test(id))return <StateView title="Không mở được giấy tờ hợp đồng" message="Kiểm tra phiên và hợp đồng hiện tại."/>;
  return <CustomerPhotoCopy key={[api.origin,session.token,id,session.user.storeId,session.user.allStores].join('|')} id={Number(id)} onComplete={async()=>router.back()}/>;
}
export function CustomerPhotoCopyStage({id,revision,onComplete,onClose,work=null}:{work?:DraftWorkController|null;id:number;revision:string;onComplete:()=>Promise<void>;onClose:()=>void}){
  const canClose=useRef(false);
  return <Modal animationType="none" accessibilityViewIsModal onRequestClose={()=>{if(canClose.current)onClose();}}>
    <CustomerPhotoCopy id={id} work={work} expectedRevision={revision} autoStart onComplete={onComplete} onClose={onClose} onCloseAvailabilityChange={allowed=>{canClose.current=allowed;}}/>
  </Modal>;
}
