import {FilteredListExport} from '@/components/filtered-list-export';
import {useState,useRef,useEffect,useCallback} from 'react';
import {AppState,FlatList,Pressable,ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router,useFocusEffect} from 'expo-router';
import {useQueryClient} from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import {Button,Card,InlineError,StateView} from '@/components/ui';
import {FormField,ChoiceField} from '@/components/form-fields';
import {useGps,useGpsHistory,useGpsEventOptions,useGpsSyncState} from '@/hooks/use-gps';
import {useSession} from '@/providers/session';
import {useTheme,statuses} from '@/theme';
import {gpsStopDurationLabel} from '@/lib/gps-stop-duration';
import {defaultGpsQuery,GPS_FILTER_STATES,GPS_STATE_LABELS,GPS_SYNC_STALE_MS,displayedGpsState,gpsMapLink,gpsStopEvidence,gpsStoppedDurationMs,isMobileGpsSyncState,type MobileGpsQuery,type MobileGpsRow,type MobileGpsEvent} from '../../../shared/mobile-gps';

const date=(value:string|null|undefined)=>value?new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chưa có';
const eventLabels:Record<string,string>={connection_online:'Kết nối trở lại',connection_offline:'Mất kết nối',ignition_on:'Bật khóa điện',ignition_off:'Tắt khóa điện'};
export default function GpsScreen() {
  const theme=useTheme(),{api,session}=useSession(),cache=useQueryClient();
  const [filters,setFilters]=useState<MobileGpsQuery>({...defaultGpsQuery}),[search,setSearch]=useState(''),[mode,setMode]=useState<'devices'|'events'>('devices');
  const query=useGps(filters,mode==='devices'),history=useGpsHistory(filters,mode==='events'),options=useGpsEventOptions(filters.store,mode==='events');
  const [syncing,setSyncing]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[requestedAt,setRequestedAt]=useState<string|null>(null);
  const syncState=useGpsSyncState(!!requestedAt),currentRead=mode==='devices'?query:history,refreshCurrent=currentRead.refetch;
  const alive=useRef(true),syncBusy=useRef(false),visible=useRef(false);
  const syncBaseline=useRef<{finished:string|null;success:string|null}>({finished:null,success:null});
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const data=query.isPlaceholderData?undefined:query.data,[now,setNow]=useState(()=>Date.now()),[filtersOpen,setFiltersOpen]=useState(false),[helpOpen,setHelpOpen]=useState(false);
  useFocusEffect(useCallback(()=>{visible.current=true;const timer=setInterval(()=>{if(AppState.currentState==='active')setNow(Date.now());},5000);return()=>{visible.current=false;clearInterval(timer);};},[]));
  useEffect(()=>{
    if(!requestedAt)return;
    const timer=setTimeout(()=>{setRequestedAt(null);setSyncing(false);syncBusy.current=false;setNotice('Chưa nhận được xác nhận đồng bộ. Dữ liệu gần nhất được giữ; hệ thống vẫn cập nhật mỗi phút.');},75_000);
    return()=>clearTimeout(timer);
  },[requestedAt]);
  useEffect(()=>{
    if(!requestedAt)return;
    return cache.getQueryCache().subscribe(event=>{
      if(event.type!=='updated'||event.action.type!=='success'||event.query.queryKey[0]!=='gps-sync-state'||event.query.queryKey[1]!==api?.origin||event.query.queryKey[2]!==session?.user.id)return;
      const state=event.query.state.data;
      if(!isMobileGpsSyncState(state)||state.inProgress||!state.lastFinishedAt||state.lastFinishedAt===syncBaseline.current.finished)return;
      setRequestedAt(null);setSyncing(false);syncBusy.current=false;
      setNotice(state.failedAccounts?`Còn ${state.failedAccounts} tài khoản GPS chưa đồng bộ được. Giữ tín hiệu gần nhất và thử lại sau.`:
        state.latestSuccessAt&&state.latestSuccessAt!==syncBaseline.current.success?'Đã nhận dữ liệu đồng bộ. Đang tải trạng thái GPS mới nhất.':'Lượt kiểm tra đã kết thúc. Đang tải tín hiệu gần nhất đã có.');
      if(visible.current&&AppState.currentState==='active')void refreshCurrent({cancelRefetch:false});
    });
  },[requestedAt,cache,api?.origin,session?.user.id,refreshCurrent]);
  function filter(patch:Partial<MobileGpsQuery>) {setFilters(old=>({...old,...patch,page:1}));}
  async function sync() {
    if(!api||syncBusy.current)return;syncBusy.current=true;setSyncing(true);setError('');setNotice('');let pending=false;
    try{
      const result=await api.requestGpsRefresh();if(!alive.current)return;
      if(result.status==='queued'||result.status==='running'){
        pending=true;syncBaseline.current={finished:result.state.lastFinishedAt,success:result.state.latestSuccessAt};setRequestedAt(result.requestedAt);setNotice('Đang lấy tín hiệu GPS mới. Anh vẫn có thể xem dữ liệu gần nhất.');return;
      }
      setNotice(result.status==='unconfigured'?'Chưa có tài khoản GPS được bật.':result.state.failedAccounts?'GPS đang chờ lượt thử lại sau lỗi. Giữ dữ liệu gần nhất.':'GPS đang cập nhật theo nhịp 1 phút. Đang tải dữ liệu gần nhất.');
      if(visible.current&&AppState.currentState==='active')void refreshCurrent({cancelRefetch:false});
    }
    catch(cause){if(alive.current)setError((cause as Error).message);}
    finally{if(!pending){syncBusy.current=false;if(alive.current)setSyncing(false);}}
  }
  async function map(row:MobileGpsRow) {
    const url=gpsMapLink(row.last_latitude,row.last_longitude);if(!url)return;
    try{await Linking.openURL(url);}catch{if(alive.current)setError('Chưa mở được bản đồ. Thử lại trên thiết bị.');}
  }
  const titleStyle={color:theme.text,fontSize:18,fontWeight:'700' as const},muted={color:theme.muted,fontSize:13,lineHeight:20};
  function device(row:MobileGpsRow) {
    // A successful list read does not make an old provider observation fresh.
    const current=displayedGpsState(row.management_status,row.sync_received_at,now),state=current==='stopped'&&row.displayState==='long_stopped'?'long_stopped':current;
    const duration=gpsStoppedDurationMs(row,now),evidence=gpsStopEvidence(row,now),positionOld=!!row.position_recorded_at&&now-Date.parse(row.position_recorded_at)>GPS_SYNC_STALE_MS;
    return <Card style={{gap:10}}>
      <Text style={titleStyle}>{row.license||row.provider_device_name||row.external_device_id||'Xe chưa gắn GPS'}</Text>
      <Text style={muted}>Trạng thái xe: {row.vehicle_status?statuses[row.vehicle_status]||row.vehicle_status:'Chưa ghép xe'}</Text>
      <Text style={{color:state==='online'||state==='stopped'?theme.success:theme.warning,fontSize:15,fontWeight:'700'}}>{GPS_STATE_LABELS[state]||state}</Text>
      {duration!==null&&evidence?<View style={{gap:3}}><Text accessibilityLabel={`Thời gian dừng: ${gpsStopDurationLabel(duration)}`} style={{color:theme.text,fontSize:18,fontWeight:'700'}}>{gpsStopDurationLabel(duration)}</Text><Text style={muted}>Từ {date(evidence.since)} · {evidence.source==='protrack'?'Theo Protrack':'Himoto ghi nhận'}</Text></View>:current==='stopped'?<Text style={muted}>Chưa đủ dữ liệu thời gian dừng</Text>:null}
      <Text style={muted}>{row.store_name||'Chưa có cơ sở'} · {row.provider||'Chưa ghép thiết bị'}</Text>
      {!!row.external_device_id&&<Text selectable style={muted}>IMEI: {row.external_device_id}</Text>}
      {!!row.provider_device_name&&row.provider_device_name!==row.license&&<Text style={muted}>Tên GPS: {row.provider_device_name}</Text>}
      {current!=='stopped'&&<Text style={{color:theme.text,fontSize:15}}>{current==='online'&&row.last_speed!==null?`${row.last_speed} km/h`:'Chưa có tốc độ hiện tại'}</Text>}
      <View style={{gap:3}}><Text style={muted}>Himoto đọc: {date(row.sync_received_at)}</Text><Text style={muted}>Tín hiệu thiết bị: {date(row.heartbeat_at)}</Text><Text style={[muted,positionOld&&{color:theme.warning}]}>Vị trí: {date(row.position_recorded_at)}{positionOld?' · Vị trí cũ':''}</Text></View>
      {gpsMapLink(row.last_latitude,row.last_longitude)?<Button label={`Mở bản đồ ${row.license||row.external_device_id}`} secondary onPress={()=>void map(row)}/>:<Text style={muted}>Chưa có tọa độ hợp lệ</Text>}
      {data?.canMap&&row.id>0&&<Button label={`Ghép GPS ${row.external_device_id}`} secondary onPress={()=>router.push({pathname:'/gps-mapping/[id]',params:{id:String(row.id)}})}/>}
    </Card>;
  }
  function event(row:MobileGpsEvent) {return <Card style={{gap:6}}><Text style={titleStyle}>{row.label||`Sự kiện #${row.id}`}</Text><Text style={{color:theme.text}}>{eventLabels[row.kind]||`${GPS_STATE_LABELS[row.fromStatus||'']||row.fromStatus||'Chưa có'} → ${GPS_STATE_LABELS[row.toStatus]||row.toStatus}`}</Text><Text style={muted}>{date(row.eventAt)}</Text><Text style={muted}>{row.source==='poll'?'Himoto lấy mẫu':row.source==='history'?'Nhật ký đọc bù':'Sự kiện trực tiếp'} · Ghi nhận {date(row.observedAt)}</Text></Card>;}
  if(!session?.user.permissions.includes('vehicles.read'))return <StateView title="Chưa có quyền xem GPS"/>;
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}>
    <FlatList<MobileGpsRow|MobileGpsEvent> data={mode==='devices'?data?.rows||[]:history.isPlaceholderData?[]:history.data?.events||[]} keyExtractor={r=>`${mode}:${r.id}`} keyboardShouldPersistTaps="handled" initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5} contentContainerStyle={{padding:16,gap:12,paddingBottom:32}}
      ListHeaderComponent={<View style={{gap:14,paddingBottom:4}}>
        <Text accessibilityRole="header" style={{...titleStyle,fontSize:25}}>Định vị GPS</Text>
        <View style={{flexDirection:'row',gap:10,flexWrap:'wrap'}}><Button label="Tải lại GPS" secondary loading={currentRead.isFetching&&!currentRead.data} onPress={()=>void refreshCurrent({cancelRefetch:false})}/><Button label={syncing?'Đang đồng bộ…':'Đồng bộ ngay'} loading={syncing} onPress={()=>void sync()}/></View>
<FilteredListExport kind="gps" filters={new URLSearchParams({...filters,page:String(filters.page)}).toString()} disabled={query.isFetching||query.isError||!data?.total||search!==filters.search}/>
        {!!(error||currentRead.error)&&<InlineError message={error||currentRead.error?.message||'Chưa tải được GPS.'}/>}
        {!!notice&&<Text accessibilityLiveRegion="polite" style={muted}>{notice}</Text>}
        {!!requestedAt&&syncState.isError&&<InlineError message="Chưa đọc được tiến độ đồng bộ. Dữ liệu gần nhất vẫn được giữ."/>}
        {!!currentRead.data&&!currentRead.isPlaceholderData&&<Text style={muted}>Lần tải thành công: {date(currentRead.data.observedAt)}{currentRead.error?' · Đang giữ dữ liệu gần nhất':''}</Text>}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingVertical:4}}>
          {GPS_FILTER_STATES.map(s=><Pressable key={s} accessibilityRole="button" accessibilityState={{selected:filters.state===s}} onPress={()=>{if(s==='all'){setSearch('');filter({state:s,provider:'all',search:''});}else filter({state:filters.state===s?'all':s});}}
            style={{minHeight:48,maxWidth:230,padding:12,borderRadius:12,borderWidth:1,borderColor:filters.state===s?theme.primary:theme.controlBorder,backgroundColor:filters.state===s?theme.tint:theme.surface}}><Text style={{color:theme.text,fontWeight:'600'}}>{s==='all'?'Toàn bộ xe':GPS_STATE_LABELS[s]} · {data?(s==='all'?data.summary.fleet:data.summary.states[s]):'—'}</Text></Pressable>)}
        </ScrollView>
        <Text style={muted}>{data?.summary.unmapped??'—'} thiết bị chưa ghép xe · {filters.store==='all'?'Toàn bộ cơ sở':query.data?.stores.find(s=>String(s.id)===filters.store)?.name||'Cơ sở đã chọn'}</Text>
        <Button label={filtersOpen?'Ẩn bộ lọc GPS':'Bộ lọc GPS'} secondary onPress={()=>setFiltersOpen(old=>!old)}/>
        {filtersOpen&&<>
        <ChoiceField label="Cơ sở GPS" value={filters.store} choices={[{value:'all',label:'Toàn bộ cơ sở'},...(query.data?.stores||[]).map(s=>({value:String(s.id),label:s.name}))]} onChange={store=>filter({store,event_device:''})} searchable/>
        <FormField label="Tìm GPS" value={search} onChangeText={setSearch} maxLength={120} placeholder="Biển số, tên GPS, IMEI hoặc cơ sở" returnKeyType="search" onSubmitEditing={()=>filter({search})}/>
        <Button label="Tìm GPS theo nội dung đã nhập" secondary onPress={()=>filter({search})}/>
        <ChoiceField label="Nền tảng GPS" value={filters.provider} choices={[{value:'all',label:'Tất cả nền tảng'},{value:'protrack',label:'Protrack'},{value:'iopgps',label:'IOPGPS'}]} onChange={provider=>filter({provider:provider as MobileGpsQuery['provider']})}/>
        </>}
        <Button label={helpOpen?'Ẩn cách đọc trạng thái GPS':'Cách đọc trạng thái GPS'} secondary onPress={()=>setHelpOpen(old=>!old)}/>
        {helpOpen&&<Text style={muted}>GPS tự cập nhật mỗi phút khi đang mở màn hình. ON/OFF là kết nối thiết bị, độc lập với khóa điện. Dữ liệu quá 10 phút hiện “Chưa cập nhật”. Dừng trên 3 ngày: hơn 72 giờ, có bằng chứng dừng và tất cả thiết bị còn khả dụng của cùng xe đều xác nhận. Mốc Protrack được ưu tiên; tắt khóa điện không phải thời gian dừng. Số trạng thái tính theo thiết bị; tổng xe và nhóm dừng trên 3 ngày không đếm trùng.</Text>}
        <View style={{flexDirection:'row',gap:10,flexWrap:'wrap'}}><Button label="Thiết bị GPS" secondary={mode!=='devices'} onPress={()=>setMode('devices')}/><Button label="Lịch sử GPS" secondary={mode!=='events'} onPress={()=>setMode('events')}/></View>
        {mode==='events'?<><Text style={muted}>100 sự kiện gần nhất. Nhật ký đọc bù và trực tiếp dùng thời điểm nhà cung cấp; lấy mẫu dùng thời điểm Himoto quan sát. Lịch sử lọc theo cơ sở, nguồn và thiết bị.</Text>
          <ChoiceField label="Nguồn lịch sử GPS" value={filters.event_source} choices={[{value:'all',label:'Tất cả nguồn'},{value:'poll',label:'Lấy mẫu'},{value:'history',label:'Nhật ký đọc bù'},{value:'webhook',label:'Sự kiện trực tiếp'}]} onChange={event_source=>filter({event_source:event_source as MobileGpsQuery['event_source']})}/>
          <ChoiceField label="Thiết bị trong lịch sử GPS" value={filters.event_device} choices={[{value:'',label:'Tất cả thiết bị'},...(!options.isPlaceholderData?options.data?.devices||[]:[]).map(d=>({value:String(d.id),label:d.label}))]} onChange={event_device=>filter({event_device})} searchable/>
          {options.isError&&<><InlineError message="Chưa tải được bộ chọn thiết bị lịch sử."/><Button label="Tải lại bộ chọn thiết bị" secondary onPress={()=>void options.refetch()}/></>}
        </>:<Text style={muted}>{data?`${data.total} dòng · Trang ${data.page}/${Math.max(1,Math.ceil(data.total/25))}`:'Đang tải danh sách…'}</Text>}
      </View>}
      renderItem={({item})=>'displayState' in item?device(item):event(item)}
      ListEmptyComponent={<StateView title={currentRead.isPending||currentRead.isPlaceholderData?'Đang tải GPS':mode==='events'?'Chưa có sự kiện phù hợp':'Không có GPS phù hợp'} loading={(currentRead.isPending||currentRead.isPlaceholderData)&&!currentRead.error} message={currentRead.error?.message}/>}
      ListFooterComponent={mode==='devices'&&data?<View style={{gap:12,paddingVertical:8}}><Button label="Trang GPS trước" secondary disabled={data.page<=1} onPress={()=>setFilters(old=>({...old,page:data.page-1}))}/><Button label="Trang GPS tiếp" secondary disabled={!data.hasMore} onPress={()=>setFilters(old=>({...old,page:data.page+1}))}/></View>:undefined}
    />
  </SafeAreaView>;
}
