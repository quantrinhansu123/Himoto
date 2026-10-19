// Only the reviewed cutover batch sets this flag. Ordinary legacy records and
// newly created contracts keep their existing workflow.
export function legacyContractReviewMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const migration = (payload as Record<string, unknown>).legacy_migration;
  if (!migration || typeof migration !== 'object' || Array.isArray(migration)) return null;
  const cutover = (migration as Record<string, unknown>).cutover;
  if (!cutover || typeof cutover !== 'object' || Array.isArray(cutover)
      || (cutover as Record<string, unknown>).reviewRequired !== true) return null;
  return 'Hợp đồng app cũ cần đối chiếu tiền, hồ sơ xe hoặc lịch thuê sở hữu trước khi thu tiền, gia hạn, trả cọc hay trả/đổi xe. Xem ghi chú hợp đồng.';
}
