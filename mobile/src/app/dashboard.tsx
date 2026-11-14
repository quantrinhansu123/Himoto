import {useCallback,useState} from 'react';
import {ScrollView,RefreshControl,Text,View} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {DASHBOARD_PRESETS,DASHBOARD_METRICS,dashboardPeriod} from '../../../shared/mobile-dashboard';
import {vietnamDate} from '../../../shared/vietnam-date';
import {useSession} from '@/providers/session';
import {useWorkspace} from '@/hooks/use-workspace';
import {money,useTheme} from '@/theme';
import {Button,Card,StateView} from '@/components/ui';
import {ChoiceField} from '@/components/form-fields';
import {DateField} from '@/components/date-field';
function Dashboard(){
  const{api,session}=useSession(),theme=useTheme(),workspace=useWorkspace(),[today,setToday]=useState(vietnamDate),[from,setFrom]=useState(()=>`${vietnamDate().slice(0,7)}-01`),[to,setTo]=useState(vietnamDate),[store,setStore]=useState(session!.user.allStores?'all':String(session!.user.storeId||'all'));
  const filters=new URLSearchParams({from,to,store_id:store}).toString(),query=useQuery({queryKey:['dashboard',api!.origin,session!.user.id,session!.user.storeId,session!.user.allStores,filters],queryFn:({signal})=>api!.dashboard(filters,signal),retry:false});
  const refetch=query.refetch;
  useFocusEffect(useCallback(()=>{setToday(vietnamDate());void refetch();},[refetch]));
  const active=DASHBOARD_PRESETS.find(p=>{const[a,b]=dashboardPeriod(p.id,today);return a===from&&b===to;})?.id||'custom';
  return <ScrollView refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={()=>void query.refetch()} tintColor={theme.primary}/>} contentContainerStyle={{padding:20,paddingBottom:40,gap:18,maxWidth:760,width:'100%',alignSelf:'center'}}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:26,fontWeight:'800'}}>Tổng quan giao dịch</Text><Text style={{color:theme.muted,lineHeight:24}}>Số hợp đồng, doanh số, doanh thu và phí sửa chữa theo cơ sở trong kỳ.</Text>
    <Card style={{gap:16}}><ChoiceField label="Kỳ Tổng quan giao dịch" value={active} choices={[...DASHBOARD_PRESETS.map(p=>({value:p.id,label:p.label})),{value:'custom',label:'Tùy chọn'}]} onChange={v=>{const preset=DASHBOARD_PRESETS.find(p=>p.id===v);if(preset){const[a,b]=dashboardPeriod(preset.id,today);setFrom(a);setTo(b);}}}/>
      <DateField label="Tổng quan từ ngày" value={from} onChange={v=>{if(v){setFrom(v);if(v>to)setTo(v);}}}/><DateField label="Tổng quan đến ngày" value={to} onChange={v=>{if(v){setTo(v);if(v<from)setFrom(v);}}}/>
      <ChoiceField label="Cơ sở Tổng quan giao dịch" value={store} choices={[...(session!.user.allStores?[{value:'all',label:'Tất cả cơ sở'}]:[]),...(workspace.data?.stores||[]).filter(s=>session!.user.allStores||s.id===session!.user.storeId).map(s=>({value:String(s.id),label:s.name}))]} searchable onChange={setStore}/><Button secondary label="Tải lại Tổng quan giao dịch" loading={query.isFetching} onPress={()=>void query.refetch()}/>
    </Card>
    {query.isPending?<StateView title="Đang đọc Tổng quan giao dịch" loading/>:query.isError?<StateView title="Chưa đọc được Tổng quan giao dịch" message={query.error.message} retry={()=>void query.refetch()}/>:<>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{DASHBOARD_METRICS.map(m=><Card key={m.key} style={{flexBasis:'46%',flexGrow:1,gap:10,minWidth:140}}><Text style={{color:theme.muted,fontSize:14}}>{m.label}</Text><Text style={{color:m.key==='overdue_contracts'?theme.danger:theme.text,fontSize:23,fontWeight:'800'}}>{m.money?money(query.data.total[m.key]):query.data.total[m.key].toLocaleString('vi-VN')}</Text><Text style={{color:theme.muted,fontSize:13,lineHeight:20}}>{m.hint}</Text></Card>)}</View>
      <Text style={{color:theme.muted,lineHeight:24}}>Số HĐ / thuê / sở hữu / quá hạn / doanh số theo ngày bắt đầu thuê. Doanh thu và chi phí sửa theo ngày thu/chi thực tế trên sổ quỹ; doanh thu không gồm cọc và phí sửa chữa.</Text>
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:21,fontWeight:'700'}}>Tổng hợp theo cơ sở</Text>
      {query.data.rows.map(row=><Card key={row.key} style={{gap:12}}><Text style={{color:theme.text,fontSize:19,fontWeight:'700'}}>{row.name}</Text>{DASHBOARD_METRICS.map(m=><View key={m.key} style={{flexDirection:'row',justifyContent:'space-between',gap:16}}><Text style={{color:theme.muted,flex:1}}>{m.label}</Text><Text style={{color:theme.text,fontWeight:'600',flexShrink:1}}>{m.money?money(row[m.key]):row[m.key].toLocaleString('vi-VN')}</Text></View>)}</Card>)}
      {!query.data.rows.length&&<Text style={{color:theme.muted}}>Không có giao dịch trong kỳ.</Text>}
    </>}
  </ScrollView>;
}
export default function Screen(){const{api,session}=useSession();if(!api||!session||!session.user.permissions.includes('contracts.read'))return <StateView title="Không có quyền xem Tổng quan giao dịch"/>;return <Dashboard key={[api.origin,session.token,session.user.storeId,session.user.allStores].join('|')}/>;}
