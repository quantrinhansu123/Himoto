import {useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {FlatList,RefreshControl,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router,Stack,useLocalSearchParams} from 'expo-router';
import type {MobileFleetVehicle} from '../../../shared/mobile-fleet-inventory';
import {useSession} from '@/providers/session';
import {useTheme} from '@/theme';
import {Button,Card,InlineError,KeyValueRow,PaginationBar,SkeletonList,StateView,StatusBadge} from '@/components/ui';
import {ChoiceField,FormField} from '@/components/form-fields';

function Inventory({transfer,initialStore}:{transfer:boolean;initialStore:string}){
  const{api,session}=useSession(),theme=useTheme(),list=useRef<FlatList<MobileFleetVehicle>>(null);
  const[search,setSearch]=useState(''),[applied,setApplied]=useState(''),[store,setStore]=useState(initialStore),[availability,setAvailability]=useState(''),[page,setPage]=useState(1);
  const filter=new URLSearchParams({search:applied,store,availability,page:String(page)}).toString();
  const query=useQuery({queryKey:['fleet-inventory',api!.origin,session!.user.id,session!.user.storeId,session!.user.allStores,filter],queryFn:({signal})=>api!.fleetInventory(filter,signal),retry:false,placeholderData:previous=>previous});
  const data=query.data,waiting=query.isPlaceholderData||query.isPending;
  const move=(next:number)=>{setPage(next);list.current?.scrollToOffset({offset:0,animated:false});};
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}>
    <FlatList ref={list} data={waiting||query.isError?[]:data?.rows||[]} keyExtractor={row=>String(row.id)} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,paddingBottom:40,gap:12,maxWidth:760,width:'100%',alignSelf:'center'}} refreshControl={<RefreshControl refreshing={query.isRefetching&&!query.isPlaceholderData} tintColor={theme.primary} onRefresh={()=>void query.refetch()}/>}
      ListHeaderComponent={<View style={{gap:12,marginBottom:4}}>
        {transfer&&<Text accessibilityRole="header" style={{color:theme.text,fontSize:19,fontWeight:'800'}}>Chọn xe cần chuyển</Text>}
        <Text style={{color:theme.muted,fontSize:13,lineHeight:19}}>{transfer?'Có thể chọn xe ở mọi cơ sở để điều chuyển (xe Lưu kho sẽ chờ cơ sở đích nhận; xe ở trạng thái khác sẽ chuyển kho ngay).':'Tra cứu xe giữa các cơ sở và kiểm tra khả năng điều chuyển. Nhận xe tại cơ sở đích trước khi lập hợp đồng.'}</Text>
        <Card style={{gap:12}}>
          <FormField label="Tìm trong kho xe chung" value={search} onChangeText={setSearch} maxLength={100} hint="Biển số, tên xe hoặc cơ sở" onSubmitEditing={()=>{setApplied(search.trim());move(1);}} returnKeyType="search"/>
          <Button size="sm" secondary label="Tìm xe trong kho chung" onPress={()=>{setApplied(search.trim());move(1);}}/>
          <ChoiceField label="Cơ sở quản lý / chờ nhận" value={store} choices={[{value:'',label:'Tất cả cơ sở'},...(data?.stores||[]).map(s=>({value:String(s.id),label:s.name}))]} searchable onChange={value=>{setStore(value);move(1);}}/>
          <ChoiceField label="Khả năng điều chuyển" value={availability} choices={[{value:'',label:'Tất cả xe'},{value:'ready',label:'Lưu kho · không có hợp đồng mở'},{value:'blocked',label:'Trạng thái khác / đang cho thuê'}]} onChange={value=>{setAvailability(value);move(1);}}/>
        </Card>
        <Text accessibilityLiveRegion="polite" style={{color:theme.muted,fontSize:13.5,lineHeight:20}}>{waiting?'Đang đọc kho xe…':query.isError?'Chưa cập nhật được kết quả kho xe.':`${data?.total||0} / ${data?.scopeCount||0} xe toàn hệ thống · Trang ${data?.page||1}/${data?.pages||1}`}</Text>
        {query.isError&&<><InlineError message={query.error.message}/><Button secondary label="Tải lại kho xe chung" onPress={()=>void query.refetch()}/></>}
      </View>}
      ListEmptyComponent={waiting?<SkeletonList count={4}/>:!query.isError?<StateView title="Không có xe phù hợp" message="Thử đổi biển số, cơ sở hoặc khả năng điều chuyển."/>:undefined}
      renderItem={({item})=><Card style={{gap:10}}>
        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8}}>
          <Text accessibilityRole="header" style={{color:theme.text,fontSize:18,fontWeight:'800'}}>{item.license||'Chưa có biển số'}</Text>
          <StatusBadge status={item.status}/>
        </View>
        <View style={{gap:2}}>
          <KeyValueRow label="Tên xe" value={item.name||'—'} />
          <KeyValueRow label="Cơ sở quản lý / chờ nhận" value={item.storeName||'Chưa xác định'} />
          {item.status==='in_transit'&&<KeyValueRow label="Đang điều chuyển" value={`${item.fromStoreName||'Chưa xác định'} → ${item.toStoreName||item.storeName||'Chưa xác định'}`} emphasize />}
          <KeyValueRow label="Khả năng điều chuyển" value={item.available?'Có thể điều chuyển tới cơ sở khác':item.status==='ready'?'Còn hợp đồng chưa đóng':'Chưa về Lưu kho'} emphasize={item.available} />
        </View>
        <View style={{flexDirection:'row',gap:10}}>
          <Button size="sm" equalWidth secondary label={`Mở hồ sơ xe ${item.license||item.id}`} onPress={()=>router.push({pathname:'/vehicle/[id]',params:{id:String(item.id)}})}/>
          {session!.user.permissions.some(p=>p==='vehicles.transfer'||p==='vehicles.receive')&&<Button size="sm" equalWidth secondary label={`Điều chuyển xe ${item.license||item.id}`} onPress={()=>router.push({pathname:'/vehicle-transfer-editor/[id]',params:{id:String(item.id)}})}/>}
        </View>
      </Card>}
      ListFooterComponent={!waiting&&data&&data.pages>1?<PaginationBar page={data.page} pages={data.pages} total={data.total} unit="xe" loading={query.isFetching} onPrev={()=>move(data.page-1)} onNext={()=>move(data.page+1)}/>:undefined}
    />
  </SafeAreaView>;
}
export default function Route(){
  const{api,session}=useSession(),params=useLocalSearchParams<{purpose?:string;store?:string}>();
  const transfer=params.purpose==='transfer';
  if(!api||!session?.user.permissions.includes('vehicles.read')||transfer&&!session.user.permissions.includes('vehicles.transfer'))return <StateView title="Không có quyền thực hiện thao tác kho xe"/>;
  if(transfer&&!session.user.allStores&&!session.user.storeId)return <StateView title="Tài khoản chưa được phân cơ sở chuyển xe"/>;
  const initialStore=!transfer?'':/^[1-9]\d{0,14}$/.test(params.store??'')?params.store!:'';
  return <><Stack.Screen options={{title:transfer?'Chuyển xe':'Kho xe toàn hệ thống'}} />
    <Inventory key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(',')}:${transfer}:${initialStore}`} transfer={transfer} initialStore={initialStore}/>
  </>;
}
