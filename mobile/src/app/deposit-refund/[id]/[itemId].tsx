import { useLocalSearchParams } from 'expo-router';
import { DepositRefundScreen } from '@/components/deposit-refund-screen';
import { StateView } from '@/components/ui';
import { useSession } from '@/providers/session';

export default function Route() {
  const { id, itemId, event } = useLocalSearchParams<{ id: string; itemId: string; event?: string }>();
  const { api, session } = useSession();
  const identifier = /^[1-9]\d{0,14}$/;
  const permissions = session?.user.permissions ?? [];
  if (!api || !session || !identifier.test(id) || !identifier.test(itemId) ||
      !permissions.includes('finance.write') && !(permissions.includes('contracts.read') && permissions.includes('contracts.return'))) {
    return <StateView title="Không mở được hồ sơ hoàn cọc" />;
  }
  return <DepositRefundScreen key={`${api.origin}:${session.user.id}:${session.user.storeId}:${session.user.allStores}:${permissions.join(',')}:${id}:${itemId}`}
    id={id} itemId={itemId} event={typeof event === 'string' && event.startsWith(`return:${id}:`) ? event : undefined} />;
}
