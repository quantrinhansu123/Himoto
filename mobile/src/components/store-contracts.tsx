import {useState} from 'react';
import {ScrollView,Text} from 'react-native';
import {router} from 'expo-router';
import {useQuery} from '@tanstack/react-query';
import {useSession} from '@/providers/session';
import {useDebouncedValue} from '@/hooks/use-debounced-value';
import {dateTime,money,useTheme} from '@/theme';
import {Button,Card,StateView,StatusBadge} from './ui';
import {FormField} from './form-fields';
import {contextualStatusLabel} from '@/lib/catalogue-config';
export function StoreContracts({id}:{id:string}){
  const{api,session}=useSession(),theme=useTheme(),[input,setInput]=useState(''),[page,setPage]=useState(1),search=useDebouncedValue(input);
  const query=useQuery({queryKey:['store-contracts',api!.origin,session!.user.id,session!.user.storeId,session!.user.allStores,id,search,page],queryFn:({signal})=>api!.storeContracts(id,new URLSearchParams({search,page:String(page)}).toString(),signal)});
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,paddingBottom:40,gap:16,maxWidth:760,width:'100%',alignSelf:'center'}}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:'800'}}>Hợp đồng · {query.data?.name||'Cơ sở'}</Text>
    <Text style={{color:theme.muted,lineHeight:24}}>Theo cơ sở tạo hợp đồng, gồm hồ sơ đã kết thúc. Tổng tiền và công nợ tính trên toàn bộ hợp đồng của cơ sở.</Text>
    {query.data&&<Card style={{gap:10}}><Text style={{color:theme.text,fontSize:19,fontWeight:'700'}}>{query.data.summary.count} hợp đồng</Text><Text style={{color:theme.text}}>Tổng tiền: {money(query.data.summary.total)}</Text><Text style={{color:theme.text}}>Đã thu: {money(query.data.summary.paid)}</Text><Text style={{color:theme.text}}>Còn nợ: {money(query.data.summary.debt)}</Text></Card>}
    <FormField label="Tìm hợp đồng của cơ sở" value={input} onChangeText={v=>{setInput(v);setPage(1);}} maxLength={120}/>
    {query.isPending?<StateView title="Đang đọc hợp đồng cơ sở" loading/>:query.isError?<StateView title="Chưa đọc được hợp đồng cơ sở" message={query.error.message} retry={()=>void query.refetch()}/>:<>
      <Text style={{color:theme.muted}}>{query.data.total} kết quả · Trang {query.data.page}/{query.data.pages}</Text>
      {query.data.rows.map(r=><Card key={r.id} style={{gap:12}}><Text style={{color:theme.text,fontSize:18,fontWeight:'700'}}>{r.code} · {r.customer||'Chưa có tên'}</Text><StatusBadge status={r.status} label={contextualStatusLabel('contracts',r.status)}/><Text style={{color:theme.muted,lineHeight:24}}>{r.license||'Chưa có xe'}{r.startsAt?` · ${dateTime(r.startsAt)}`:''}{r.endsAt?` → ${dateTime(r.endsAt)}`:''}</Text><Text style={{color:theme.text}}>Tổng {money(r.total)} · Đã thu {money(r.paid)}</Text><Button secondary label={`Mở hợp đồng ${r.code}`} onPress={()=>router.push({pathname:'/record/[kind]/[id]',params:{kind:'contracts',id:String(r.id)}})}/></Card>)}
      {!query.data.rows.length&&<Text style={{color:theme.muted}}>Không có hợp đồng khớp tìm kiếm.</Text>}
      <Button secondary label="Trang hợp đồng cơ sở trước" disabled={query.isFetching||query.data.page<=1} onPress={()=>setPage(query.data.page-1)}/><Button secondary label="Trang hợp đồng cơ sở tiếp" disabled={query.isFetching||query.data.page>=query.data.pages} onPress={()=>setPage(query.data.page+1)}/>
    </>}
    <Button secondary label="Tải lại hợp đồng cơ sở" loading={query.isFetching} onPress={()=>void query.refetch()}/>
  </ScrollView>;
}
