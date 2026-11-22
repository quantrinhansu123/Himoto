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
  return <>
    {query.isPending&&<StateView title="Đang đọc thống kê lịch sử GPS" loading/>}
    {query.isError&&<InlineError message="Chưa đọc được thống kê lịch sử mới nhất; cấu hình kênh GPS vẫn hiển thị bên dưới."/>}
    {query.data&&<Text style={{color:theme.muted}}>Thống kê sự kiện lúc {dateTime(query.data.counts_at)}</Text>}
    <Button label="Tải lại thống kê GPS" secondary loading={query.isFetching} onPress={()=>void query.refetch()}/>
    <IntegrationStatus section="history" settings={{...settings,gps_history:{...settings.gps_history,...(query.data||{}),pending:query.isPending}}}/>
  </>;
}
