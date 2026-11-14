import {useEffect,useRef,useState} from 'react';
import {router} from 'expo-router';
import {FlatList,Linking,RefreshControl,ScrollView,Text,View} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import {uuid} from 'expo';
import {Image} from 'expo-image';
import {useSession} from '@/providers/session';
import {useWorkspace} from '@/hooks/use-workspace';
import {Button,Card,InlineError,StateView} from '@/components/ui';
import {ChoiceField} from '@/components/form-fields';
import {DateField} from '@/components/date-field';
import {EditorSheet} from '@/components/editor-sheet';
import {captureAttendancePhoto,locateAttendance} from '@/lib/attendance-capture';
import {loadAttendancePending,storeAttendancePending,clearAttendancePending,discardAttendancePending,refreshAttendancePendingLocation,type AttendancePending} from '@/lib/attendance-pending';
import type {RecordMediaPhoto} from '@/lib/record-media-photo';
import {supportFormData} from '@/lib/support-form-data';
import {dutyToday} from '../../../shared/mobile-duty-roster';
import type {AttendanceLocation} from '../../../shared/mobile-support';
import {dateTime,useTheme} from '@/theme';

export default function Attendance() {
  const {api,session}=useSession(),workspace=useWorkspace(),theme=useTheme();
  const actor=session!.user.id,origin=api!.origin;
  const today=dutyToday(),[from,setFrom]=useState(today.slice(0,7)+'-01'),[to,setTo]=useState(today),[store,setStore]=useState('all'),[page,setPage]=useState(1);
  const [action,setAction]=useState<'in'|'out'|null>(null),[photo,setPhoto]=useState<RecordMediaPhoto|null>(null),[location,setLocation]=useState<AttendanceLocation|null>(null);
  const [pending,setPending]=useState<AttendancePending|null>(null),[restoring,setRestoring]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[evidence,setEvidence]=useState<string|null>(null);
  const lock=useRef(false),alive=useRef(true),camera=useRef<AbortController|null>(null),currentPhoto=useRef(photo);
  useEffect(()=>{currentPhoto.current=photo;},[photo]);
  const canReview=session!.user.permissions.includes('hr.read');
  const query=useQuery({queryKey:['attendance',session!.user.id,session!.user.storeId,session!.user.permissions.join(','),from,to,store,page],queryFn:({signal})=>api!.attendance(new URLSearchParams({from,to,store,page:String(page)}).toString(),signal),enabled:!!api&&from<=to});
  useEffect(()=>{alive.current=true;void loadAttendancePending(actor,origin).then(value=>{if(alive.current)setPending(value);}).catch(failure=>{if(alive.current)setError(failure.message);}).finally(()=>{if(alive.current)setRestoring(false);});return()=>{alive.current=false;camera.current?.abort();currentPhoto.current?.dispose();};},[actor,origin]);
  async function run(job:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await job();}catch(failure){if(alive.current)setError((failure as Error).message);}finally{lock.current=false;if(alive.current)setBusy(false);}}
  async function acknowledge(id:string){await clearAttendancePending(session!.user.id,id);setPending(null);setAction(null);setLocation(null);photo?.dispose();setPhoto(null);setNotice('Máy chủ đã xác nhận chấm công.');await query.refetch();}
  async function resolve(){if(!pending)return;const result=await api!.resolveAttendance(pending.id);if(result.result)await acknowledge(pending.id);else setNotice('Máy chủ chưa ghi nhận mã này. Thử lại cùng lần chấm; không tạo mã mới.');}
  async function restartFromPending(){
    if(!pending)return;
    const targetAction=pending.action;
    try {
      const result=await api!.resolveAttendance(pending.id);
      if(result.result){await acknowledge(pending.id);return;}
    } catch {}
    await discardAttendancePending(session!.user.id,pending.id);
    setPending(null);
    setNotice('');
    setError('');
    setAction(targetAction);
  }
  async function save(){
    let attempt=pending;
    if(!attempt){
      if(!action||!photo||!location)throw Error('Chụp ảnh và lấy vị trí trước khi xác nhận.');
      const gps=Math.abs(Date.now()-location.timestamp)>4*60000?await locateAttendance():location;
      attempt=await storeAttendancePending(session!.user.id,api!.origin,{id:uuid.v4().toLowerCase(),action,photo,location:gps});setPending(attempt);
    }else{
      const result=await api!.resolveAttendance(attempt.id);
      if(result.result){await acknowledge(attempt.id);return;}
      if(Math.abs(Date.now()-attempt.location.timestamp)>4*60000){
        const refreshed=await locateAttendance();
        attempt=await refreshAttendancePendingLocation(actor,origin,attempt.id,refreshed);setPending(attempt);
      }
    }
    if(attempt.photo.size<=0)throw Error('Ảnh chấm công chờ không còn trên máy. Bấm "Chụp lại ảnh" để tạo lần chấm mới.');
    const body=await supportFormData({action:attempt.action,request_id:attempt.id,location:JSON.stringify(attempt.location)},attempt.photo);
    await api!.clockAttendance(body);await acknowledge(attempt.id);
  }
  const copy=(text:string)=><Text style={{color:theme.muted,fontSize:15,lineHeight:23}}>{text}</Text>;
  return <>
    <FlatList data={query.data?.rows||[]} keyExtractor={row=>String(row.id)} contentContainerStyle={{padding:20,gap:16,maxWidth:800,width:'100%',alignSelf:'center'}} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={()=>{void query.refetch();}} tintColor={theme.primary}/>}
      ListHeaderComponent={<View style={{gap:18}}>
        <Button secondary label="Đăng ký ca làm việc tuần tới" disabled={busy} onPress={()=>router.push("/self-shift-registration")}/>
        <Button secondary label="Cài đặt GPS chấm công" disabled={busy} onPress={()=>router.push('/attendance-locations')}/>
        <Text accessibilityRole="header" style={{color:theme.text,fontSize:28,fontWeight:'800'}}>Chấm công</Text>
        <Card style={{gap:14}}>
          <Text style={{color:theme.text,fontSize:20,fontWeight:'700'}}>{query.data?.staff?.name||session!.user.name}</Text>
          {copy(query.data?.open?'Đang trong ca · Vào lúc '+dateTime(query.data.open.clock_in_at):'Chưa có ca đang mở')}
          {query.data?.shift&&copy(`Ca ${query.data.shift.shift_name} · ${dateTime(query.data.shift.starts_at)} → ${dateTime(query.data.shift.ends_at)}`)}
          {query.data?.late_minutes!==null&&query.data?.late_minutes!==undefined&&copy(query.data.late_minutes?`Đi muộn ${query.data.late_minutes} phút`:'Đúng giờ theo lịch ca')}
          {pending?<><InlineError message={`Có lần ${pending.action==='in'?'vào':'ra'} ca chưa xác nhận. Giữ mã ${pending.id} để đối chiếu.`}/><Button label="Đối chiếu lần chấm đang chờ" loading={busy} onPress={()=>{void run(resolve);}}/><Button secondary label="Thử lại cùng lần chấm công" disabled={busy} onPress={()=>{void run(save);}}/><Button secondary label={`Chụp lại ảnh để ${pending.action==='in'?'vào ca':'ra ca'} ngay`} disabled={busy} onPress={()=>{void run(restartFromPending);}}/></>:<Button label={query.data?.open?'Ra ca':'Vào ca'} disabled={restoring||busy||query.isError||!query.data?.staff} onPress={()=>{setAction(query.data?.open?'out':'in');setError('');setNotice('');}}/>}
          {query.data&&!query.data.staff&&copy('Tài khoản chưa liên kết với một nhân viên đang hoạt động. Liên hệ quản lý nhân sự.')}
          {copy('Chấm công cần mạng, ảnh hiện tại và GPS. Giờ được ghi theo máy chủ; ảnh không tự gửi nền.')}
        </Card>
        {!!notice&&<Text accessibilityLiveRegion="polite" style={{color:theme.success,lineHeight:23}}>{notice}</Text>}
        {!!error&&!action&&<InlineError message={error}/>}
        <Card style={{gap:14}}><Text accessibilityRole="header" style={{color:theme.text,fontSize:19,fontWeight:'700'}}>Lịch sử chấm công</Text>
          <DateField label="Từ ngày chấm công" value={from} onChange={value=>{setFrom(value);setPage(1);}}/>
          <DateField label="Đến ngày chấm công" value={to} onChange={value=>{setTo(value);setPage(1);}}/>
          {canReview&&<ChoiceField label="Cơ sở chấm công" value={store} choices={[{value:'all',label:'Tất cả cơ sở được phép'},...(workspace.data?.stores||[]).map(item=>({value:String(item.id),label:item.name}))]} onChange={value=>{setStore(value);setPage(1);}}/>}
          {copy(canReview?'Xem lịch sử của mình và nhân sự trong phạm vi cơ sở được cấp.':'Chỉ hiển thị lịch sử của tài khoản đang đăng nhập.')}
          {from>to&&<InlineError message="Ngày kết thúc phải bằng hoặc sau ngày bắt đầu."/>}
        </Card>
        {query.isError&&<StateView title="Chưa tải được chấm công" message={query.error.message} retry={()=>{void query.refetch();}}/>}
        {query.isPending&&from<=to&&<StateView title="Đang tải chấm công" loading/>}
      </View>}
      renderItem={({item:row})=><Card style={{gap:10}}>
        <Text style={{color:theme.text,fontSize:18,fontWeight:'700'}}>{row.staff_name}</Text>
        {copy(row.store_name||'Chưa có cơ sở')}{copy(`Vào ca: ${dateTime(row.clock_in_at)}`)}{copy(row.clock_out_at?`Ra ca: ${dateTime(row.clock_out_at)}`:'Đang trong ca')}
        {row.shift_name&&copy('Ca '+row.shift_name)}{row.late_minutes!==null&&copy(row.late_minutes?`Đi muộn ${row.late_minutes} phút`:'Đúng giờ')}
        <Button secondary label={`${evidence===String(row.id)?'Ẩn':'Xem'} ảnh và GPS #${row.id}`} onPress={()=>setEvidence(current=>current===String(row.id)?null:String(row.id))}/>
        {evidence===String(row.id)&&(['in','out'] as const).map(side=>{const loc=side==='in'?row.in_location:row.out_location;return loc?<View key={side} style={{gap:8}}><Text style={{color:theme.text,fontWeight:'700'}}>{side==='in'?'Vào ca':'Ra ca'}</Text><Image cachePolicy="none" source={api!.supportPhoto('attendance',String(row.id),side)} style={{width:'100%',aspectRatio:4/3,borderRadius:12}} contentFit="contain" accessibilityLabel={`Ảnh ${side==='in'?'vào':'ra'} ca #${row.id}`}/>{copy(`GPS ${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)} · sai số ${Math.round(loc.accuracy)} m`)}<Button secondary label="Mở vị trí trên Google Maps" onPress={()=>void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${loc.latitude},${loc.longitude}`)}`)} /></View>:null;})}
      </Card>}
      ListEmptyComponent={!query.isPending&&!query.isError?<Text style={{color:theme.muted,textAlign:'center',padding:20}}>Chưa có chấm công trong khoảng ngày đã chọn.</Text>:undefined}
      ListFooterComponent={query.data&&query.data.total>50?<View style={{gap:10}}>{copy(`Trang ${query.data.page} · ${query.data.total} lần chấm công`)}<Button secondary label="Trang chấm công trước" disabled={page<=1||query.isFetching} onPress={()=>setPage(value=>value-1)}/><Button secondary label="Trang chấm công sau" disabled={page*50>=query.data!.total||query.isFetching} onPress={()=>setPage(value=>value+1)}/></View>:undefined}/>
    {action&&<EditorSheet title={action==='in'?'Chấm công vào ca':'Chấm công ra ca'} onClose={()=>{if(!busy){setAction(null);if(!pending){photo?.dispose();setPhoto(null);setLocation(null);}}}}>
      <ScrollView contentContainerStyle={{padding:20,gap:16}}>
        {copy('Chụp ảnh hiện tại và cho phép vị trí. Kiểm tra trước khi xác nhận.')}
        {(pending?.photo||photo)&&<Image cachePolicy="none" source={{uri:(pending?.photo||photo)!.uri}} style={{width:'100%',aspectRatio:4/3,borderRadius:12}} contentFit="contain" accessibilityLabel="Ảnh chấm công vừa chụp"/>}
        <Button secondary label={photo?'Chụp lại ảnh hiện tại':'Chụp ảnh hiện tại'} disabled={busy||!!pending} onPress={()=>{void run(async()=>{const controller=new AbortController();camera.current=controller;const next=await captureAttendancePhoto(controller.signal);if(next){if(!alive.current){next.dispose();return;}photo?.dispose();setPhoto(next);}});}}/>
        <Button secondary label={location?'Lấy lại GPS':'Lấy vị trí GPS'} disabled={busy||!!pending} onPress={()=>{void run(async()=>{const next=await locateAttendance();if(alive.current)setLocation(next);});}}/>
        {(pending?.location||location)&&<View style={{gap:6}}>
          {copy(`Đã lấy GPS · sai số khoảng ${Math.round((pending?.location||location)!.accuracy)} m`)}
          <Button secondary label="Xem vị trí hiện tại trên Google Maps" onPress={()=>{
            const coords=(pending?.location||location);
            if(coords)void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${coords.latitude},${coords.longitude}`)}`);
          }}/>
        </View>}
        {!!error&&<InlineError message={error}/>}
        {pending&&copy('Ảnh và mã gốc được giữ trên máy. Thử lại sẽ đối chiếu kết quả trước khi gửi.')}
        <Button label={action==='in'?'Xác nhận vào ca':'Xác nhận ra ca'} disabled={!pending&&(!photo||!location)} loading={busy} onPress={()=>{void run(save);}}/>
      </ScrollView>
    </EditorSheet>}
  </>;
}
