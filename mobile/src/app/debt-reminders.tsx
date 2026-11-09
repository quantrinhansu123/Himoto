import { useState } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { RefreshControl,ScrollView,Text,View } from "react-native";
import type { MobileRecord } from "../../../shared/mobile-contract";
import { useSession } from "@/providers/session";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useTheme,money } from "@/theme";
import { Button,Card,InlineError,StateView } from "@/components/ui";
import { ChoiceField,FormField } from "@/components/form-fields";
import { ReminderCard } from "@/components/reminder-card";
import { ReminderBatch } from "@/components/reminder-batch";
function Reminders() {
  const {api,session}=useSession(),theme=useTheme(),cache=useQueryClient(),[store,setStore]=useState(session!.user.allStores?"all":String(session!.user.storeId||"all")),[tab,setTab]=useState("history"),[page,setPage]=useState(1),[input,setInput]=useState(""),search=useDebouncedValue(input),[selection,setSelection]=useState<Record<string,MobileRecord>>({}),[batch,setBatch]=useState<number[]|null>(null);
  const allowed=session!.user.permissions.includes("contracts.read"),canSend=allowed&&session!.user.permissions.some(p=>p==="contracts.draft"||p==="finance.write");
  const options=useQuery({queryKey:["reminder-options",session!.user.id],queryFn:({signal})=>api!.reminderOptions(signal),enabled:allowed});
  const filters=new URLSearchParams({store,page:String(page)}),params=filters.toString();filters.set("search",search);const contractParams=filters.toString();
  const history=useQuery({queryKey:["reminder-history",session!.user.id,params],queryFn:({signal})=>api!.reminderHistory(params,signal),enabled:allowed&&tab==="history",retry:false});
  const contracts=useQuery({queryKey:["reminder-contracts",session!.user.id,contractParams],queryFn:({signal})=>api!.reminderContracts(contractParams,signal),enabled:canSend&&tab==="compose",retry:false});
  if(!allowed)return <StateView title="Không có quyền xem lịch sử nhắc nợ" />;
  const current=tab==="history"?history:contracts,total=current.data?.total||0,pages=current.data?.pages||1,selected=Object.values(selection);
  const toggle=(row:MobileRecord)=>setSelection(previous=>{const next={...previous};if(next[row.id])delete next[row.id];else next[row.id]=row;return next;});
  function sent(){void cache.invalidateQueries({queryKey:["reminder-history"]});}
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,paddingBottom:40,gap:18,maxWidth:760,width:"100%",alignSelf:"center"}} refreshControl={<RefreshControl refreshing={current.isRefetching} tintColor={theme.primary} onRefresh={()=>{void current.refetch();}} />}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:28,fontWeight:"800"}}>Gửi nhắc nợ</Text>
    <Text style={{color:theme.muted,lineHeight:24}}>Soạn tin Zalo theo khoản đến hạn và theo dõi lịch sử từng cơ sở. “Webhook đã tiếp nhận” chưa xác nhận khách đã nhận hoặc đọc tin.</Text>
    {canSend&&<ChoiceField label="Mục nhắc nợ" value={tab} choices={[{value:"history",label:"Lịch sử gửi"},{value:"compose",label:"Chọn hợp đồng để soạn"}]} onChange={value=>{setTab(value);setPage(1);}} />}
    <ChoiceField label="Cơ sở nhắc nợ" value={store} searchable choices={[...(session!.user.allStores?[{value:"all",label:"Tất cả cơ sở"}]:[]),...(options.data?.stores||[]).filter(row=>session!.user.allStores||row.id===session!.user.storeId).map(row=>({value:String(row.id),label:row.name}))]} onChange={value=>{setStore(value);setPage(1);setSelection({});}} />
    {options.isError&&<InlineError message={options.error.message} />}
    {tab==="compose"&&<><FormField label="Tìm hợp đồng cần nhắc nợ" value={input} onChangeText={value=>{setInput(value);setPage(1);}} maxLength={200} /><Text style={{color:theme.muted,lineHeight:23}}>Chỉ hợp đồng còn khoản đến hạn. Chọn nhiều dòng ở các trang để gửi nội dung mẫu hàng loạt, hoặc mở soạn riêng để sửa nội dung.</Text>
      {!!selected.length&&<Card style={{gap:12}}><Text style={{color:theme.text,fontWeight:"700"}}>Đã chọn {selected.length} hợp đồng</Text><Button label="Rà soát gửi nhắc nợ hàng loạt" onPress={()=>setBatch(selected.map(row=>row.id))} /><Button secondary label="Bỏ chọn hợp đồng nhắc nợ" onPress={()=>setSelection({})} /></Card>}
      {!!contracts.data?.rows.length&&<Button secondary label="Chọn các hợp đồng trang này" onPress={()=>setSelection(previous=>({...previous,...Object.fromEntries(contracts.data!.rows.map(row=>[row.id,row]))}))} />}
    </>}
    {current.isPending?<StateView title="Đang tải nhắc nợ" loading />:current.isError?<StateView title="Chưa tải được nhắc nợ" message={current.error.message} retry={()=>{void current.refetch();}} />:tab==="history"?history.data?.rows.map(row=><ReminderCard key={row.request_id} row={row} />):contracts.data?.rows.map(row=><Card key={row.id} style={{gap:12}}><Text style={{color:theme.text,fontSize:21,fontWeight:"800"}}>{row.code} · {row.name}</Text><Text style={{color:theme.muted,lineHeight:23}}>{row.phone} · {row.storeName}</Text><Text style={{color:theme.text}}>Khoản đến hạn: {row.monitoring?.dueAmount!=null?money(row.monitoring.dueAmount):row.totalAmount!=null&&row.paidAmount!=null?money(Math.max(0,row.totalAmount-row.paidAmount)):"Mở soạn để đối chiếu"}</Text><Button secondary label={`${selection[row.id]?"Bỏ chọn":"Chọn"} nhắc nợ · ${row.code}`} onPress={()=>toggle(row)} /><Button label={`Soạn Zalo · ${row.code}`} onPress={()=>router.push({pathname:"/reminder-editor/[id]",params:{id:String(row.id)}})} /></Card>)}
    {!current.isPending&&!current.isError&&!total&&<StateView title={tab==="history"?"Chưa có lịch sử nhắc nợ":"Không có hợp đồng đến hạn phù hợp"} />}
    <View style={{gap:12}}><Text style={{color:theme.muted}}>{total} {tab==="history"?"lần gửi":"hợp đồng"} · Trang {page}/{pages}</Text><Button secondary label="Trang nhắc nợ trước" disabled={page<=1||current.isFetching} onPress={()=>setPage(v=>v-1)} /><Button secondary label="Trang nhắc nợ sau" disabled={page>=pages||current.isFetching} onPress={()=>setPage(v=>v+1)} /><Button secondary label="Tải lại nhắc nợ" loading={current.isFetching} onPress={()=>{void current.refetch();}} /></View>
    {batch&&<ReminderBatch ids={batch} onClose={()=>setBatch(null)} onSent={sent} />}
  </ScrollView>;
}
export default function Route() {const{api,session}=useSession();if(!api||!session)return <StateView title="Đăng nhập để xem nhắc nợ" />;return <Reminders key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} />;}
