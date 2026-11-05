import { useEffect,useRef,useState } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { router,useLocalSearchParams } from "expo-router";
import { ScrollView,Text } from "react-native";
import { reminderOperation } from "../../../../shared/mobile-debt-reminders";
import { useSession } from "@/providers/session";
import { pendingWrites } from "@/lib/pending-writes";
import { Button,InlineError,StateView } from "@/components/ui";
import { ReminderCard } from "@/components/reminder-card";
import { useTheme } from "@/theme";
function Result({requestKey}:{requestKey:string}) {
  const {api,session}=useSession(),theme=useTheme(),cache=useQueryClient(),[busy,setBusy]=useState(false),[error,setError]=useState("");const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const query=useQuery({queryKey:["reminder-result",session!.user.id,requestKey],queryFn:({signal})=>api!.reminderResult(requestKey,signal),retry:false});
  if(query.isPending)return <StateView title="Đang đối chiếu lần gửi nhắc nợ" loading />;
  if(query.isError)return <StateView title="Chưa đọc được kết quả gửi" message={query.error.message} retry={()=>{void query.refetch();}} />;
  const row=query.data.receipt;
  async function acknowledge() {
    if(!api||!session||busy)return;setBusy(true);setError("");
    try{const scope={origin:api.origin,userId:session.user.id,storeId:session.user.allStores?null:session.user.storeId,allStores:session.user.allStores},operation=reminderOperation(row.order_id);await pendingWrites.complete(scope,operation,requestKey);if(!alive.current)return;void cache.invalidateQueries({queryKey:["reminder-history"]});router.replace("/debt-reminders");}catch(cause){if(alive.current)setError((cause as Error).message);}finally{if(alive.current)setBusy(false);}
  }
  return <ScrollView contentContainerStyle={{padding:20,paddingBottom:40,gap:18,maxWidth:760,width:"100%",alignSelf:"center"}}>
    <ReminderCard row={row} details /><Text style={{color:theme.muted,lineHeight:23}}>Đây là lần gửi gốc đã ghi lịch sử. Xác nhận đã kiểm tra chỉ đóng mã đối chiếu trên thiết bị; không gửi lại nội dung.</Text>
    <Button secondary label="Tải lại trạng thái nhắc nợ" loading={query.isFetching} onPress={()=>{void query.refetch();}} />
    {!!error&&<InlineError message={error} />}<Button label="Đã kiểm tra lần gửi nhắc nợ" loading={busy} disabled={row.status==="pending"} onPress={()=>{void acknowledge();}} />
    {row.status==="pending"&&<Text style={{color:theme.muted,lineHeight:23}}>Máy chủ đã ghi lần gửi nhưng chưa có kết quả. Giữ mã và kiểm tra lại lịch sử; không tạo lần gửi mới.</Text>}
  </ScrollView>;
}
export default function Route() {const{key}=useLocalSearchParams<{key:string}>(),{api,session}=useSession();if(!api||!session||!/^[0-9a-f-]{36}$/.test(key))return <StateView title="Không mở được mã gửi nhắc nợ" />;return <Result key={`${key}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} requestKey={key} />;}
