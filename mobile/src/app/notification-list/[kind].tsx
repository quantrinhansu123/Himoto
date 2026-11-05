import { useState } from 'react';
import { Pressable, ScrollView, Text, View, RefreshControl } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { NOTIFICATION_KINDS, NOTIFICATION_LABELS, type MobileNotificationKind } from '../../../../shared/mobile-notifications';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';
import { Button, Card, InlineError, StateView } from '@/components/ui';
export default function NotificationList() {
  const {kind: raw} = useLocalSearchParams<{kind:string}>(), kind = raw as MobileNotificationKind;
  const {api,session} = useSession(), theme = useTheme(), [page,setPage] = useState(1);
  const valid = NOTIFICATION_KINDS.includes(kind);
  const query = useQuery({queryKey:['notifications',session?.user.id,kind,page],queryFn:({signal})=>api!.notificationList(kind,page,signal),enabled:!!api&&valid});
  if (!valid) return <StateView title="Không tìm thấy nhóm thông báo"/>;
  return <ScrollView contentContainerStyle={{padding:20,gap:16}} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={()=>{void query.refetch();}} tintColor={theme.primary}/> }>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:24,fontWeight:'700'}}>{NOTIFICATION_LABELS[kind]}</Text>
    {query.isPending ? <StateView title="Đang tải danh sách" loading/> : query.error ? <><InlineError message={query.error.message}/><Button secondary label="Thử lại" onPress={()=>{void query.refetch();}}/></> : <>
      <Text style={{color:theme.muted}}>{query.data.total} công việc · Trang {query.data.page}/{query.data.pages}</Text>
      {query.data.rows.map(row=><Pressable key={row.id} accessibilityRole="button" accessibilityLabel={`Mở ${row.label}`} onPress={()=>kind==='transfer'?router.push({pathname:'/vehicle-transfer/[id]',params:{id:row.id}}):router.push({pathname:'/record/[kind]/[id]',params:{kind:'contracts',id:row.id}})}><Card style={{gap:6}}><Text style={{color:theme.text,fontSize:17,fontWeight:'600'}}>{row.label}</Text><Text style={{color:theme.primary}}>Mở hồ sơ</Text></Card></Pressable>)}
      {!query.data.rows.length && <StateView title="Không còn công việc cần xử lý" message="Danh sách sẽ cập nhật theo nghiệp vụ đã lưu."/>}
      <View style={{flexDirection:'row',gap:12}}><View style={{flex:1}}><Button label="Trang trước" secondary disabled={query.data.page<=1} onPress={()=>setPage(query.data.page-1)}/></View><View style={{flex:1}}><Button label="Trang sau" secondary disabled={query.data.page>=query.data.pages} onPress={()=>setPage(query.data.page+1)}/></View></View>
    </>}
  </ScrollView>;
}
