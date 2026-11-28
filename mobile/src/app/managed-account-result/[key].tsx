import { useEffect,useRef,useState } from 'react';
import { ScrollView,Text,View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { router,useLocalSearchParams } from 'expo-router';
import { useSession } from '@/providers/session';
import { pendingWrites } from '@/lib/pending-writes';
import { useTheme } from '@/theme';
import { Button,Card,InfoBanner,InlineError,StateView,StatusBadge } from '@/components/ui';
import { ManagedAccountSummary } from '@/components/managed-account-summary';
function Result({requestKey}:{requestKey:string}){const{api,session}=useSession(),cache=useQueryClient(),theme=useTheme(),[busy,setBusy]=useState(false),[error,setError]=useState(''),alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);const query=useQuery({queryKey:['managed-account-result',session!.user.id,requestKey],queryFn:({signal})=>api!.managedAccountResult(requestKey,signal),retry:false});if(query.isPending)return <StateView title="Đang đối chiếu tài khoản" loading />;if(query.isError)return <StateView title="Chưa đọc được xác nhận tài khoản" message={query.error.message} retry={()=>{void query.refetch();}} />;const r=query.data;
  async function acknowledge(){if(!api||!session||busy)return;setBusy(true);setError('');try{const scope={origin:api.origin,userId:session.user.id,storeId:session.user.allStores?null:session.user.storeId,allStores:session.user.allStores},original=await pendingWrites.entryScope(scope,r.operation,requestKey);if(original)await pendingWrites.complete(original,r.operation,requestKey);for(const key of [['managed-accounts'],['managed-account'],['managed-account-options'],['directory','staff']])void cache.invalidateQueries({queryKey:key});if(!alive.current)return;if(r.ownPasswordChange)router.replace('/(tabs)/account');else if(r.deleted)router.replace('/managed-accounts');else router.replace({pathname:'/managed-account/[id]',params:{id:String(r.receipt.id)}});}catch(cause){if(alive.current)setError((cause as Error).message);}finally{if(alive.current)setBusy(false);}}
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}>
    <ScrollView contentContainerStyle={{padding:16,paddingBottom:36,gap:12,maxWidth:760,width:'100%',alignSelf:'center'}}>
      <Card style={{gap:10}}>
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
          <Text accessibilityRole="header" style={{color:theme.success,fontSize:20,fontWeight:'800',flexShrink:1}}>Đã cập nhật tài khoản</Text>
          <StatusBadge label={r.ownPasswordChange?'Đổi mật khẩu':r.deleted?'Đã xóa':'Hoàn tất'} tone={r.deleted?'warning':'success'} />
        </View>
        <InfoBanner tone={r.deleted?'warning':'success'} message={r.ownPasswordChange?'Mật khẩu tài khoản đã được cập nhật.':r.deleted?'Quyền đăng nhập đã được xóa; lịch sử nghiệp vụ được giữ nguyên.':'Thông tin và phân quyền tài khoản đã được lưu trên hệ thống.'} />
      </Card>
      {r.current&&<ManagedAccountSummary account={r.current} />}
      {!!error&&<InlineError message={error} />}
      <Button label="Quay lại tài khoản" loading={busy} onPress={()=>{void acknowledge();}} />
    </ScrollView>
  </SafeAreaView>;
}
export default function Route(){const{key}=useLocalSearchParams<{key:string}>(),{api,session}=useSession();if(!api||!session||!/^[0-9a-f-]{36}$/.test(key))return <StateView title="Không mở được xác nhận tài khoản" />;return <Result key={`${key}:${api.origin}:${session.token}:${session.user.permissions.join(',')}`} requestKey={key} />;}
