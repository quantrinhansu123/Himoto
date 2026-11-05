import { useQuery } from "@tanstack/react-query";
import { router,useLocalSearchParams } from "expo-router";
import { RefreshControl,ScrollView } from "react-native";
import { useSession } from "@/providers/session";
import { useTheme } from "@/theme";
import { Button,StateView } from "@/components/ui";
import { ShiftTelegramStatus } from "@/components/shift-telegram-status";
import { ShiftSummary } from "@/components/shift-summary";
import { ShiftEvidence } from "@/components/shift-evidence";
import {ShiftAuditExport} from '@/components/shift-audit-export';
function Report({id}:{id:string}){
  const{api,session}=useSession(),theme=useTheme(),query=useQuery({queryKey:["shift",session!.user.id,id],queryFn:({signal})=>api!.shift(id,signal),enabled:session!.user.permissions.includes("contracts.read"),retry:false});
  if(!session!.user.permissions.includes("contracts.read"))return <StateView title="Không có quyền xem báo cáo ca" />;
  if(query.isPending)return <StateView title="Đang mở báo cáo ca" loading />;if(query.isError)return <StateView title="Chưa mở được báo cáo ca" message={query.error.message} retry={()=>{void query.refetch();}} />;const report=query.data;
  return <ScrollView contentContainerStyle={{padding:20,paddingBottom:40,gap:18,maxWidth:760,width:"100%",alignSelf:"center"}} refreshControl={<RefreshControl refreshing={query.isRefetching} tintColor={theme.primary} onRefresh={()=>{void query.refetch();}} />}>
    {report.status==="draft"&&session!.user.permissions.some(p=>p==="contracts.draft"||p==="finance.write")&&<Button label="Tiếp tục kiểm kê và chốt ca" onPress={()=>router.push({pathname:"/shift-editor/[id]",params:{id}})} />}
    {report.status==="submitted"&&<Button label="Mở đối soát KTNB" onPress={()=>router.push({pathname:"/shift-audit/[id]",params:{id}})} />}
    <ShiftSummary report={report} /><ShiftEvidence key={`${report.id}:${report.revision}:${report.audit?.revision||0}`} report={report} onChanged={()=>{void query.refetch();}} />
    <ShiftAuditExport key={`${report.id}:${report.audit?.revision||0}`} report={report}/>
    {report.status==="submitted"&&report.payload.ownership_report&&<ShiftTelegramStatus id={id} />}
    <Button secondary label="Tải lại hồ sơ báo cáo ca" loading={query.isFetching} onPress={()=>{void query.refetch();}} />
  </ScrollView>;
}
export default function Route(){const{id}=useLocalSearchParams<{id:string}>(),{api,session}=useSession();if(!api||!session||!/^[1-9]\d{0,14}$/.test(id))return <StateView title="Không mở được báo cáo ca" />;return <Report key={`${id}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} id={id} />;}
