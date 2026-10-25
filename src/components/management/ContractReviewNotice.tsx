import { TriangleAlert } from 'lucide-react';
import type { ManagementRow } from '@/lib/management/types';
import { contractReviewMessages } from '@/lib/management/contract-feedback';

export function ContractReviewNotice({row}:{row?:ManagementRow|null}) {
  const messages=contractReviewMessages(row);if(!messages.length)return null;
  return <aside className="mg-contract-review-notice" aria-label="Hồ sơ cần đối chiếu">
    <strong><TriangleAlert size={18} aria-hidden="true"/>Hồ sơ cần đối chiếu</strong>
    <ul>{messages.map(message=><li key={message}>{message}</li>)}</ul>
  </aside>;
}
