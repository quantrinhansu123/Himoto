import {useState} from 'react';
import {SectionList,Pressable,RefreshControl,Text,View} from 'react-native';
import {router} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {useSession} from '@/providers/session';
import {useDebouncedValue} from '@/hooks/use-debounced-value';
import {useTheme} from '@/theme';
import {Button,Card,StateView,StatusBadge} from '@/components/ui';
import {FormField,ChoiceField} from '@/components/form-fields';
import {STAFF_PROFILE_STATUSES} from '../../../shared/mobile-staff';
function Organization(){
  const{api,session}=useSession(),theme=useTheme(),[store,setStore]=useState(session!.user.allStores?'all':String(session!.user.storeId||'all')),[input,setInput]=useState(''),[departed,setDeparted]=useState(false),search=useDebouncedValue(input);
  const query=useQuery({queryKey:['staff-organization',api!.origin,session!.user.id,session!.user.storeId,session!.user.allStores,store,search,departed],queryFn:({signal})=>api!.staffOrganization(new URLSearchParams({store,search,departed:departed?'1':'0'}).toString(),signal)});
  const sections=(query.data?.sections||[]).map(section=>({...section,data:section.people}));
  return <SectionList sections={sections} keyExtractor={person=>String(person.id)} stickySectionHeadersEnabled={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,paddingBottom:40,gap:12,maxWidth:760,width:'100%',alignSelf:'center'}}
    refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={()=>void query.refetch()} tintColor={theme.primary}/>}
    ListHeaderComponent={<View style={{gap:16}}><Text accessibilityRole="header" style={{color:theme.text,fontSize:26,fontWeight:'800'}}>Sơ đồ nhân sự</Text><Text style={{color:theme.muted,lineHeight:24}}>Theo bộ phận và cơ sở. Chọn nhân sự để xem hồ sơ hoặc chỉnh sửa theo quyền.</Text>
      <FormField label="Tìm nhân sự trên sơ đồ" value={input} onChangeText={setInput} maxLength={120}/>
      <ChoiceField label="Cơ sở trên sơ đồ" value={store} choices={[...(session!.user.allStores?[{value:'all',label:'Tất cả cơ sở'}]:[]),...(query.data?.stores||[]).map(s=>({value:String(s.id),label:s.name}))]} searchable onChange={setStore}/>
      <Pressable accessibilityRole="switch" accessibilityLabel="Hiện nhân sự đã nghỉ việc" accessibilityState={{checked:departed}} aria-checked={departed} onPress={()=>setDeparted(!departed)} style={{padding:16,borderRadius:12,borderWidth:1,borderColor:theme.controlBorder,backgroundColor:theme.surface}}><Text style={{color:theme.text,fontSize:16}}>Hiện nhân sự đã nghỉ việc · {departed?'Bật':'Tắt'}</Text></Pressable>
      {query.data&&<Card style={{gap:8}}><Text style={{color:theme.text,fontSize:18,fontWeight:'700'}}>{query.data.total} nhân sự · {query.data.storeCount} cơ sở</Text><Text style={{color:theme.muted}}>Bình thường: {query.data.working} · Kiêm nhiệm có thể xuất hiện ở nhiều bộ phận.</Text></Card>}
      {query.isPending?<StateView title="Đang đọc sơ đồ nhân sự" loading/>:query.isError?<StateView title="Chưa đọc được sơ đồ nhân sự" message={query.error.message} retry={()=>void query.refetch()}/>:!query.data.total&&<Text style={{color:theme.muted}}>Không có nhân sự khớp tìm kiếm.</Text>}
    </View>}
    renderSectionHeader={({section})=><View style={{gap:8,paddingTop:16}}>
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:20,fontWeight:'700'}}>{section.title} · {section.people.length}</Text>
      {section.storeId!==null&&<Button secondary label={`Xem cơ sở ${section.title}`} onPress={()=>router.push({pathname:'/store/[id]',params:{id:String(section.storeId)}})}/>}
      {!section.people.length&&<Text style={{color:theme.muted}}>Chưa có nhân sự phù hợp tại cơ sở này.</Text>}
    </View>}
    renderItem={({item})=><Pressable accessibilityRole="button" accessibilityLabel={`Xem nhân sự ${item.name}`} onPress={()=>router.push({pathname:'/staff/[id]',params:{id:String(item.id)}})} style={({pressed})=>({opacity:pressed?0.7:1})}><Card style={{gap:10}}><Text style={{color:theme.text,fontSize:18,fontWeight:'700'}}>{item.name}</Text><Text style={{color:theme.muted,lineHeight:23}}>{item.code} · {item.position||'Chưa có chức vụ'}{item.storeName?` · ${item.storeName}`:' · Trụ sở công ty'}</Text>{!!item.phone&&<Text selectable style={{color:theme.text}}>{item.phone}</Text>}<StatusBadge status={item.status} label={STAFF_PROFILE_STATUSES.find(s=>s.value===item.status)?.label}/></Card></Pressable>}/>
  ;
}
export default function Screen(){const{api,session}=useSession();if(!api||!session||!session.user.permissions.includes('hr.read'))return <StateView title="Không có quyền xem sơ đồ nhân sự"/>;return <Organization key={[api.origin,session.token,session.user.storeId,session.user.allStores].join('|')}/>;}
