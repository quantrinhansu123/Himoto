import {FlatList,Text,Pressable,RefreshControl,View} from 'react-native';
import {router} from 'expo-router';
import {useInfiniteQuery} from '@tanstack/react-query';
import {activityLabel} from '../../../shared/mobile-activity';
import {useSession} from '@/providers/session';
import {useTheme} from '@/theme';
import {Button,Card,InlineError,StateView} from '@/components/ui';

export default function NotificationActivity(){
  const {api,session}=useSession(),theme=useTheme();
  const query=useInfiniteQuery({queryKey:['notifications','activity',session?.user.id],enabled:!!api,
    initialPageParam:null as number|null,queryFn:({pageParam,signal})=>api!.notificationActivity(pageParam,signal),
    getNextPageParam:last=>last.nextBefore??undefined});
  const rows=[...new Map(query.data?.pages.flatMap(page=>page.rows).map(row=>[row.id,row])).values()];
  return <FlatList data={rows} keyExtractor={row=>String(row.id)} contentContainerStyle={{padding:20,gap:16}} refreshControl={<RefreshControl refreshing={query.isRefetching&&!query.isFetchingNextPage} onRefresh={()=>{void query.refetch();}} tintColor={theme.primary}/> }
    ListHeaderComponent={<View style={{gap:16}}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:24,fontWeight:'700'}}>Sự kiện gần đây</Text>
    <Text style={{color:theme.muted,lineHeight:22}}>Sự kiện trong 7 ngày theo quyền và cơ sở của tài khoản.</Text>
    {query.isError&&!!rows.length&&<InlineError message="Chưa cập nhật được sự kiện. Đang giữ danh sách đã tải."/>}
    </View>}
    ListEmptyComponent={query.isPending?<StateView title="Đang tải sự kiện" loading/>:query.isError?<>
      <InlineError message="Chưa tải được sự kiện. Vui lòng thử lại."/><Button secondary label="Thử lại" onPress={()=>{void query.refetch();}}/>
    </>:<StateView title="Chưa có sự kiện gần đây" message="Các giao dịch mới sẽ xuất hiện tại đây."/>}
    renderItem={({item:row})=><Pressable accessibilityRole="button" accessibilityLabel={`Mở hồ sơ ${row.resourceLabel}: ${activityLabel(row)}`} onPress={()=>router.push(row.kind==='transfer'?{pathname:'/vehicle/[id]',params:{id:row.resourceId}}:{pathname:'/record/[kind]/[id]',params:{kind:'contracts',id:row.resourceId}})}>
        <Card style={{gap:8}}><Text style={{color:theme.text,fontSize:17,fontWeight:'600'}}>{activityLabel(row)}</Text>
          <Text style={{color:theme.text,fontSize:16}}>{row.resourceLabel}</Text>
          <Text style={{color:theme.muted}}>{new Date(row.createdAt).toLocaleString('vi-VN')}</Text><Text style={{color:theme.primary}}>Mở hồ sơ</Text></Card>
      </Pressable>}
    ListFooterComponent={<View style={{gap:16}}>
      {query.isFetchNextPageError&&<InlineError message="Chưa tải được trang tiếp theo."/>}
      {query.hasNextPage&&<View><Button secondary label={query.isFetchNextPageError?'Thử lại':'Xem thêm'} loading={query.isFetchingNextPage} onPress={()=>{void query.fetchNextPage();}}/></View>}
    </View>}
  />;
}
