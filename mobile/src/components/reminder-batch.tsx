import { useEffect,useRef,useState } from "react";
import { ScrollView,Text,View } from "react-native";
import { uuid } from "expo";
import { router } from "expo-router";
import { REMINDER_STATUS_LABELS,reminderOperation,reminderResultMessage,type DebtReminderContext,type ReminderStatus } from "../../../shared/mobile-debt-reminders";
import { useSession } from "@/providers/session";
import { pendingWrites } from "@/lib/pending-writes";
import { money,useTheme } from "@/theme";
import { Button,Card,InlineError } from "./ui";
import { ConfirmEdit,EditorSheet } from "./editor-sheet";
type Item={id:number;context?:DebtReminderContext;error?:string;status?:ReminderStatus;key?:string};
export function ReminderBatch({ids,onClose,onSent}:{ids:number[];onClose:()=>void;onSent:()=>void}) {
  const {api,session}=useSession(),theme=useTheme(),[items,setItems]=useState<Item[]>(()=>ids.map(id=>({id}))),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[done,setDone]=useState(false),[confirm,setConfirm]=useState(false),[error,setError]=useState("");const running=useRef(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;const controller=new AbortController();void Promise.all(ids.map(async id=>{try{const context=await api!.reminderContext(String(id),controller.signal);if(alive.current)setItems(previous=>previous.map(row=>row.id===id?{id,context}:row));}catch(cause){if(alive.current)setItems(previous=>previous.map(row=>row.id===id?{id,error:(cause as Error).message}:row));}})).finally(()=>{if(alive.current)setLoading(false);});return()=>{alive.current=false;controller.abort();};},[api,ids]);
  const ready=items.filter((row):row is Item&{context:DebtReminderContext}=>!!row.context&&!row.key);
  async function sendAll() {
    if(!api||!session||running.current||loading||done||!ready.length)return;running.current=true;setBusy(true);setConfirm(false);setError("");
    const scope={origin:api.origin,userId:session.user.id,storeId:session.user.allStores?null:session.user.storeId,allStores:session.user.allStores};
    try{
      for(const item of ready){
        if(!alive.current)return;const c=item.context,operation=reminderOperation(c.id),intent=await pendingWrites.reserveExclusive(scope,operation,[operation],()=>uuid.v4().toLowerCase());if(!alive.current)return;
        setItems(previous=>previous.map(row=>row.id===item.id?{...row,key:intent.key}:row));
        try {
          if(!intent.created)throw Error(`${c.code}: còn lần gửi chưa đối chiếu. Mở Tài khoản để kiểm tra mã gốc.`);
          await api.sendReminder({order_id:c.id,revision:c.revision,amount:c.amount,phone:c.phone,message:c.message},intent.key);if(!alive.current)return;
          const proof=await api.reminderResult(intent.key);if(!alive.current)return;
          if(proof.receipt.order_id!==c.id||proof.receipt.amount!==c.amount||proof.receipt.phone!==c.phone||proof.receipt.message!==c.message.trim())throw Error(`${c.code}: lịch sử chưa khớp lần gửi. Giữ mã để đối chiếu.`);
          setItems(previous=>previous.map(row=>row.id===item.id?{...row,status:proof.receipt.status}:row));onSent();
          // Each contract is independent, as on web. Keep uncertain keys for
          // explicit recovery while continuing the other authorized contracts.
          if(proof.receipt.status==="accepted"||proof.receipt.status==="failed")await pendingWrites.complete(scope,operation,intent.key);
        } catch(cause) {if(!alive.current)return;setItems(previous=>previous.map(row=>row.id===item.id?{...row,error:(cause as Error).message}:row));}
      }
      if(alive.current)setDone(true);
    }catch(cause){if(alive.current){setError((cause as Error).message);setDone(true);}}finally{running.current=false;if(alive.current)setBusy(false);}
  }
  return <EditorSheet title="Rà soát nhắc nợ hàng loạt" onClose={()=>{if(!busy)onClose();}}><ScrollView contentContainerStyle={{padding:20,paddingBottom:40,gap:16}}>
    <Text style={{color:theme.muted,lineHeight:24}}>Mỗi hợp đồng gửi nội dung mẫu đến số điện thoại trong hồ sơ khách. Khoản chưa đến hạn và số không hợp lệ bị bỏ qua. Rà từng số tiền, số điện thoại và nội dung trước khi xác nhận.</Text>
    {items.map(item=><Card key={item.id} style={{gap:10}}><Text style={{color:theme.text,fontSize:19,fontWeight:"800"}}>{item.context?.code||`Hợp đồng #${item.id}`}</Text>{item.context&&<><Text style={{color:theme.text}}>{item.context.customer_name} · {item.context.phone}</Text><Text style={{color:theme.text,fontWeight:"700",fontSize:22}}>{money(item.context.amount)}</Text><Text selectable style={{color:theme.muted,lineHeight:23}}>{item.context.message}</Text></>}{item.error&&<InlineError message={item.error} />}{item.status&&<View style={{gap:7}}><Text style={{color:theme.text,fontWeight:"700"}}>{REMINDER_STATUS_LABELS[item.status]}</Text><Text style={{color:theme.muted,lineHeight:23}}>{reminderResultMessage(item.status)}</Text></View>}{item.key&&<><Text selectable style={{color:theme.muted}}>Mã lần gửi: {item.key}</Text>{!busy&&(item.status==="unknown"||item.status==="pending"||item.error)&&<Button secondary label={`Đối chiếu nhắc nợ · ${item.context?.code||item.id}`} onPress={()=>{onClose();router.push("/(tabs)/account");}} />}</>}</Card>)}
    {!!error&&<InlineError message={error} />}{loading&&<Text style={{color:theme.muted}}>Đang lấy công nợ và nội dung hiện tại…</Text>}
    {!done&&<Button label={`Gửi nhắc nợ cho ${ready.length} hợp đồng đã rà soát`} loading={busy} disabled={loading||!ready.length} onPress={()=>setConfirm(true)} />}
    {done&&<Button secondary label="Mở lịch sử và đối chiếu nhắc nợ" onPress={()=>{onClose();router.push("/debt-reminders");}} />}
    <Button secondary label="Đóng rà soát nhắc nợ" disabled={busy} onPress={onClose} />
    {confirm&&<ConfirmEdit title={`Gửi Zalo cho ${ready.length} hợp đồng?`} message="Gửi lần lượt nội dung mẫu và số tiền đã rà soát ở trên. Giữ riêng từng kết quả chưa rõ để đối chiếu, tiếp tục các hợp đồng còn lại. Không tự gửi lại tin." confirmLabel="Xác nhận gửi các tin nhắc nợ" onCancel={()=>setConfirm(false)} onConfirm={()=>{void sendAll();}} />}
  </ScrollView></EditorSheet>;
}
