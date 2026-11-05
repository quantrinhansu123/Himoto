import { ContractTypeManager } from '@/components/contract-type-manager';
import { useSession } from '@/providers/session';
import { StateView } from '@/components/ui';
export default function Route(){const{api,session}=useSession();if(!api||!session)return <StateView title="Chưa mở được loại hợp đồng" />;return <ContractTypeManager key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(',')}`} />;}
