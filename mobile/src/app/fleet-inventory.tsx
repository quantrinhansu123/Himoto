import {useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {FlatList,RefreshControl,Text,View} from 'react-native';
import {router} from 'expo-router';
import type {MobileFleetVehicle} from '../../../shared/mobile-fleet-inventory';
import {useSession} from '@/providers/session';
import {useTheme} from '@/theme';
import {Button,Card,InlineError,StateView,StatusBadge} from '@/components/ui';
import {ChoiceField,FormField} from '@/components/form-fields';

function Inventory(){
  const{api,session}=useSession(),theme=useTheme(),list=useRef<FlatList<MobileFleetVehicle>>(null);
  const[search,setSearch]=useState(''),[applied,setApplied]=useState(''),[store,setStore]=useState(''),[availability,setAvailability]=useState(''),[page,setPage]=useState(1);
  const filter=new URLSearchParams({search:applied,store,availability,page:String(page)}).toString();
  const query=useQuery({queryKey:['fleet-inventory',api!.origin,session!.user.id,session!.user.storeId,session!.user.allStores,filter],queryFn:({signal})=>api!.fleetInventory(filter,signal),retry:false,placeholderData:previous=>previous});
  const data=query.data,waiting=query.isPlaceholderData||query.isPending;
  const move=(next:number)=>{setPage(next);list.current?.scrollToOffset({offset:0,animated:false});};
  return <FlatList ref={list} data={waiting||query.isError?[]:data?.rows||[]} keyExtractor={row=>String(row.id)} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,paddingBottom:40,gap:14,maxWidth:760,width:'100%',alignSelf:'center'}} refreshControl={<RefreshControl refreshing={query.isRefetching&&!query.isPlaceholderData} tintColor={theme.primary} onRefresh={()=>void query.refetch()}/>}
    ListHeaderComponent={<View style={{gap:16,marginBottom:4}}>
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:27,fontWeight:'800'}}>Kho xe toàn hệ thống</Text>
      <Text style={{color:theme.muted,lineHeight:24}}>Tra cứu xe giữa các cơ sở và kiểm tra khả năng điều chuyển. Nhận xe tại cơ sở đích trước khi lập hợp đồng.</Text>
      <Card style={{gap:14}}>
        <FormField label="Tìm trong kho xe chung" value={search} onChangeText={setSearch} maxLength={100} hint="Biển số, tên xe hoặc cơ sở" onSubmitEditing={()=>{setApplied(search.trim());move(1);}} returnKeyType="search"/>
        <Button secondary label="Tìm xe trong kho chung" onPress={()=>{setApplied(search.trim());move(1);}}/>
        <ChoiceField label="Cơ sở quản lý / chờ nhận" value={store} choices={[{value:'',label:'Tất cả cơ sở'},...(data?.stores||[]).map(s=>({value:String(s.id),label:s.name}))]} searchable onChange={value=>{setStore(value);move(1);}}/>
        <ChoiceField label="Khả năng điều chuyển" value={availability} choices={[{value:'',label:'Tất cả xe'},{value:'ready',label:'Lưu kho · không có hợp đồng mở'},{value:'blocked',label:'Chưa thể điều chuyển'}]} onChange={value=>{setAvailability(value);move(1);}}/>
      </Card>
      <Text accessibilityLiveRegion="polite" style={{color:theme.muted,lineHeight:24}}>{waiting?'Đang đọc kho xe…':query.isError?'Chưa cập nhật được kết quả kho xe.':`${data?.total||0} / ${data?.scopeCount||0} xe toàn hệ thống · Trang ${data?.page||1}/${data?.pages||1}`}</Text>
      {query.isError&&<><InlineError message={query.error.message}/><Button secondary label="Tải lại kho xe chung" onPress={()=>void query.refetch()}/></>}
    </View>}
    ListEmptyComponent={waiting?<StateView title="Đang lọc kho xe" loading/>:!query.isError?<StateView title="Không có xe phù hợp" message="Thử đổi biển số, cơ sở hoặc khả năng điều chuyển."/>:undefined}
    renderItem={({item})=><Card style={{gap:12}}>
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:21,fontWeight:'800'}}>{item.license||'Chưa có biển số'}</Text>
      <Text style={{color:theme.text,fontSize:16}}>{item.name}</Text><StatusBadge status={item.status}/>
      <Text style={{color:theme.muted,lineHeight:24}}>Cơ sở quản lý / chờ nhận: {item.storeName||'Chưa xác định'}</Text>
      {item.status==='in_transit'&&<Text style={{color:theme.muted,lineHeight:24}}>Đang chuyển: {item.fromStoreName||'Chưa xác định'} → {item.toStoreName||item.storeName||'Chưa xác định'}. Chưa xác nhận nhận xe.</Text>}
      <Text style={{color:item.available?theme.success:theme.muted,lineHeight:24,fontWeight:'600'}}>{item.available?'Có thể điều chuyển tới cơ sở khác':item.status==='ready'?'Chưa thể điều chuyển: còn hợp đồng chưa đóng':'Chưa thể điều chuyển khi chưa về Lưu kho'}</Text>
      <Button secondary label={`Mở hồ sơ xe ${item.license||item.id}`} onPress={()=>router.push({pathname:'/vehicle/[id]',params:{id:String(item.id)}})}/>
      {session!.user.permissions.some(p=>p==='vehicles.transfer'||p==='vehicles.receive')&&<Button secondary label={`Điều chuyển xe ${item.license||item.id}`} onPress={()=>router.push({pathname:'/vehicle-transfer-editor/[id]',params:{id:String(item.id)}})}/>}
    </Card>}
    ListFooterComponent={!waiting&&data&&data.pages>1?<View style={{gap:12,marginTop:10}}><Button secondary label="Trang kho xe trước" disabled={query.isFetching||data.page===1} onPress={()=>move(data.page-1)}/><Button secondary label="Trang kho xe tiếp" disabled={query.isFetching||data.page===data.pages} onPress={()=>move(data.page+1)}/></View>:undefined}
  />;
}
export default function Route(){const{api,session}=useSession();if(!api||!session?.user.permissions.includes('vehicles.read'))return <StateView title="Không có quyền xem kho xe"/>;return <Inventory key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(',')}`}/>;}
