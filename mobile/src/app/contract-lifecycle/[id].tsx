import { useLocalSearchParams } from 'expo-router';
import { useSession } from '@/providers/session';
import { StateView } from '@/components/ui';
import { ContractLifecycleEditor } from '@/components/contract-lifecycle-editor';
export default function ContractLifecycleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(), { api, session } = useSession();
  if (!api || !session || !/^[1-9]\d{0,14}$/.test(id) || !session.user.permissions.includes('contracts.read')) return <StateView title="Không mở được tình trạng hợp đồng" />;
  return <ContractLifecycleEditor key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(',')}:${id}`} id={id} />;
}
