import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/providers/session';
import { StateView } from '@/components/ui';
import { IntegrationEditor } from '@/components/integration-editor';
import { isAdminAccount } from '../../../shared/access-permissions';
export default function Route(){const{api,session}=useSession(),allowed=isAdminAccount(session?.user),query=useQuery({queryKey:['integrations',session?.user.id],queryFn:({signal})=>api!.integrations(signal),enabled:!!api&&allowed,retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false});if(!api||!session||!allowed)return <StateView title="Chỉ quản trị được cấu hình tích hợp" />;if(query.isPending)return <StateView title="Đang tải cấu hình tích hợp" loading />;if(query.isError)return <StateView title="Chưa tải được cấu hình tích hợp" message={query.error.message} retry={()=>{void query.refetch();}} />;return <IntegrationEditor key={`${api.origin}:${session.token}:${session.user.permissions.join(',')}:${query.data.configVersion}:${query.dataUpdatedAt}`} settings={query.data} onReload={()=>{void query.refetch();}} />;}
