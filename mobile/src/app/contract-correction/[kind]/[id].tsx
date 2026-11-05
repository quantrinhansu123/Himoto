import { useLocalSearchParams } from 'expo-router';
import { useSession } from '@/providers/session';
import { StateView } from '@/components/ui';
import { ContractCorrectionEditor } from '@/components/contract-correction-editor';
export default function ContractCorrectionScreen() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind: string }>(), { api, session } = useSession();
  const allowed = session?.user.permissions.includes('contracts.read') && (session.user.permissions.includes('finance.write') || session.user.permissions.includes(kind === 'receipts' ? 'contracts.draft' : 'contracts.renew'));
  if (!api || !session || !allowed || !/^[1-9]\d{0,14}$/.test(id) || kind !== 'receipts' && kind !== 'renewal') return <StateView title="Không mở được màn sửa khoản thu" />;
  return <ContractCorrectionEditor key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(',')}:${kind}:${id}`} id={id} kind={kind} />;
}
