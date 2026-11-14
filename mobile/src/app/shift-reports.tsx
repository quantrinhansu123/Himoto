import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { RefreshControl,ScrollView,Text } from "react-native";
import { useSession } from "@/providers/session";
import { useTheme,money } from "@/theme";
import { Button,Card,StateView } from "@/components/ui";
import { ChoiceField } from "@/components/form-fields";
import { DateField } from "@/components/date-field";
function List(){
  const{api,session}=useSession(),theme=useTheme(),[store,setStore]=useState(session!.user.allStores?"all":String(session!.user.storeId||"all")),[date,setDate]=useState(""),[status,setStatus]=useState("all");
  const allowed=session!.user.permissions.includes("contracts.read"),options=useQuery({queryKey:["shift-options",session!.user.id],queryFn:({signal})=>api!.shiftOptions(signal),enabled:allowed}),params=new URLSearchParams({...store!=="all"?{store_id:store}:{},...date?{date}:{}}).toString();
  const query=useQuery({queryKey:["shifts",session!.user.id,params],queryFn:({signal})=>api!.shifts(params,signal),enabled:allowed,retry:false});if(!allowed)return <StateView title="Không có quyền xem báo cáo ca" />;
  return <ScrollView contentContainerStyle={{padding:20,paddingBottom:40,gap:18,maxWidth:760,width:"100%",alignSelf:"center"}} refreshControl={<RefreshControl refreshing={query.isRefetching} tintColor={theme.primary} onRefresh={()=>{void query.refetch();}} />}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:28,fontWeight:"800"}}>Báo cáo cuối ca</Text><Text style={{color:theme.muted,lineHeight:24}}>PGD kiểm kê và chốt báo cáo; KTNB đối chiếu số app, số sổ và thực tế. Danh sách tối đa100báo cáo mới nhất theo bộ lọc.</Text>
    {options.data?.canWrite&&<Button label="Lập báo cáo cuối ca" onPress={()=>router.push({pathname:"/shift-editor/[id]",params:{id:"new"}})} />}
    <ChoiceField label="Lọc cơ sở báo cáo ca" value={store} searchable choices={[...(session!.user.allStores?[{value:"all",label:"Tất cả cơ sở"}]:[]),...(options.data?.stores||[]).filter(s=>session!.user.allStores||s.id===session!.user.storeId).map(s=>({value:String(s.id),label:s.name}))]} onChange={setStore} /><DateField label="Lọc ngày báo cáo ca" value={date} onChange={setDate} /><ChoiceField label="Trạng thái báo cáo ca" value={status} choices={[{value:"all",label:"Tất cả trạng thái"},{value:"draft",label:"Nháp PGD"},{value:"submitted",label:"PGD đã chốt"},{value:"confirmed",label:"KTNB đã xác nhận"}]} onChange={setStatus} />

    {query.isPending?<StateView title="Đang tải báo cáo ca" loading />:query.isError?<StateView title="Chưa tải được báo cáo ca" message={query.error.message} retry={()=>{void query.refetch();}} />:query.data.rows.filter(row=>status==="all"||status==="confirmed"?status==="all"||row.audit?.status==="confirmed":row.status===status).map(row=><Card key={row.id} style={{gap:12}}><Text style={{color:theme.text,fontSize:21,fontWeight:"800"}}>{row.store_name} · {row.payload.date.split("-").reverse().join("/")}</Text><Text style={{color:theme.muted}}>{row.payload.staff} · {row.status==="draft"?"Nháp PGD":"PGD đã chốt"}</Text><Text style={{color:theme.text}}>Tiền mặt: {money(row.payload.cash)} · {row.photos.length} mục có ảnh</Text><Text style={{color:theme.muted}}>{row.audit?.status==="confirmed"?`KTNB đã xác nhận · ${row.audit.result==="matched"?"Khớp":"Có chênh lệch"}`:"KTNB chưa xác nhận"}</Text><Button label={`Mở báo cáo ca #${row.id}`} onPress={()=>router.push({pathname:"/shift/[id]",params:{id:String(row.id)}})} /></Card>)}
    {!query.isPending&&!query.isError&&!query.data?.rows.length&&<StateView title="Chưa có báo cáo ca trong bộ lọc này" />}<Button secondary label="Tải lại báo cáo ca" loading={query.isFetching} onPress={()=>{void query.refetch();}} />
  </ScrollView>;
}
export default function Route(){const{api,session}=useSession();if(!api||!session)return <StateView title="Đăng nhập để xem báo cáo ca" />;return <List key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} />;}
