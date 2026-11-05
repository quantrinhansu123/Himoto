import {useEffect,useRef,useState} from 'react';
import {Text,View} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import type {MobileDraftCustomer} from '../../../shared/mobile-contract';
import {batteryCustomerValues,batteryCustomerSnapshot,missingBatteryCustomer,type BatteryCustomerValues} from '../../../shared/battery-customer';
import {useSession} from '@/providers/session';
import {useTheme} from '@/theme';
import {Button,Card,InlineError} from './ui';
import {ChoiceField,FormField} from './form-fields';

export function BatteryStaffPicker({value,onChange,disabled}:{value:string;onChange:(name:string)=>void;disabled:boolean}){
  const{api,session}=useSession(),theme=useTheme(),query=useQuery({queryKey:['battery-staff',api!.origin,session!.user.id,session!.user.storeId,session!.user.allStores],queryFn:({signal})=>api!.batteryStaff(signal),retry:false});
  return <View style={{gap:12}}><FormField label="Nhân viên ký hợp đồng pin" value={value} onChangeText={onChange} editable={!disabled} maxLength={120}/>
    <ChoiceField label="Gợi ý nhân viên ký hợp đồng pin" value="" choices={[{value:'',label:query.isPending?'Đang đọc nhân viên…':'Chọn nhân viên hoặc nhập trực tiếp'},...(query.data?.rows||[]).map(p=>({value:String(p.id),label:p.name}))]} disabled={disabled||query.isPending||query.isError} searchable onChange={id=>{const person=query.data?.rows.find(p=>String(p.id)===id);if(person)onChange(person.name);}}/>
    {query.isError&&<><InlineError message={query.error.message}/><Button secondary label="Tải lại gợi ý nhân viên pin" disabled={disabled} onPress={()=>void query.refetch()}/></>}
    <Text style={{color:theme.muted,fontSize:13,lineHeight:21}}>Chọn gợi ý chỉ điền tên nhân viên trên hợp đồng. Có thể tiếp tục sửa tên đang nhập.</Text>
  </View>;
}
export function BatteryCustomerPicker({value,onChange,disabled}:{value:BatteryCustomerValues;onChange:(next:BatteryCustomerValues)=>void;disabled:boolean}){
  const{api,session}=useSession(),theme=useTheme(),[input,setInput]=useState(()=>value.customer_id_card||value.customer_phone||''),[retry,setRetry]=useState(0),[state,setState]=useState<'idle'|'loading'|'found'|'matches'|'missing'|'error'>(value.customer_id?'found':'idle'),[matches,setMatches]=useState<MobileDraftCustomer[]>([]),[error,setError]=useState(''),[hasMore,setHasMore]=useState(false),[kept,setKept]=useState(false),latest=useRef({value,onChange,disabled}),skipInitial=useRef(true);
  useEffect(()=>{latest.current={value,onChange,disabled};},[value,onChange,disabled]);
  const allowed=session!.user.permissions.includes('customers.read');
  useEffect(()=>{
    if(skipInitial.current){skipInitial.current=false;return;}
    const digits=input.replace(/\D/g,'');
    if(!allowed||disabled||digits.length<9||digits.length>13)return;
    const snapshot=batteryCustomerSnapshot(latest.current.value),controller=new AbortController(),timer=setTimeout(()=>{
      setState('loading');setError('');setKept(false);setMatches([]);setHasMore(false);
      void api!.draftCustomer({query:digits},controller.signal).then(result=>{
        if(controller.signal.aborted||latest.current.disabled)return;
        setHasMore(result.hasMore);
        const unchanged=snapshot===batteryCustomerSnapshot(latest.current.value);
        if(result.rows.length===1&&!result.hasMore&&unchanged){latest.current.onChange(batteryCustomerValues(result.rows[0].id,result.rows[0].details));setState('found');}
        else if(result.rows.length){setMatches(result.rows);setState('matches');setKept(!unchanged);}
        else{setState('missing');if(unchanged)latest.current.onChange(missingBatteryCustomer(latest.current.value,digits));else setKept(true);}
      }).catch(cause=>{if(!controller.signal.aborted){setError((cause as Error).message);setState('error');}});
    },350);
    return()=>{clearTimeout(timer);controller.abort();};
  },[api,input,retry,allowed,disabled]);
  if(!allowed)return <Text style={{color:theme.muted,lineHeight:24}}>Tài khoản chưa có quyền tra cứu khách hàng. Nhập thông tin bên thuê trực tiếp.</Text>;
  function choose(person:MobileDraftCustomer){if(disabled)return;onChange(batteryCustomerValues(person.id,person.details));setMatches([]);setHasMore(false);setKept(false);setState('found');}
  return <View style={{gap:14}}><FormField label="Tra cứu CCCD hoặc SĐT khách thuê pin" value={input} onChangeText={next=>{setInput(next);setState('idle');setMatches([]);setHasMore(false);setKept(false);setError('');}} editable={!disabled} keyboardType="number-pad" maxLength={32} hint="Nhập đủ 9–13 số để tra cứu chính xác trên tất cả cơ sở."/>
    <Text accessibilityLiveRegion="polite" style={{color:theme.muted,lineHeight:24}}>{state==='loading'?'Đang tra cứu khách hàng…':state==='found'?`Đã chọn khách hàng #${value.customer_id} · Thông tin đã tự điền`:state==='missing'?'Chưa có khách hàng này trong hệ thống. Nhập thông tin bên thuê bên dưới.':state==='matches'?`Tìm thấy ${matches.length} hồ sơ. Chọn đúng khách hàng bên dưới.`:'Nhập CCCD/CMND hoặc số điện thoại để tự điền thông tin khách.'}</Text>
    {kept&&<Text style={{color:theme.muted,lineHeight:24}}>Đã giữ thông tin anh vừa sửa trong khi tra cứu. Chọn hồ sơ bên dưới nếu muốn thay thông tin bên thuê.</Text>}
    {matches.map(person=><Card key={person.id} style={{gap:10}}><Text style={{color:theme.text,fontSize:18,fontWeight:'700'}}>{person.details.name||'Chưa có tên'} · #{person.id}</Text><Text style={{color:theme.muted,lineHeight:23}}>{person.details.phone||'Chưa có SĐT'} · CCCD {person.details.id_card||'Chưa có'} · {person.storeName||'Chưa có cơ sở'}</Text><Button secondary label={`Chọn khách thuê pin #${person.id}`} disabled={disabled} onPress={()=>choose(person)}/></Card>)}
    {hasMore&&<Text style={{color:theme.muted,lineHeight:24}}>Còn hồ sơ cùng thông tin tra cứu. Kiểm tra mã khách và cơ sở trước khi chọn.</Text>}
    {state==='error'&&<><InlineError message={error}/><Button secondary label="Tra cứu lại khách thuê pin" disabled={disabled} onPress={()=>setRetry(n=>n+1)}/></>}
  </View>;
}
