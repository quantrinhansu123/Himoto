import { useLocalSearchParams } from 'expo-router';
import { useSession } from '@/providers/session';
import { StateView } from '@/components/ui';
import { ReturnCorrectionEditor } from '@/components/return-correction-editor';
export default function ReturnCorrectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(), { api, session } = useSession();
  if (!api || !session || !/^[1-9]\d{0,14}$/.test(id) || !session.user.permissions.includes('contracts.read') || !session.user.permissions.includes('contracts.return')) return <StateView title="Không mở được sửa hồ sơ trả xe" />;
  return <ReturnCorrectionEditor key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(',')}:${id}`} id={id} />;
}
