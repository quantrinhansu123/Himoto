import { useEffect,useRef,useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { router,useLocalSearchParams } from "expo-router";
import { uuid } from "expo";
import { ScrollView,Text } from "react-native";
import { reminderOperation } from "../../../../shared/mobile-debt-reminders";
import { useSession } from "@/providers/session";
import { pendingWrites } from "@/lib/pending-writes";
import { money,useTheme } from "@/theme";
import { FormField } from "@/components/form-fields";
import { Button,Card,InlineError,StateView } from "@/components/ui";
import { ConfirmEdit } from "@/components/editor-sheet";
function Editor({id}:{id:string}) {
  const {api,session}=useSession(),theme=useTheme(),[message,setMessage]=useState<string|null>(null),[busy,setBusy]=useState(false),[attempted,setAttempted]=useState(false),[error,setError]=useState(""),[confirm,setConfirm]=useState(false);
  const running=useRef(false),alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const allowed=session!.user.permissions.includes("contracts.read")&&session!.user.permissions.some(p=>p==="contracts.draft"||p==="finance.write");
  const query=useQuery({queryKey:["reminder-context",session!.user.id,id],queryFn:({signal})=>api!.reminderContext(id,signal),enabled:allowed,retry:false});
  if(!allowed)return <StateView title="Không có quyền gửi nhắc nợ" />;
  if(query.isPending)return <StateView title="Đang lấy công nợ hiện tại" loading />;
  if(query.isError)return <StateView title="Chưa thể soạn nhắc nợ" message={query.error.message} retry={()=>{void query.refetch();}} />;
  const context=query.data,content=message??context.message;
  async function send() {
    if(!api||!session||running.current||attempted||!content.trim())return;running.current=true;setBusy(true);setConfirm(false);setError("");
    const scope={origin:api.origin,userId:session.user.id,storeId:session.user.allStores?null:session.user.storeId,allStores:session.user.allStores},operation=reminderOperation(context.id);
    try{
      const intent=await pendingWrites.reserveExclusive(scope,operation,[operation],()=>uuid.v4().toLowerCase());if(!alive.current)return;
      setAttempted(true);if(!intent.created)throw Error("Còn lần gửi chưa đối chiếu. Mở Tài khoản để kiểm tra mã gốc trước khi tạo lần mới.");
      await api.sendReminder({order_id:context.id,revision:context.revision,amount:context.amount,phone:context.phone,message:content},intent.key);if(!alive.current)return;
      router.replace({pathname:"/reminder-result/[key]",params:{key:intent.key}});
    }catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setBusy(false);}
  }
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,paddingBottom:40,gap:18,maxWidth:760,width:"100%",alignSelf:"center"}}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:26,fontWeight:"800"}}>Soạn nhắc nợ qua Zalo</Text>
    <Card style={{gap:12}}><Text style={{color:theme.text,fontSize:21,fontWeight:"800"}}>{context.code} · {context.customer_name}</Text><Text style={{color:theme.muted}}>{context.store_name}</Text><Text style={{color:theme.text,fontSize:25,fontWeight:"800"}}>{money(context.amount)}</Text><Text selectable style={{color:theme.text}}>Số Zalo: {context.phone}</Text><Text style={{color:theme.muted,lineHeight:23}}>Số điện thoại lấy từ hồ sơ khách của hợp đồng. Cập nhật hồ sơ khách nếu cần đổi số. Hợp đồng thuê sở hữu chỉ nhắc khoản đã đến hạn.</Text></Card>
    <FormField label="Nội dung nhắc nợ Zalo" value={content} onChangeText={setMessage} multiline maxLength={4000} editable={!busy&&!attempted} />
    {!attempted&&<Button secondary label="Dùng nội dung nhắc nợ mẫu" onPress={()=>setMessage(context.message)} />}
    <Text style={{color:theme.muted,lineHeight:23}}>Bấm gửi sẽ chuyển nội dung tới hệ thống gửi Zalo. “Webhook đã tiếp nhận” chưa xác nhận khách đã nhận hoặc đọc tin.</Text>
    {!!error&&<InlineError message={error} />}
    {!attempted&&<Button label="Rà soát và gửi Zalo" loading={busy} disabled={!content.trim()||content.trim().length>4000} onPress={()=>setConfirm(true)} />}
    {attempted&&!busy&&<Button label="Mở Tài khoản để đối chiếu nhắc nợ" onPress={()=>router.push("/(tabs)/account")} />}
    {confirm&&<ConfirmEdit title="Gửi nhắc nợ qua Zalo?" message={`${context.code} · ${context.phone} · ${money(context.amount)}\n\n${content}`} confirmLabel="Xác nhận gửi Zalo" onCancel={()=>setConfirm(false)} onConfirm={()=>{void send();}} />}
  </ScrollView>;
}
export default function Route() {
  const {id}=useLocalSearchParams<{id:string}>(),{api,session}=useSession();if(!api||!session||!/^[1-9]\d{0,14}$/.test(id))return <StateView title="Không mở được hợp đồng nhắc nợ" />;
  return <Editor key={`${id}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} id={id} />;
}
