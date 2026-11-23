import {useCallback,useState} from 'react';
import {ScrollView,RefreshControl,Text,View} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {SafeAreaView} from 'react-native-safe-area-context';
import {SlidersHorizontal} from 'lucide-react-native';
import {DASHBOARD_PRESETS,DASHBOARD_METRICS,dashboardPeriod} from '../../../shared/mobile-dashboard';
import {vietnamDate} from '../../../shared/vietnam-date';
import {useSession} from '@/providers/session';
import {useGlobalBranch} from '@/providers/branch';
import {useWorkspace} from '@/hooks/use-workspace';
import {money,useTheme} from '@/theme';
import {Button,Card,Chip,KeyValueRow,SkeletonList,StateView} from '@/components/ui';
import {ChoiceField} from '@/components/form-fields';
import {FileExportButton} from '@/components/file-export-button';
import {DateField} from '@/components/date-field';
function Dashboard(){
  const{api,session}=useSession(),theme=useTheme(),workspace=useWorkspace(),canReadAll=Boolean(session!.user.allStores||session!.user.allStoresRead);
  const defaultStore=canReadAll?'all':String(session!.user.storeId||'all');
  const{selectedStore:globalStore,selectStore:setGlobalStore}=useGlobalBranch(defaultStore);
  const store=canReadAll?(globalStore||defaultStore):defaultStore;
  const setStore=(next:string)=>{if(canReadAll)setGlobalStore(next);};
  const[today,setToday]=useState(vietnamDate),[from,setFrom]=useState(()=>`${vietnamDate().slice(0,7)}-01`),[to,setTo]=useState(vietnamDate),[filtersOpen,setFiltersOpen]=useState(false);
  const filters=new URLSearchParams({from,to,store_id:store}).toString(),query=useQuery({queryKey:['dashboard',api!.origin,session!.user.id,session!.user.storeId,session!.user.allStores,session!.user.allStoresRead,filters],queryFn:({signal})=>api!.dashboard(filters,signal),retry:false});
  const refetch=query.refetch;
  useFocusEffect(useCallback(()=>{setToday(vietnamDate());void refetch();},[refetch]));
  const active=DASHBOARD_PRESETS.find(p=>{const[a,b]=dashboardPeriod(p.id,today);return a===from&&b===to;})?.id||'custom';
  const storeName=store==='all'?'Tất cả cơ sở':(workspace.data?.stores||[]).find(s=>String(s.id)===store)?.name||'Cơ sở được phân công';
  return <SafeAreaView edges={['bottom','left','right']} style={{flex:1,backgroundColor:theme.background}}><ScrollView refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={()=>void query.refetch()} tintColor={theme.primary}/>} contentContainerStyle={{padding:16,paddingBottom:36,gap:12,maxWidth:760,width:'100%',alignSelf:'center'}}>
    <Text style={{color:theme.muted,fontSize:13}}>{storeName} · {from.split('-').reverse().join('/')} → {to.split('-').reverse().join('/')}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:7}}>
      {DASHBOARD_PRESETS.map(p=><Chip key={p.id} label={p.label} selected={active===p.id} onPress={()=>{const[a,b]=dashboardPeriod(p.id,today);setFrom(a);setTo(b);}}/>)}
      <Chip label={filtersOpen?'Ẩn bộ lọc':'Tùy chỉnh & Cơ sở'} selected={filtersOpen||active==='custom'} icon={<SlidersHorizontal size={14} color={filtersOpen||active==='custom'?theme.primary:theme.text}/>} onPress={()=>setFiltersOpen(v=>!v)}/>
    </ScrollView>
    {filtersOpen&&<Card style={{gap:12}}>
      <View style={{flexDirection:'row',gap:8}}>
        <View style={{flex:1}}><DateField label="Từ ngày" value={from} onChange={v=>{if(v){setFrom(v);if(v>to)setTo(v);}}}/></View>
        <View style={{flex:1}}><DateField label="Đến ngày" value={to} onChange={v=>{if(v){setTo(v);if(v<from)setFrom(v);}}}/></View>
      </View>
      <ChoiceField label="Cơ sở" value={store} choices={[...(canReadAll?[{value:'all',label:'Tất cả cơ sở'}]:[]),...(workspace.data?.stores||[]).filter(s=>canReadAll||s.id===session!.user.storeId).map(s=>({value:String(s.id),label:s.name}))]} searchable onChange={setStore}/>
      <Button size="sm" secondary label="Tải lại" loading={query.isFetching} onPress={()=>void query.refetch()}/>
    </Card>}
    {query.isPending?<SkeletonList count={4} lines={3}/>:query.isError?<StateView title="Chưa đọc được Tổng quan giao dịch" message={query.error.message} retry={()=>void query.refetch()}/>:<>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:9}}>{DASHBOARD_METRICS.map(m=><Card key={m.key} style={{flexBasis:m.money?'100%':'47%',flexGrow:1,gap:4,minWidth:140,padding:13}}><Text style={{color:theme.muted,fontSize:12.5}}>{m.label}</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={{color:m.key==='overdue_contracts'?theme.danger:theme.text,fontSize:20,fontWeight:'800'}}>{m.money?money(query.data.total[m.key]):query.data.total[m.key].toLocaleString('vi-VN')}</Text><Text style={{color:theme.muted,fontSize:11.5,lineHeight:16}}>{m.hint}</Text></Card>)}</View>
      <Text style={{color:theme.muted,fontSize:12,lineHeight:18}}>Số HĐ / thuê / sở hữu / quá hạn / doanh số theo ngày bắt đầu thuê. Doanh thu và chi phí sửa theo ngày thu/chi thực tế trên sổ quỹ; doanh thu không gồm cọc và phí sửa chữa.</Text>
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:17,fontWeight:'800'}}>Tổng hợp theo cơ sở</Text>
      <FileExportButton key={filters} disabled={query.isFetching||query.isError||!query.data?.rows.length} load={signal=>api!.dashboardExport(filters,signal)}/>
      {query.data.rows.map(row=><Card key={row.key} style={{gap:4}}><Text style={{color:theme.text,fontSize:16,fontWeight:'800',marginBottom:4}}>{row.name}</Text>{DASHBOARD_METRICS.map(m=><KeyValueRow key={m.key} label={m.label} strong={m.money} valueColor={m.key==='overdue_contracts'&&row[m.key]>0?theme.danger:undefined} value={m.money?money(row[m.key]):row[m.key].toLocaleString('vi-VN')}/>)}</Card>)}
      {!query.data.rows.length&&<Text style={{color:theme.muted}}>Không có giao dịch trong kỳ.</Text>}
    </>}
  </ScrollView></SafeAreaView>;
}
export default function Screen(){const{api,session}=useSession();if(!api||!session||!session.user.permissions.includes('contracts.read'))return <StateView title="Không có quyền xem Tổng quan giao dịch"/>;return <Dashboard key={[api.origin,session.token,session.user.storeId,session.user.allStores,session.user.allStoresRead].join('|')}/>;}
