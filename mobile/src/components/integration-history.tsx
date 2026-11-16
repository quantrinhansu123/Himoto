import {useQuery} from '@tanstack/react-query';
import {Text} from 'react-native';
import {useSession} from '@/providers/session';
import {useTheme,dateTime} from '@/theme';
import {Button,InlineError,StateView} from './ui';
import {IntegrationStatus} from './integration-status';
import type {IntegrationSettings} from '../../../shared/mobile-integrations';

export function IntegrationHistory({settings}:{settings:IntegrationSettings}){
  const{api,session}=useSession(),theme=useTheme();
  const query=useQuery({queryKey:['integration-health',api?.origin,session?.user.id],queryFn:({signal})=>api!.integrationHealth(signal),retry:false,staleTime:60_000,refetchOnWindowFocus:false});
  if(query.isPending)return <StateView title="Đang đọc thống kê lịch sử GPS" loading/>;
  if(query.isError)return <><InlineError message="Chưa đọc được thống kê lịch sử; cấu hình vẫn được giữ."/><Button label="Tải lại thống kê GPS" secondary onPress={()=>void query.refetch()}/></>;
  return <><Text style={{color:theme.muted}}>Thống kê sự kiện lúc {dateTime(query.data.counts_at)}</Text><IntegrationStatus section="history" settings={{...settings,gps_history:{...settings.gps_history,...query.data,pending:false}}}/></>;
}
