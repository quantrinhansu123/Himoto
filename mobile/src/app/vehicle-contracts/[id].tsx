import {useState} from 'react';
import {ScrollView,Text} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import {router,useLocalSearchParams} from 'expo-router';
import {useSession} from '@/providers/session';
import {dateTime,useTheme} from '@/theme';
import {Button,Card,StateView,StatusBadge} from '@/components/ui';
function Contracts({id}:{id:string}) {
  const {api,session}=useSession(),theme=useTheme(),[page,setPage]=useState(1);
  const allowed=session!.user.permissions.includes('vehicles.read')&&session!.user.permissions.includes('contracts.read')&&/^[1-9]\d{0,14}$/.test(id);
  const query=useQuery({queryKey:['vehicle-contracts',api!.origin,session!.user.id,session!.user.storeId,session!.user.allStores,id,page],queryFn:({signal})=>api!.vehicleContracts(id,page,signal),enabled:allowed,retry:false});
  if(!allowed)return <StateView title="Không có quyền xem hợp đồng của xe"/>;
  if(query.isPending)return <StateView title="Đang đọc hợp đồng của xe" loading/>;
  if(query.isError)return <StateView title="Chưa đọc được hợp đồng của xe" message={query.error.message} retry={()=>void query.refetch()}/>;
  const data=query.data;
  return <ScrollView contentContainerStyle={{padding:20,gap:18,paddingBottom:40,maxWidth:760,width:'100%',alignSelf:'center'}}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:'800'}}>Hợp đồng liên quan · {data.total}</Text>
    <Text style={{color:theme.muted,lineHeight:24}}>Hợp đồng đang mở và nháp giữ xe trong phạm vi được xem. Khoản cọc và nháp giữ chỗ được hiển thị để kiểm tra lịch xe.</Text>
    {data.rows.map(row=><Card key={row.id} style={{gap:12}}><Text style={{color:theme.text,fontSize:20,fontWeight:'700'}}>{row.code}</Text><Text style={{color:theme.text,fontSize:16}}>{row.customer||'Chưa có tên khách'}</Text><StatusBadge status={row.status}/><Text style={{color:theme.muted,lineHeight:24}}>{row.startsAt?dateTime(row.startsAt):'Chưa có ngày thuê'} → {row.endsAt?dateTime(row.endsAt):'Chưa có ngày trả'}</Text><Button secondary label={`Mở hợp đồng ${row.code}`} onPress={()=>router.push({pathname:'/record/[kind]/[id]',params:{kind:'contracts',id:String(row.id)}})}/></Card>)}
    {!data.rows.length&&<Text style={{color:theme.muted}}>Xe chưa có hợp đồng liên quan đang mở trong phạm vi hiện tại.</Text>}
    <Text style={{color:theme.muted}}>Trang {data.page}/{data.pages}</Text>
    <Button label="Trang hợp đồng trước" secondary disabled={query.isFetching||data.page<=1} onPress={()=>setPage(data.page-1)}/><Button label="Trang hợp đồng tiếp" secondary disabled={query.isFetching||data.page>=data.pages} onPress={()=>setPage(data.page+1)}/>
    <Button label="Tải lại hợp đồng của xe" secondary loading={query.isFetching} onPress={()=>void query.refetch()}/>
  </ScrollView>;
}
export default function Screen(){const{id}=useLocalSearchParams<{id:string}>(),{api,session}=useSession();if(!api||!session||typeof id!=='string')return <StateView title="Không mở được hợp đồng xe"/>;return <Contracts key={[api.origin,session.token,session.user.storeId,session.user.allStores,id].join('|')} id={id}/>;}
