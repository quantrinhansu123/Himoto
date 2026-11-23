import {useState} from 'react';
import {SectionList,Pressable,RefreshControl,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {useSession} from '@/providers/session';
import {useGlobalBranch} from '@/providers/branch';
import {useDebouncedValue} from '@/hooks/use-debounced-value';
import {useTheme} from '@/theme';
import {Button,Card,KeyValueRow,SkeletonList,StateView,StatusBadge} from '@/components/ui';
import {FormField,ChoiceField} from '@/components/form-fields';
import {STAFF_PROFILE_STATUSES} from '../../../shared/mobile-staff';
function Organization(){
  const{api,session}=useSession(),theme=useTheme();
  const canReadAll=Boolean(session!.user.allStores||session!.user.allStoresRead);
  const canReadStores=session!.user.permissions.includes('contracts.read');
  const defaultStore=canReadAll?'all':String(session!.user.storeId||'all');
  const{selectedStore:globalStore,selectStore:setGlobalStore}=useGlobalBranch(defaultStore);
  const store=canReadAll?(globalStore||defaultStore):defaultStore;
  const setStore=(next:string)=>{if(canReadAll)setGlobalStore(next);};
  const[input,setInput]=useState(''),[departed,setDeparted]=useState(false),search=useDebouncedValue(input);
  const query=useQuery({queryKey:['staff-organization',api!.origin,session!.user.id,session!.user.storeId,session!.user.allStores,session!.user.allStoresRead,store,search,departed],queryFn:({signal})=>api!.staffOrganization(new URLSearchParams({store,search,departed:departed?'1':'0'}).toString(),signal)});
  const sections=(query.data?.sections||[]).map(section=>({...section,data:section.people}));
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}><SectionList sections={sections} keyExtractor={person=>String(person.id)} stickySectionHeadersEnabled={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,paddingBottom:40,gap:12,maxWidth:760,width:'100%',alignSelf:'center'}}
    refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={()=>void query.refetch()} tintColor={theme.primary}/>}
    ListHeaderComponent={<View style={{gap:12}}><Text style={{color:theme.muted,fontSize:13,lineHeight:19}}>Theo bộ phận và cơ sở. Chọn nhân sự để xem hồ sơ hoặc chỉnh sửa theo quyền.</Text>
      <FormField label="Tìm nhân sự trên sơ đồ" value={input} onChangeText={setInput} maxLength={120}/>
      <ChoiceField label="Cơ sở trên sơ đồ" value={store} choices={[...(canReadAll?[{value:'all',label:'Tất cả cơ sở'}]:[]),...(query.data?.stores||[]).map(s=>({value:String(s.id),label:s.name}))]} searchable onChange={setStore}/>
      <Pressable accessibilityRole="switch" accessibilityLabel="Hiện nhân sự đã nghỉ việc" accessibilityState={{checked:departed}} aria-checked={departed} onPress={()=>setDeparted(!departed)} style={{padding:13,borderRadius:11,borderWidth:1,borderColor:theme.controlBorder,backgroundColor:theme.surface}}><Text style={{color:theme.text,fontSize:14.5,fontWeight:'600'}}>Hiện nhân sự đã nghỉ việc · {departed?'Bật':'Tắt'}</Text></Pressable>
      {query.data&&<Card style={{gap:4}}><KeyValueRow label="Tổng nhân sự & cơ sở" value={`${query.data.total} nhân sự · ${query.data.storeCount} cơ sở`} emphasize/><KeyValueRow label="Đang làm việc" value={String(query.data.working)}/><Text style={{color:theme.muted,fontSize:12.5}}>Kiêm nhiệm có thể xuất hiện ở nhiều bộ phận.</Text></Card>}
      {query.isPending?<SkeletonList count={4} lines={2}/>:query.isError?<StateView title="Chưa đọc được sơ đồ nhân sự" message={query.error.message} retry={()=>void query.refetch()}/>:!query.data.total&&<Text style={{color:theme.muted}}>Không có nhân sự khớp tìm kiếm.</Text>}
    </View>}
    renderSectionHeader={({section})=><View style={{gap:8,paddingTop:14}}>
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:17,fontWeight:'800'}}>{section.title} · {section.people.length}</Text>
      {section.storeId!==null&&canReadStores&&<Button size="sm" secondary label={`Xem cơ sở ${section.title}`} onPress={()=>router.push({pathname:'/store/[id]',params:{id:String(section.storeId)}})}/>}
      {!section.people.length&&<Text style={{color:theme.muted}}>Chưa có nhân sự phù hợp tại cơ sở này.</Text>}
    </View>}
    renderItem={({item})=><Pressable accessibilityRole="button" accessibilityLabel={`Xem nhân sự ${item.name}`} onPress={()=>router.push({pathname:'/staff/[id]',params:{id:String(item.id)}})} style={({pressed})=>({opacity:pressed?0.7:1})}><Card style={{gap:8}}><View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8}}><Text style={{color:theme.text,fontSize:16,fontWeight:'800',flex:1}}>{item.name}</Text><StatusBadge status={item.status} label={STAFF_PROFILE_STATUSES.find(s=>s.value===item.status)?.label}/></View><View style={{gap:2}}><KeyValueRow label="Mã & Chức vụ" value={`${item.code} · ${item.position||'Chưa có chức vụ'}`}/><KeyValueRow label="Đơn vị" value={item.storeName||'Trụ sở công ty'}/>{!!item.phone&&<KeyValueRow label="Điện thoại" value={item.phone} selectable/>}</View></Card></Pressable>}/></SafeAreaView>;
}
export default function Screen(){const{api,session}=useSession();if(!api||!session||!session.user.permissions.includes('hr.read'))return <StateView title="Không có quyền xem sơ đồ nhân sự"/>;return <Organization key={[api.origin,session.token,session.user.storeId,session.user.allStores].join('|')}/>;}
