import { useQuery } from "@tanstack/react-query";
import { router,useLocalSearchParams } from "expo-router";
import { RefreshControl,ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "@/providers/session";
import { useTheme } from "@/theme";
import { Button,StateView } from "@/components/ui";
import { ShiftSummary } from "@/components/shift-summary";
import { ShiftEvidence } from "@/components/shift-evidence";
import {ShiftAuditExport} from '@/components/shift-audit-export';
import {ShiftStockPhotos} from '@/components/shift-stock-photos';
import { ShiftReopen } from "@/components/shift-reopen";
import { ShiftGpsAlerts } from "@/components/shift-gps-alerts";
type EvidenceCategory = "batteries" | "cash" | "personal" | "company" | "door";
const EVIDENCE_CATEGORIES: readonly EvidenceCategory[] = ["batteries", "cash", "personal", "company", "door"];
function Report({id,evidence}:{id:string;evidence?:EvidenceCategory}){
  const{api,session}=useSession(),theme=useTheme(),query=useQuery({queryKey:["shift",session!.user.id,id],queryFn:({signal})=>api!.shift(id,signal),enabled:session!.user.permissions.includes("contracts.read"),retry:false});
  if(!session!.user.permissions.includes("contracts.read"))return <StateView title="Không có quyền xem báo cáo ca" />;
  if(query.isPending)return <StateView title="Đang mở báo cáo ca" loading />;if(query.isError)return <StateView title="Chưa mở được báo cáo ca" message={query.error.message} retry={()=>{void query.refetch();}} />;const report=query.data;
  const writable=(session!.user.allStores||session!.user.storeId===report.payload.store_id)&&session!.user.permissions.some(p=>p==="contracts.draft"||p==="finance.write");
  const proof=<ShiftEvidence key={`${report.id}:${report.revision}:${report.audit?.revision||0}:${evidence??""}`} report={report} initialCategory={evidence} onChanged={()=>{void query.refetch();}} />;
  return <SafeAreaView edges={["bottom","left","right"]} style={{flex:1,backgroundColor:theme.background}}><ScrollView contentContainerStyle={{padding:16,paddingBottom:40,gap:14,maxWidth:760,width:"100%",alignSelf:"center"}} refreshControl={<RefreshControl refreshing={query.isRefetching} tintColor={theme.primary} onRefresh={()=>{void query.refetch();}} />}>
    <ShiftGpsAlerts alerts={report.gps_alerts} />
    {evidence&&proof}
    {report.status==="draft"&&writable&&<Button label="Sửa thông tin / Chốt báo cáo" onPress={()=>router.push({pathname:"/shift-editor/[id]",params:{id}})} />}
    {(report.payload.report_type??"end_shift")==="end_shift"&&<ShiftReopen report={report}/>}
    <ShiftStockPhotos report={report} writable={writable} />
    {report.status==="submitted"&&<Button label="Mở đối soát KTNB" onPress={()=>router.push({pathname:"/shift-audit/[id]",params:{id}})} />}
    <ShiftSummary report={report} />{!evidence&&proof}
    <ShiftAuditExport key={`${report.id}:${report.audit?.revision||0}`} report={report}/>
    <Button secondary label="Tải lại hồ sơ báo cáo ca" loading={query.isFetching} onPress={()=>{void query.refetch();}} />
  </ScrollView></SafeAreaView>;
}
export default function Route(){const{id,evidence}=useLocalSearchParams<{id:string;evidence?:string}>(),{api,session}=useSession();if(!api||!session||!/^[1-9]\d{0,14}$/.test(id))return <StateView title="Không mở được báo cáo ca" />;const picked=EVIDENCE_CATEGORIES.includes(evidence as EvidenceCategory)?(evidence as EvidenceCategory):undefined;return <Report key={`${id}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} id={id} evidence={picked} />;}
