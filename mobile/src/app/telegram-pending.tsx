import {useState} from 'react';
import {ScrollView,Text} from 'react-native';
import {router} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {NOTICE_STATUS_LABELS} from '../../../shared/contract-telegram';
import {useSession} from '@/providers/session';
import {useWorkspace} from '@/hooks/use-workspace';
import {dateTime,useTheme} from '@/theme';
import {Button,Card,StateView} from '@/components/ui';
import {ChoiceField} from '@/components/form-fields';
function Pending(){
  const {api,session}=useSession(),theme=useTheme(),workspace=useWorkspace(),[store,setStore]=useState(session!.user.allStores?'all':String(session!.user.storeId||'all')),[page,setPage]=useState(1);
  const query=useQuery({queryKey:['telegram','pending',api!.origin,session!.user.id,session!.user.storeId,session!.user.allStores,store,page],queryFn:({signal})=>api!.pendingTelegram(new URLSearchParams({store,page:String(page)}).toString(),signal),retry:false});
  return <ScrollView contentContainerStyle={{padding:20,paddingBottom:40,gap:18,maxWidth:760,width:'100%',alignSelf:'center'}}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:'800'}}>Giao dịch chưa gửi Telegram</Text><Text style={{color:theme.muted,lineHeight:24}}>Theo lần gửi mới nhất của mỗi giao dịch: chờ bấm gửi, thiếu cấu hình, lỗi, chưa rõ kết quả hoặc đã thu hồi. Mở từng giao dịch để kiểm tra trước khi gửi.</Text>
    <ChoiceField label="Cơ sở giao dịch Telegram" value={store} choices={[...(session!.user.allStores?[{value:'all',label:'Tất cả cơ sở'}]:[]),...(workspace.data?.stores||[]).filter(s=>session!.user.allStores||s.id===session!.user.storeId).map(s=>({value:String(s.id),label:s.name}))]} searchable onChange={v=>{setStore(v);setPage(1);}}/>
    {query.isPending?<StateView title="Đang đọc giao dịch chưa gửi" loading/>:query.isError?<StateView title="Chưa đọc được giao dịch chưa gửi" message={query.error.message} retry={()=>void query.refetch()}/>:<>
      <Text style={{color:theme.muted}}>{query.data.total} giao dịch · Trang {query.data.page}/{query.data.pages}</Text>
      {query.data.rows.map(row=><Card key={`${row.order_id}:${row.event_key}`} style={{gap:12}}><Text style={{color:theme.text,fontSize:19,fontWeight:'700'}}>{row.code} · {row.customer_name}</Text><Text style={{color:theme.muted}}>{row.store_name} · {dateTime(row.created_at)}</Text><Text style={{color:theme.text}}>{NOTICE_STATUS_LABELS[row.status]||row.status}</Text>{row.error_code&&<Text style={{color:theme.danger}}>{row.error_code}</Text>}<Button secondary label={`Kiểm tra Telegram ${row.code}`} onPress={()=>router.push({pathname:'/contract-telegram/[id]',params:{id:String(row.order_id),event:row.event_key}})}/></Card>)}
      {!query.data.rows.length&&<Text style={{color:theme.muted}}>Không có giao dịch cần xử lý trong bộ lọc này.</Text>}
      <Button secondary label="Trang Telegram trước" disabled={query.isFetching||query.data.page<=1} onPress={()=>setPage(query.data.page-1)}/><Button secondary label="Trang Telegram tiếp" disabled={query.isFetching||query.data.page>=query.data.pages} onPress={()=>setPage(query.data.page+1)}/>
    </>}
    <Button secondary label="Tải lại giao dịch chưa gửi Telegram" loading={query.isFetching} onPress={()=>void query.refetch()}/>
  </ScrollView>;
}
export default function Screen(){const{api,session}=useSession();if(!api||!session||!session.user.permissions.includes('contracts.read'))return <StateView title="Không có quyền xem giao dịch Telegram"/>;return <Pending key={[api.origin,session.token,session.user.storeId,session.user.allStores].join('|')}/>;}
