import {useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@tanstack/react-query';
import {router,useLocalSearchParams} from 'expo-router';
import {useSession} from '@/providers/session';
import {dateTime,useTheme} from '@/theme';
import {Button,Card,KeyValueRow,PaginationBar,StateView,StatusBadge} from '@/components/ui';
function Contracts({id}:{id:string}) {
  const {api,session}=useSession(),theme=useTheme(),[page,setPage]=useState(1);
  const allowed=session!.user.permissions.includes('vehicles.read')&&session!.user.permissions.includes('contracts.read')&&/^[1-9]\d{0,14}$/.test(id);
  const query=useQuery({queryKey:['vehicle-contracts',api!.origin,session!.user.id,session!.user.storeId,session!.user.allStores,id,page],queryFn:({signal})=>api!.vehicleContracts(id,page,signal),enabled:allowed,retry:false});
  if(!allowed)return <StateView title="Không có quyền xem hợp đồng của xe"/>;
  if(query.isPending)return <StateView title="Đang đọc hợp đồng của xe" loading/>;
  if(query.isError)return <StateView title="Chưa đọc được hợp đồng của xe" message={query.error.message} retry={()=>void query.refetch()}/>;
  const data=query.data;
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}><ScrollView contentContainerStyle={{padding:16,gap:14,paddingBottom:40,maxWidth:760,width:'100%',alignSelf:'center'}}>
    <View style={{gap:4}}><Text accessibilityRole="header" style={{color:theme.text,fontSize:20,fontWeight:'800'}}>Hợp đồng liên quan · {data.total}</Text><Text style={{color:theme.muted,fontSize:13.5,lineHeight:20}}>Hợp đồng đang mở và nháp giữ xe trong phạm vi được xem. Khoản cọc và nháp giữ chỗ được hiển thị để kiểm tra lịch xe.</Text></View>
    {data.rows.map(row=><Card key={row.id} style={{gap:10}}><View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8}}><Text style={{color:theme.text,fontSize:17,fontWeight:'800',flex:1}}>{row.code}</Text><StatusBadge status={row.status}/></View><View style={{gap:2}}><KeyValueRow label="Khách thuê" value={row.customer||'Chưa có tên khách'} emphasize/><KeyValueRow label="Thời gian thuê" value={`${row.startsAt?dateTime(row.startsAt):'Chưa có'} → ${row.endsAt?dateTime(row.endsAt):'Chưa có'}`}/></View><Button size="sm" secondary label={`Mở hợp đồng ${row.code}`} onPress={()=>router.push({pathname:'/record/[kind]/[id]',params:{kind:'contracts',id:String(row.id)}})}/></Card>)}
    {!data.rows.length&&<StateView title="Chưa có hợp đồng mở" message="Xe chưa có hợp đồng liên quan đang mở trong phạm vi hiện tại."/>}
    {data.pages>1&&<PaginationBar page={data.page} pages={data.pages} total={data.total} unit="hợp đồng" disabled={query.isFetching} onChange={setPage}/>}
    <Button size="sm" label="Tải lại hợp đồng của xe" secondary loading={query.isFetching} onPress={()=>void query.refetch()}/>
  </ScrollView></SafeAreaView>;
}
export default function Screen(){const{id}=useLocalSearchParams<{id:string}>(),{api,session}=useSession();if(!api||!session||typeof id!=='string')return <StateView title="Không mở được hợp đồng xe"/>;return <Contracts key={[api.origin,session.token,session.user.storeId,session.user.allStores,id].join('|')} id={id}/>;}
