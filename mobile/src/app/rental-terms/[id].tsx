import { useLocalSearchParams } from 'expo-router';
import { StateView } from '@/components/ui';
import { RentalTermsEditor } from '@/components/rental-terms-editor';
import { useSession } from '@/providers/session';
export default function RentalTermsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(), { api, session } = useSession();
  if (!api || !session || !/^[1-9]\d{0,14}$/.test(id) || !session.user.permissions.includes('contracts.read') || !(session.user.role === 'admin' || session.user.permissions.includes('contracts.draft'))) return <StateView title="Không mở được tiền / ngày thuê" />;
  return <RentalTermsEditor key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${id}`} id={id} />;
}
