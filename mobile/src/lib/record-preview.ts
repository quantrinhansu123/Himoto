import type { QueryClient } from '@tanstack/react-query';
import type { CatalogueKind, MobileRecord, MobileUser } from '../../../shared/mobile-contract';

export const recordPreviewKey = (origin: string, user: MobileUser, kind: CatalogueKind, id: string) =>
  ['record-preview', origin, user.id, user.storeId, user.allStores, [...user.permissions].sort().join(','), kind, id] as const;
export function rememberRecordPreview(client: QueryClient, origin: string, user: MobileUser, kind: CatalogueKind, record: MobileRecord) {
  // A list preview must never refresh the timestamp of a server detail query.
  client.setQueryData(recordPreviewKey(origin, user, kind, String(record.id)), record);
}
