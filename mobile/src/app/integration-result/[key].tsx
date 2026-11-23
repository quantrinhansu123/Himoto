import { useEffect,useRef,useState } from 'react';
import { ScrollView,Text,View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { router,useLocalSearchParams } from 'expo-router';
import { useSession } from '@/providers/session';
import { pendingWrites } from '@/lib/pending-writes';
import { useTheme } from '@/theme';
import { Button,Card,InfoBanner,InlineError,KeyValueRow,StateView,StatusBadge } from '@/components/ui';
function Result({requestKey}:{requestKey:string}){const{api,session}=useSession(),cache=useQueryClient(),theme=useTheme(),[busy,setBusy]=useState(false),[error,setError]=useState(''),alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);const query=useQuery({queryKey:['integration-result',session!.user.id,requestKey],queryFn:({signal})=>api!.integrationResult(requestKey,signal),retry:false});if(query.isPending)return <StateView title="Đang đối chiếu cấu hình" loading />;if(query.isError)return <StateView title="Chưa đọc được xác nhận cấu hình" message={query.error.message} retry={()=>{void query.refetch();}} />;const r=query.data;
  async function acknowledge(){if(!api||!session||busy)return;setBusy(true);setError('');try{const scope={origin:api.origin,userId:session.user.id,storeId:session.user.allStores?null:session.user.storeId,allStores:session.user.allStores},original=await pendingWrites.entryScope(scope,r.operation,requestKey);if(original)await pendingWrites.complete(original,r.operation,requestKey);await cache.invalidateQueries({queryKey:['integrations']});if(alive.current)router.replace('/integrations');}catch(cause){if(alive.current)setError((cause as Error).message);}finally{if(alive.current)setBusy(false);}}
  const gps=r.receipt.targetKind==='gps-account'?r.current.accounts.find(a=>a.id===r.receipt.targetKey):null;
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}>
    <ScrollView contentContainerStyle={{padding:16,paddingBottom:36,gap:12,maxWidth:760,width:'100%',alignSelf:'center'}}>
      <Card style={{gap:10}}>
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
          <Text accessibilityRole="header" style={{color:theme.success,fontSize:20,fontWeight:'800',flexShrink:1}}>Đã lưu cấu hình tích hợp</Text>
          <StatusBadge label={r.receipt.targetKind==='gps-account'?'GPS':'Telegram'} tone="success" />
        </View>
        <KeyValueRow label="Đối tượng" value={r.receipt.targetKey} />
        <KeyValueRow label="Dấu cấu hình lúc ghi" value={String(r.receipt.configVersion)} />
        <Text selectable style={{color:theme.muted,fontSize:12}}>Mã gốc: {requestKey}</Text>
        <InfoBanner tone="info" message={`Xác nhận không chứa mật khẩu hoặc bot token. Thông tin bên dưới là hiện tại${r.receipt.configVersion!==r.current.configVersion?' và đã thay đổi sau lần ghi này':''}.`} />
      </Card>
      <Card style={{gap:8}}>
        {gps?<>
          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
            <Text style={{color:theme.text,fontSize:16,fontWeight:'700'}}>{gps.label} · {gps.provider}</Text>
            <StatusBadge label={gps.enabled?'Đang bật đồng bộ':'Đã tắt đồng bộ'} tone={gps.enabled?'success':'neutral'} />
          </View>
          <KeyValueRow label="Tài khoản" value={gps.username} />
        </>:<>
          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
            <Text style={{color:theme.text,fontSize:16,fontWeight:'700'}}>Cấu hình Telegram</Text>
            <StatusBadge label={r.current.telegram_configured?'Đã lưu bot':'Chưa có bot'} tone={r.current.telegram_configured?'success':'warning'} />
          </View>
          <KeyValueRow label="Nhóm cơ sở bật nhận" value={String(r.current.groups.filter(g=>g.enabled).length)} />
          <KeyValueRow label="Nhóm thuê sở hữu bật nhận" value={String(r.current.ownership_groups.filter(g=>g.enabled).length)} />
        </>}
      </Card>
      {!!error&&<InlineError message={error} />}
      <Button label="Đã kiểm tra xác nhận tích hợp" loading={busy} onPress={()=>{void acknowledge();}} />
    </ScrollView>
  </SafeAreaView>;
}
export default function Route(){const{key}=useLocalSearchParams<{key:string}>(),{api,session}=useSession();if(!api||!session||!/^[0-9a-f-]{36}$/.test(key))return <StateView title="Không mở được xác nhận tích hợp" />;return <Result key={`${key}:${api.origin}:${session.token}:${session.user.permissions.join(',')}`} requestKey={key} />;}
