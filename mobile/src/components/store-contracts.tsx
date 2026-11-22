import {useState} from 'react';
import {Pressable,ScrollView,Text} from 'react-native';
import {router} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {useSession} from '@/providers/session';
import {useDebouncedValue} from '@/hooks/use-debounced-value';
import {dateTime,money,statuses,useTheme} from '@/theme';
import {Button,Card,StateView,StatusBadge} from './ui';
import {FormField} from './form-fields';
import {FileExportButton} from './file-export-button';
import {contextualStatusLabel} from '@/lib/catalogue-config';
export function StoreContracts({id}:{id:string}){
  const{api,session}=useSession(),theme=useTheme(),[input,setInput]=useState(''),[statusFilter,setStatusFilter]=useState(''),[page,setPage]=useState(1),search=useDebouncedValue(input);
  const query=useQuery({queryKey:['store-contracts',api!.origin,session!.user.id,session!.user.storeId,session!.user.allStores,id,search,page],queryFn:({signal})=>api!.storeContracts(id,new URLSearchParams({search,page:String(page)}).toString(),signal)});
  const visibleRows=(query.data?.rows||[]).filter(r=>!statusFilter||r.status===statusFilter);
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,paddingBottom:40,gap:16,maxWidth:760,width:'100%',alignSelf:'center'}}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:'800'}}>Hợp đồng · {query.data?.name||'Cơ sở'}</Text>
    <Text style={{color:theme.muted,lineHeight:24}}>Theo cơ sở tạo hợp đồng, gồm hồ sơ đã kết thúc. Tổng tiền và công nợ tính trên toàn bộ hợp đồng của cơ sở.</Text>
    {query.data&&<Card style={{gap:10}}><Text style={{color:theme.text,fontSize:19,fontWeight:'700'}}>{query.data.summary.count} hợp đồng</Text><Text style={{color:theme.text}}>Tổng tiền: {money(query.data.summary.total)}</Text><Text style={{color:theme.text}}>Đã thu: {money(query.data.summary.paid)}</Text><Text style={{color:theme.text}}>Còn nợ: {money(query.data.summary.debt)}</Text></Card>}
    {!!query.data?.statusCounts?.length&&<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>
      {[['',query.data.summary.count] as const,...query.data.statusCounts].map(([st,cnt])=>{
        const active=statusFilter===st;
        const label=st?contextualStatusLabel('contracts',st)||statuses[st]||st:'Tất cả';
        return <Pressable key={st||'all'} accessibilityRole="button" accessibilityState={{selected:active}} onPress={()=>setStatusFilter(st)} style={{paddingHorizontal:12,paddingVertical:8,borderRadius:10,borderWidth:1,borderColor:active?theme.primary:theme.border,backgroundColor:active?theme.primary:theme.surface}}>
          <Text style={{color:active?theme.primaryText:theme.text,fontWeight:'700',fontSize:13}}>{label} ({cnt})</Text>
        </Pressable>;
      })}
    </ScrollView>}
    <FormField label="Tìm hợp đồng của cơ sở" value={input} onChangeText={v=>{setInput(v);setPage(1);}} maxLength={120}/>
    {query.data&&!!visibleRows.length&&<FileExportButton
      label={`Tải Excel hợp đồng cơ sở (${visibleRows.length})`}
      disabled={query.isFetching}
      load={signal=>api!.exportWorkbook({
        filename:`himoto-hop-dong-co-so-${id}`,
        headers:['Mã hợp đồng','Khách hàng','Trạng thái','Biển số','Bắt đầu','Kết thúc','Tổng tiền','Đã thu','Còn nợ'],
        rows:visibleRows.map(r=>[r.code,r.customer,contextualStatusLabel('contracts',r.status)||r.status,r.license,r.startsAt,r.endsAt,r.total,r.paid,Math.max(0,r.total-r.paid)]),
      },signal)}
    />}
    {query.isPending?<StateView title="Đang đọc hợp đồng cơ sở" loading/>:query.isError?<StateView title="Chưa đọc được hợp đồng cơ sở" message={query.error.message} retry={()=>void query.refetch()}/>:<>
      <Text style={{color:theme.muted}}>{visibleRows.length}/{query.data.total} kết quả · Trang {query.data.page}/{query.data.pages}</Text>
      {visibleRows.map(r=><Card key={r.id} style={{gap:12}}><Text style={{color:theme.text,fontSize:18,fontWeight:'700'}}>{r.code} · {r.customer||'Chưa có tên'}</Text><StatusBadge status={r.status} label={contextualStatusLabel('contracts',r.status)}/><Text style={{color:theme.muted,lineHeight:24}}>{r.license||'Chưa có xe'}{r.startsAt?` · ${dateTime(r.startsAt)}`:''}{r.endsAt?` → ${dateTime(r.endsAt)}`:''}</Text><Text style={{color:theme.text}}>Tổng {money(r.total)} · Đã thu {money(r.paid)}</Text><Button secondary label={`Mở hợp đồng ${r.code}`} onPress={()=>router.push({pathname:'/record/[kind]/[id]',params:{kind:'contracts',id:String(r.id)}})}/></Card>)}
      {!visibleRows.length&&<Text style={{color:theme.muted}}>Không có hợp đồng khớp bộ lọc.</Text>}
      <Button secondary label="Trang hợp đồng cơ sở trước" disabled={query.isFetching||query.data.page<=1} onPress={()=>setPage(query.data.page-1)}/><Button secondary label="Trang hợp đồng cơ sở tiếp" disabled={query.isFetching||query.data.page>=query.data.pages} onPress={()=>setPage(query.data.page+1)}/>
    </>}
    <Button secondary label="Tải lại hợp đồng cơ sở" loading={query.isFetching} onPress={()=>void query.refetch()}/>
  </ScrollView>;
}
