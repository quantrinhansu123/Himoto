import { useLocalSearchParams } from 'expo-router';
import { StateView } from '@/components/ui';
import { ContractEditEditor } from '@/components/contract-edit-editor';
import { useSession } from '@/providers/session';

export default function ContractEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(), { api, session } = useSession();
  if (!api || !session || !/^[1-9]\d{0,14}$/.test(id) || !session.user.permissions.includes('contracts.read') || !(session.user.role === 'admin' || session.user.permissions.includes('contracts.draft'))) return <StateView title="Không mở được màn sửa hợp đồng" />;
  return <ContractEditEditor key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(',')}:${id}`} id={id} />;
}
