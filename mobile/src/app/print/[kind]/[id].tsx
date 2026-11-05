import { lazy, Suspense } from 'react';
import { Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { requireOptionalNativeModule } from 'expo';
import { useSession } from '@/providers/session';
import { StateView } from '@/components/ui';
const Editor = lazy(() => import('@/components/print-editor').then(m => ({ default: m.PrintEditor })));
export default function PrintScreen() {
  const { kind, id, version } = useLocalSearchParams<{ kind: string; id: string; version?: string }>(), { api, session } = useSession();
  if (!api || !session || !['contracts', 'battery-contracts'].includes(kind) || !/^[1-9]\d{0,14}$/.test(id) || !session.user.permissions.includes('contracts.read') || version && !/^[a-zA-Z0-9:_-]{1,100}$/.test(version)) return <StateView title="Không mở được mẫu in" />;
  if (Platform.OS !== 'web' && !requireOptionalNativeModule('ExpoPrint')) return <StateView title="Cập nhật Himoto để xem giấy và in" message="Bản ứng dụng hiện tại chưa hỗ trợ hộp thoại in và PDF." />;
  return <Suspense fallback={<StateView title="Đang mở mẫu in" loading />}><Editor key={`${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(',')}:${kind}:${id}:${version || ''}`} kind={kind as 'contracts' | 'battery-contracts'} id={id} initialVersion={version} /></Suspense>;
}
