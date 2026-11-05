import { router,useLocalSearchParams } from 'expo-router';
import { useSession } from '@/providers/session';
import { ContractTypeResult } from '@/components/contract-type-result';
import { StateView } from '@/components/ui';
export default function Route(){const{key}=useLocalSearchParams<{key:string}>(),{api,session}=useSession();if(!api||!session||!/^[0-9a-f-]{36}$/.test(key))return <StateView title="Không mở được xác nhận loại hợp đồng" />;return <ContractTypeResult key={`${key}:${api.origin}:${session.token}:${session.user.permissions.join(',')}`} requestKey={key} onDone={()=>router.replace('/contract-types')} />;}
