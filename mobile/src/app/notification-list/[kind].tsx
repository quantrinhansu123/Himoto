import { useState } from 'react';
import { Pressable, ScrollView, Text, View, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronRight } from 'lucide-react-native';
import { NOTIFICATION_KINDS, NOTIFICATION_LABELS, type MobileNotificationKind, type MobileNotificationRow } from '../../../../shared/mobile-notifications';
import { useSession } from '@/providers/session';
import { useTheme } from '@/theme';
import { Button, Card, InlineError, PaginationBar, SkeletonList, StateView, StatusBadge } from '@/components/ui';

export default function NotificationList() {
  const {kind: raw} = useLocalSearchParams<{kind:string}>(), kind = raw as MobileNotificationKind;
  const {api,session} = useSession(), theme = useTheme(), [page,setPage] = useState(1);
  const valid = NOTIFICATION_KINDS.includes(kind);
  const query = useQuery({queryKey:['notifications',session?.user.id,kind,page],queryFn:({signal})=>api!.notificationList(kind,page,signal),enabled:!!api&&valid});
  if (!valid) return <StateView title="Không tìm thấy nhóm thông báo"/>;
  const isGps = kind === 'gps_alert';
  const openRow = (row: MobileNotificationRow) => {
    if (isGps) {
      if (row.target === 'attendance') router.push('/attendance-history');
      else router.push({ pathname: '/shift/[id]', params: { id: String(row.target_id ?? Math.floor(row.id / 2)) } });
      return;
    }
    if (kind === 'transfer') router.push({pathname:'/vehicle-transfer/[id]',params:{id:row.id}});
    else router.push({pathname:'/record/[kind]/[id]',params:{kind:'contracts',id:row.id}});
  };
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}><Stack.Screen options={{ title: NOTIFICATION_LABELS[kind] }} /><ScrollView contentContainerStyle={{padding:16,paddingBottom:32,gap:12,maxWidth:760,width:'100%',alignSelf:'center'}} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={()=>{void query.refetch();}} tintColor={theme.primary}/> }>
    {isGps && <Text style={{color:theme.muted,fontSize:13}}>Cảnh báo ngầm chỉ hiển thị cho quản trị viên (phạm vi chuẩn ≤ 200 m trong 7 ngày gần nhất).</Text>}
    {query.isPending ? <SkeletonList count={4} lines={2}/> : query.error ? <><InlineError message={query.error.message}/><Button secondary label="Thử lại" onPress={()=>{void query.refetch();}}/></> : <>
      <Text style={{color:theme.muted,fontSize:13}}>{query.data.total} {isGps ? 'cảnh báo' : 'công việc'} · Trang {query.data.page}/{query.data.pages}</Text>
      {query.data.rows.map(row=><Pressable key={row.id} accessibilityRole="button" accessibilityLabel={`Mở ${row.label}`} onPress={()=>openRow(row)}>
        <Card style={{flexDirection:'row',alignItems:'center',gap:12,...(isGps ? {borderColor:theme.danger,borderWidth:1} : {})}}>
          {isGps && <AlertTriangle size={18} color={theme.danger} />}
          <View style={{flex:1,gap:4}}>
            <Text style={{color:theme.text,fontSize:15,fontWeight:'700',lineHeight:21}}>{row.label}</Text>
            <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
              {isGps && <StatusBadge status="overdue" label={row.target === 'attendance' ? 'Chấm công' : 'Báo cáo ca'} />}
              <Text style={{color:theme.primary,fontSize:13,fontWeight:'600'}}>
                {isGps ? (row.target === 'attendance' ? 'Mở lịch sử chấm công' : 'Mở báo cáo ca') : 'Mở hồ sơ'}
              </Text>
            </View>
          </View>
          <ChevronRight size={18} color={theme.muted} />
        </Card>
      </Pressable>)}
      {!query.data.rows.length && <StateView title={isGps ? 'Không có cảnh báo GPS' : 'Không còn công việc cần xử lý'} message={isGps ? 'Tất cả lượt chấm công và kiểm kê ca 7 ngày qua đều trong phạm vi cơ sở.' : 'Danh sách sẽ cập nhật theo nghiệp vụ đã lưu.'}/>}
      {query.data.pages > 1 && <PaginationBar page={query.data.page} pages={query.data.pages} total={query.data.total} unit={isGps ? 'cảnh báo' : 'mục'} disabled={query.isFetching} onChange={setPage} />}
    </>}
  </ScrollView></SafeAreaView>;
}
