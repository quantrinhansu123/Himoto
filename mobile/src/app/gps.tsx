import {FilteredListExport} from '@/components/filtered-list-export';
import {useState,useRef,useEffect,useCallback} from 'react';
import {AppState,FlatList,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router,useFocusEffect} from 'expo-router';
import {useQueryClient} from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import {HelpCircle,MapPin,RefreshCw,Search,SlidersHorizontal,X} from 'lucide-react-native';
import {Button,Card,Chip,InfoBanner,InlineError,KeyValueRow,PaginationBar,SegmentedBar,SkeletonList,StateView,StatusBadge} from '@/components/ui';
import {ChoiceField} from '@/components/form-fields';
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
  useFocusEffect(useCallback(()=>{
    visible.current=true;
    if(mode!=='devices')return()=>{visible.current=false;};
    setNow(Date.now());
    const timer=setInterval(()=>{if(AppState.currentState==='active')setNow(Date.now());},15_000);
    return()=>{visible.current=false;clearInterval(timer);};
  },[mode]));
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
  const titleStyle={color:theme.text,fontSize:16,fontWeight:'800' as const},muted={color:theme.muted,fontSize:12.5,lineHeight:18};
  function device(row:MobileGpsRow) {
    // A successful list read does not make an old provider observation fresh.
    const current=displayedGpsState(row.management_status,row.sync_received_at,now),state=current==='stopped'&&row.displayState==='long_stopped'?'long_stopped':current;
    const duration=gpsStoppedDurationMs(row,now),evidence=gpsStopEvidence(row,now),positionOld=!!row.position_recorded_at&&now-Date.parse(row.position_recorded_at)>GPS_SYNC_STALE_MS;
    const mapUrl=gpsMapLink(row.last_latitude,row.last_longitude);
    return <Card style={{gap:8,padding:13}}>
      <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8}}>
        <Text numberOfLines={1} style={[titleStyle,{flex:1}]}>{row.license||row.provider_device_name||row.external_device_id||'Xe chưa gắn GPS'}</Text>
        <StatusBadge status={state} label={GPS_STATE_LABELS[state]||state} />
      </View>
      <View style={{gap:2}}>
        <KeyValueRow label="Xe / Cơ sở" value={`${row.vehicle_status?statuses[row.vehicle_status]||row.vehicle_status:'Chưa ghép xe'} · ${row.store_name||'Chưa có CS'}`} />
        {duration!==null&&evidence?<KeyValueRow label="Thời gian dừng" strong value={`${gpsStopDurationLabel(duration)} (${evidence.source==='protrack'?'Protrack':'Himoto'})`} />:current==='stopped'?<KeyValueRow label="Thời gian dừng" value="Chưa đủ dữ liệu" />:<KeyValueRow label="Tốc độ" value={current==='online'&&row.last_speed!==null?`${row.last_speed} km/h`:'—'} />}
        {!!row.external_device_id&&<KeyValueRow label="Thiết bị / IMEI" selectable value={`${row.provider?`${row.provider} · `:''}${row.external_device_id}`} />}
        <KeyValueRow label="Vị trí gần nhất" valueColor={positionOld?theme.warning:undefined} value={`${date(row.position_recorded_at)}${positionOld?' (Cũ)':''}`} />
        <KeyValueRow label="Đọc / Tín hiệu" value={`${date(row.sync_received_at)} · ${date(row.heartbeat_at)}`} />
      </View>
      <View style={{flexDirection:'row',gap:8,paddingTop:2}}>
        {mapUrl?<Button size="sm" equalWidth secondary icon={<MapPin size={14} color={theme.text} />} label="Mở bản đồ" onPress={()=>void map(row)}/>:<Text style={muted}>Chưa có tọa độ hợp lệ</Text>}
        {data?.canMap&&row.id>0&&<Button size="sm" equalWidth secondary label="Ghép GPS" onPress={()=>router.push({pathname:'/gps-mapping/[id]',params:{id:String(row.id)}})}/>}
      </View>
    </Card>;
  }
  function event(row:MobileGpsEvent) {return <Card style={{gap:6,padding:13}}><View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8}}><Text style={[titleStyle,{flex:1}]}>{row.label||`Sự kiện #${row.id}`}</Text><Text style={muted}>{date(row.eventAt)}</Text></View><Text style={{color:theme.text,fontSize:14,fontWeight:'600'}}>{eventLabels[row.kind]||`${GPS_STATE_LABELS[row.fromStatus||'']||row.fromStatus||'Chưa có'} → ${GPS_STATE_LABELS[row.toStatus]||row.toStatus}`}</Text><Text style={muted}>{row.source==='poll'?'Himoto lấy mẫu':row.source==='history'?'Nhật ký đọc bù':'Sự kiện trực tiếp'} · Ghi nhận {date(row.observedAt)}</Text></Card>;}
  if(!session?.user.permissions.includes('vehicles.read'))return <StateView title="Chưa có quyền xem GPS"/>;
  const activeFilterCount=Number(filters.store!=='all')+Number(filters.vehicle_status!=='all')+Number(filters.provider!=='all');
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}>
    <FlatList<MobileGpsRow|MobileGpsEvent> data={mode==='devices'?data?.rows||[]:history.isPlaceholderData?[]:history.data?.events||[]} keyExtractor={r=>`${mode}:${r.id}`} keyboardShouldPersistTaps="handled" initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5} contentContainerStyle={{padding:16,gap:11,paddingBottom:36,maxWidth:760,width:'100%',alignSelf:'center'}}
      ListHeaderComponent={<View style={{gap:11}}>
        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10}}>
          <View style={{flex:1,gap:2}}>
            <Text accessibilityRole="header" style={{color:theme.text,fontSize:22,fontWeight:'800'}}>Định vị GPS</Text>
            <Text style={muted}>{data?.summary.unmapped??'—'} thiết bị chưa ghép · Tự làm mới mỗi 60s</Text>
          </View>
          <Button size="sm" icon={<RefreshCw size={14} color={theme.primaryText} />} label={syncing?'Đang đồng bộ…':'Đồng bộ'} loading={syncing} onPress={()=>void sync()} />
        </View>
        <SegmentedBar value={mode} onChange={setMode} options={[{value:'devices',label:'Thiết bị GPS'},{value:'events',label:'Lịch sử GPS'}]} />
        <View style={{flexDirection:'row',gap:8}}>
          <View style={{flex:1,flexDirection:'row',alignItems:'center',gap:8,borderWidth:1,borderRadius:10,borderColor:theme.controlBorder,backgroundColor:theme.surface,paddingHorizontal:11,minHeight:44}}>
            <Search size={18} color={theme.muted} accessible={false} />
            <TextInput
              accessibilityLabel="Tìm nhanh GPS"
              placeholder="Biển số, tên GPS, IMEI hoặc cơ sở…"
              placeholderTextColor={theme.muted}
              value={search}
              onChangeText={setSearch}
              maxLength={120}
              returnKeyType="search"
              onSubmitEditing={()=>filter({search})}
              autoCorrect={false}
              style={{flex:1,color:theme.text,fontSize:14.5,paddingVertical:8}}
            />
            {!!search&&<Pressable onPress={()=>{setSearch('');filter({search:''});}} hitSlop={8}><X size={17} color={theme.muted} /></Pressable>}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Bộ lọc GPS" onPress={()=>setFiltersOpen(old=>!old)} style={{minWidth:44,minHeight:44,paddingHorizontal:11,borderRadius:10,borderWidth:1,borderColor:filtersOpen||activeFilterCount?theme.primary:theme.controlBorder,backgroundColor:filtersOpen||activeFilterCount?theme.tint:theme.surface,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4}}>
            <SlidersHorizontal size={18} color={filtersOpen||activeFilterCount?theme.primary:theme.text} />
            {!!activeFilterCount&&<Text style={{color:theme.primary,fontSize:12,fontWeight:'700'}}>{activeFilterCount}</Text>}
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:7}}>
          {GPS_FILTER_STATES.map(s=><Chip key={s} label={s==='all'?'Toàn bộ xe':GPS_STATE_LABELS[s]} count={data?(s==='all'?data.summary.fleet:data.summary.states[s]):undefined} selected={filters.state===s} onPress={()=>{if(s==='all'){setSearch('');filter({state:s,provider:'all',vehicle_status:'all',search:''});}else filter({state:filters.state===s?'all':s});}} />)}
          <Chip label="Giải thích" selected={helpOpen} icon={<HelpCircle size={14} color={helpOpen?theme.primary:theme.text} />} onPress={()=>setHelpOpen(old=>!old)} />
          {!!(filters.search||filters.state!=='all'||activeFilterCount)&&(
            <Chip label="Xóa lọc" onPress={()=>{setSearch('');setFilters({...defaultGpsQuery});}} />
          )}
        </ScrollView>
        {helpOpen&&<InfoBanner tone="info" title="Cách đọc trạng thái GPS" message="GPS tự cập nhật mỗi phút khi mở màn hình. ON/OFF là kết nối thiết bị, độc lập với khóa điện. Dữ liệu quá 10 phút hiện “Chưa cập nhật”. Dừng trên 3 ngày: hơn 72 giờ và tất cả thiết bị còn khả dụng của xe xác nhận." />}
        {filtersOpen&&<Card style={{gap:10}}>
          <ChoiceField label="Cơ sở GPS" value={filters.store} choices={[{value:'all',label:'Toàn bộ cơ sở'},...(query.data?.stores||[]).map(s=>({value:String(s.id),label:s.name}))]} onChange={store=>filter({store,event_device:''})} searchable/>
          <ChoiceField label="Trạng thái xe" value={filters.vehicle_status} choices={[{value:'all',label:'Tất cả trạng thái xe'},{value:'ready',label:'Lưu kho'},{value:'using',label:'Đang thuê'},{value:'repairing',label:'Bảo dưỡng'},{value:'pending',label:'Đặt trước'},{value:'sold',label:'Đã bán'},{value:'bad_debt',label:'Nợ xấu'},{value:'broken',label:'Hỏng'},{value:'in_transit',label:'Chờ luân chuyển'}]} onChange={vehicle_status=>filter({vehicle_status:vehicle_status as MobileGpsQuery['vehicle_status']})}/>
          <ChoiceField label="Nền tảng GPS" value={filters.provider} choices={[{value:'all',label:'Tất cả'},{value:'protrack',label:'Protrack'},{value:'iopgps',label:'IOPGPS'}]} onChange={provider=>filter({provider:provider as MobileGpsQuery['provider']})}/>
          <Button size="sm" secondary label="Tìm theo từ khóa đã nhập" onPress={()=>filter({search})}/>
          <FilteredListExport kind="gps" filters={new URLSearchParams({...filters,page:String(filters.page)}).toString()} disabled={query.isFetching||query.isError||!data?.total||search!==filters.search}/>
        </Card>}
        {!!(error||currentRead.error)&&<InlineError message={error||currentRead.error?.message||'Chưa tải được GPS.'}/>}
        {!!notice&&<InfoBanner tone="info" message={notice} />}
        {!!requestedAt&&syncState.isError&&<InlineError message="Chưa đọc được tiến độ đồng bộ. Dữ liệu gần nhất vẫn được giữ."/>}
        {mode==='events'?<Card style={{gap:10}}>
          <ChoiceField label="Nguồn lịch sử GPS" value={filters.event_source} choices={[{value:'all',label:'Tất cả nguồn'},{value:'poll',label:'Lấy mẫu'},{value:'history',label:'Nhật ký đọc bù'},{value:'webhook',label:'Sự kiện trực tiếp'}]} onChange={event_source=>filter({event_source:event_source as MobileGpsQuery['event_source']})}/>
          <ChoiceField label="Thiết bị trong lịch sử" value={filters.event_device} choices={[{value:'',label:'Tất cả thiết bị'},...(!options.isPlaceholderData?options.data?.devices||[]:[]).map(d=>({value:String(d.id),label:d.label}))]} onChange={event_device=>filter({event_device})} searchable/>
          {options.isError&&<><InlineError message="Chưa tải được bộ chọn thiết bị lịch sử."/><Button size="sm" label="Tải lại bộ chọn thiết bị" secondary onPress={()=>void options.refetch()}/></>}
        </Card>:<Text style={muted}>{data?`${data.total} thiết bị · ${filters.store==='all'?'Toàn bộ cơ sở':query.data?.stores.find(s=>String(s.id)===filters.store)?.name||'Cơ sở đã chọn'}${currentRead.data&&!currentRead.isPlaceholderData?` · Cập nhật ${date(currentRead.data.observedAt)}`:''}`:'Đang tải danh sách…'}</Text>}
      </View>}
      renderItem={({item})=>'displayState' in item?device(item):event(item)}
      ListEmptyComponent={(currentRead.isPending||currentRead.isPlaceholderData)&&!currentRead.error?<SkeletonList count={4} lines={3} />:<StateView title={mode==='events'?'Chưa có sự kiện phù hợp':'Không có GPS phù hợp'} message={currentRead.error?.message} retry={currentRead.error?()=>void refreshCurrent({cancelRefetch:false}):undefined}/>}
      ListFooterComponent={mode==='devices'&&data?<PaginationBar page={data.page} pages={Math.max(1,Math.ceil(data.total/25))} total={data.total} unit="thiết bị" hasNext={data.hasMore} disabled={query.isFetching} onChange={page=>setFilters(old=>({...old,page}))} />:undefined}
    />
  </SafeAreaView>;
}
