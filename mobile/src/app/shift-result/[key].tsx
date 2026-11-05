import { useEffect,useRef,useState } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { router,useLocalSearchParams } from "expo-router";
import { ScrollView,Text } from "react-native";
import { useSession } from "@/providers/session";
import { pendingWrites } from "@/lib/pending-writes";
import { useTheme } from "@/theme";
import { Button,Card,InlineError,StateView } from "@/components/ui";
import { ShiftSummary } from "@/components/shift-summary";
function Result({requestKey}:{requestKey:string}){
  const{api,session}=useSession(),theme=useTheme(),cache=useQueryClient(),[busy,setBusy]=useState(false),[error,setError]=useState("");const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const query=useQuery({queryKey:["shift-result",session!.user.id,requestKey],queryFn:({signal})=>api!.shiftResult(requestKey,signal),retry:false});
  if(query.isPending)return <StateView title="Đang đọc xác nhận báo cáo ca" loading />;if(query.isError)return <StateView title="Chưa đọc được xác nhận báo cáo ca" message={query.error.message} retry={()=>{void query.refetch();}} />;
  async function acknowledge(){if(!api||!session||busy||!query.data)return;setBusy(true);setError("");try{const result=query.data,scope={origin:api.origin,userId:session.user.id,storeId:session.user.allStores?null:session.user.storeId,allStores:session.user.allStores},original=await pendingWrites.entryScope(scope,result.operation,requestKey);if(original)await pendingWrites.complete(original,result.operation,requestKey);if(!alive.current)return;void cache.invalidateQueries({queryKey:["shifts"]});void cache.invalidateQueries({queryKey:["shift"]});router.replace({pathname:"/shift/[id]",params:{id:String(result.receipt.id)}});}catch(cause){if(alive.current)setError((cause as Error).message);}finally{if(alive.current)setBusy(false);}}
  return <ScrollView contentContainerStyle={{padding:20,paddingBottom:40,gap:18,maxWidth:760,width:"100%",alignSelf:"center"}}><Card style={{gap:10}}><Text style={{color:theme.success,fontSize:23,fontWeight:"800"}}>Đã ghi nhận báo cáo ca</Text><Text selectable style={{color:theme.muted,lineHeight:24}}>Mã gốc: {requestKey}{"\n"}Phiên bản tại lần ghi: {query.data.receipt.revision}</Text><Text style={{color:theme.muted,lineHeight:24}}>Bên dưới là báo cáo hiện tại. Số liệu hoặc minh chứng có thể đã đổi sau lần ghi gốc.</Text></Card><ShiftSummary report={query.data.current} />{!!error&&<InlineError message={error} />}<Button label="Đã kiểm tra xác nhận báo cáo ca" loading={busy} onPress={()=>{void acknowledge();}} /></ScrollView>;
}
export default function Route(){const{key}=useLocalSearchParams<{key:string}>(),{api,session}=useSession();if(!api||!session||!/^[0-9a-f-]{36}$/.test(key))return <StateView title="Không mở được mã báo cáo ca" />;return <Result key={`${key}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} requestKey={key} />;}
