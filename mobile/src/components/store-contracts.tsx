import {useState} from 'react';
import {Pressable,ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {useSession} from '@/providers/session';
import {useDebouncedValue} from '@/hooks/use-debounced-value';
import {dateTime,money,statuses,useTheme} from '@/theme';
import {Button,Card,Chip,KeyValueRow,PaginationBar,SkeletonList,StateView,StatusBadge} from './ui';
import {FormField} from './form-fields';
import {FileExportButton} from './file-export-button';
import {contextualStatusLabel} from '@/lib/catalogue-config';
export function StoreContracts({id}:{id:string}){
  const{api,session}=useSession(),theme=useTheme(),[input,setInput]=useState(''),[statusFilter,setStatusFilter]=useState(''),[page,setPage]=useState(1),search=useDebouncedValue(input);
  const query=useQuery({queryKey:['store-contracts',api!.origin,session!.user.id,session!.user.storeId,session!.user.allStores,id,search,statusFilter,page],queryFn:({signal})=>api!.storeContracts(id,new URLSearchParams({search,page:String(page),...(statusFilter?{status:statusFilter}:{})}).toString(),signal)});
  const visibleRows=query.data?.rows||[];
  return <SafeAreaView edges={['bottom','left','right']} style={{flex:1,backgroundColor:theme.background}}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,paddingBottom:40,gap:12,maxWidth:760,width:'100%',alignSelf:'center'}}>
    <View style={{gap:2}}>
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:20,fontWeight:'800'}}>Hợp đồng · {query.data?.name||'Cơ sở'}</Text>
      <Text style={{color:theme.muted,fontSize:12.5,lineHeight:18}}>Theo cơ sở tạo hợp đồng, gồm hồ sơ đã kết thúc.</Text>
    </View>
    {query.data&&<Card style={{gap:4,padding:14}}>
      <KeyValueRow label="Tổng số hợp đồng" value={`${query.data.summary.count} hợp đồng`} emphasize/>
      <KeyValueRow label="Tổng giá trị" value={money(query.data.summary.total)}/>
      <KeyValueRow label="Đã thu" value={money(query.data.summary.paid)} valueColor={theme.success}/>
      <KeyValueRow label="Còn nợ" value={money(query.data.summary.debt)} emphasize valueColor={query.data.summary.debt>0?theme.danger:theme.text}/>
    </Card>}
    {!!query.data?.statusCounts?.length&&<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:7}}>
      {[['',query.data.summary.count] as const,...query.data.statusCounts].map(([st,cnt])=>{
        const active=statusFilter===st;
        const label=st?contextualStatusLabel('contracts',st)||statuses[st]||st:'Tất cả';
        return <Chip key={st||'all'} label={label} count={cnt} selected={active} onPress={()=>{setStatusFilter(st);setPage(1);}}/>;
      })}
    </ScrollView>}
    <FormField label="Tìm hợp đồng của cơ sở" value={input} onChangeText={v => { setInput(v); setPage(1); }} maxLength={120} />
    {query.data && !!visibleRows.length && <FileExportButton
      label={`Tải Excel hợp đồng cơ sở (${visibleRows.length})`}
      disabled={query.isFetching}
      load={signal => api!.exportWorkbook({
        filename: `himoto-hop-dong-co-so-${id}`,
        headers: ['Mã hợp đồng', 'Khách hàng', 'Trạng thái', 'Biển số', 'Bắt đầu', 'Kết thúc', 'Tổng tiền', 'Đã thu', 'Còn nợ'],
        rows: visibleRows.map(r => [r.code, r.customer, contextualStatusLabel('contracts', r.status) || r.status, r.license, r.startsAt, r.endsAt, r.total, r.paid, Math.max(0, r.total - r.paid)]),
      }, signal)}
    />}
    {query.isPending?<SkeletonList count={4} lines={3}/>:query.isError?<StateView title="Chưa đọc được hợp đồng cơ sở" message={query.error.message} retry={()=>void query.refetch()}/>:<>
      {visibleRows.map(r=><Pressable key={r.id} accessibilityRole="button" onPress={()=>router.push({pathname:'/record/[kind]/[id]',params:{kind:'contracts',id:String(r.id)}})}>
        <Card style={{gap:6,padding:13}}>
          <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8}}>
            <Text style={{color:theme.primary,fontSize:15,fontWeight:'800',flex:1}}>{r.code} · {r.customer||'Chưa có tên'}</Text>
            <StatusBadge status={r.status} label={contextualStatusLabel('contracts',r.status)}/>
          </View>
          <KeyValueRow label="Xe / Thời hạn" value={`${r.license||'Chưa có xe'}${r.startsAt?` · ${dateTime(r.startsAt)}`:''}${r.endsAt?` → ${dateTime(r.endsAt)}`:''}`}/>
          <KeyValueRow label="Tổng / Đã thu" value={`${money(r.total)} / ${money(r.paid)}`} emphasize/>
        </Card>
      </Pressable>)}
      {!visibleRows.length&&<StateView title="Không có hợp đồng khớp bộ lọc"/>}
      <PaginationBar page={query.data.page} pages={query.data.pages} total={query.data.total} unit="hợp đồng" disabled={query.isFetching} onChange={setPage}/>
    </>}
    <Button size="sm" secondary label="Tải lại hợp đồng cơ sở" loading={query.isFetching} onPress={()=>void query.refetch()}/>
  </ScrollView></SafeAreaView>;
}
