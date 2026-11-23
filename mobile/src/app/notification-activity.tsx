import {FlatList,Text,Pressable,RefreshControl,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router} from 'expo-router';
import {useInfiniteQuery} from '@tanstack/react-query';
import {activityLabel} from '../../../shared/mobile-activity';
import {useSession} from '@/providers/session';
import {useTheme} from '@/theme';
import {Button,Card,InlineError,KeyValueRow,SkeletonList,StateView} from '@/components/ui';

export default function NotificationActivity(){
  const {api,session}=useSession(),theme=useTheme();
  const query=useInfiniteQuery({queryKey:['notifications','activity',session?.user.id],enabled:!!api,
    initialPageParam:null as number|null,queryFn:({pageParam,signal})=>api!.notificationActivity(pageParam,signal),
    getNextPageParam:last=>last.nextBefore??undefined});
  const rows=[...new Map(query.data?.pages.flatMap(page=>page.rows).map(row=>[row.id,row])).values()];
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}><FlatList data={rows} keyExtractor={row=>String(row.id)} contentContainerStyle={{padding:16,paddingBottom:36,gap:12,maxWidth:760,width:'100%',alignSelf:'center'}} refreshControl={<RefreshControl refreshing={query.isRefetching&&!query.isFetchingNextPage} onRefresh={()=>{void query.refetch();}} tintColor={theme.primary}/> }
    ListHeaderComponent={<View style={{gap:6}}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:20,fontWeight:'800'}}>Sự kiện gần đây</Text>
    <Text style={{color:theme.muted,fontSize:13.5,lineHeight:20}}>Sự kiện trong 7 ngày theo quyền và cơ sở của tài khoản.</Text>
    {query.isError&&!!rows.length&&<InlineError message="Chưa cập nhật được sự kiện. Đang giữ danh sách đã tải."/>}
    </View>}
    ListEmptyComponent={query.isPending?<SkeletonList count={4} lines={2}/>:query.isError?<>
      <InlineError message="Chưa tải được sự kiện. Vui lòng thử lại."/><Button secondary label="Thử lại" onPress={()=>{void query.refetch();}}/>
    </>:<StateView title="Chưa có sự kiện gần đây" message="Các giao dịch mới sẽ xuất hiện tại đây."/>}
    renderItem={({item:row})=><Pressable accessibilityRole="button" accessibilityLabel={`Mở hồ sơ ${row.resourceLabel}: ${activityLabel(row)}`} onPress={()=>router.push(row.kind==='transfer'?{pathname:'/vehicle/[id]',params:{id:row.resourceId}}:{pathname:'/record/[kind]/[id]',params:{kind:'contracts',id:row.resourceId}})}>
        <Card style={{gap:6}}><Text style={{color:theme.text,fontSize:16,fontWeight:'700'}}>{activityLabel(row)}</Text>
          <KeyValueRow label="Hồ sơ" value={row.resourceLabel} emphasize/>
          <KeyValueRow label="Thời gian" value={new Date(row.createdAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}/>
          <Text style={{color:theme.primary,fontSize:13,fontWeight:'700'}}>Mở hồ sơ →</Text></Card>
      </Pressable>}
    ListFooterComponent={<View style={{gap:12}}>
      {query.isFetchNextPageError&&<InlineError message="Chưa tải được trang tiếp theo."/>}
      {query.hasNextPage&&<View><Button secondary label={query.isFetchNextPageError?'Thử lại':'Xem thêm'} loading={query.isFetchingNextPage} onPress={()=>{void query.fetchNextPage();}}/></View>}
    </View>}
  /></SafeAreaView>;
}
