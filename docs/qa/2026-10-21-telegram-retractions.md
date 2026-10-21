# Staff retracting an incorrect contract notification

Open **Danh sách hợp đồng → ⋯ → Gửi Telegram → Thu hồi tin Telegram**. Choose the exact delivery, inspect its original text, enter a reason and check the confirmation before clicking **Xác nhận thu hồi Telegram**. Cancelled contracts expose **Lịch sử Telegram / Thu hồi tin**. The contract detail's Telegram tab also supports the same flow.

The employee needs the original event's operation permission and access to its contract/branch. No bot token or arbitrary chat/message ID is accepted from the browser. Retraction removes only the saved text/photo/video IDs from that delivery. Orders, finance receipts, returns and stored photos are unchanged. After success the employee can correct the contract and explicitly send again; cancelled contracts cannot send again.

After a successful retraction, the preview rebuilds business fields from the corrected contract instead of recycling the bad sent snapshot. A successful replacement delivery becomes the new immutable baseline for duplicate prevention.

Each new delivery freezes chat/topic, bot identity and earliest send time before contacting Telegram. Continuations use the frozen destination even after group configuration changes. All message IDs and original outbox payloads remain as history. A reason, actor, request time, acknowledged deleted IDs and final/error outcome are audited in the existing delivery review.

Retraction is queued/committed before the worker contacts Telegram. `deleteMessages` batches up to 100 IDs; already missing messages are skipped by Telegram. Atomic claims prevent overlapping workers. Failed/ambiguous responses retain checkpoints, block resend and expose a manual retry. No automatic replay after failure. A process interrupted while claiming is recoverable after two minutes. The request's background callback invokes only the retraction worker; scheduler runs can also recover pending requests. Retraction is refused while a newer attempt of the same transaction is sending.

Telegram's 48-hour deletion limit applies. We reserve a one-minute margin at confirmation. The saved earliest send time protects albums spanning multiple calls. Missing historical targets, changed bot identities, incomplete/unconfirmed sends and expired deliveries require direct group-admin handling. Reference: https://core.telegram.org/bots/api#deletemessages

Deployment migration: `node scripts/migrate-telegram-retractions.cjs --apply`. It adds two nullable JSONB metadata columns and a queue index, retaining current RLS. Scoped roles may update the retraction request; delivery targets remain server-only writes. Legacy targets are backfilled only where bot settings, destination configuration, order and branch have all remained unchanged since queuing. The migration applied successfully and recovered 118 recent delivery targets initially. It made no Telegram requests.

Validation:

- Production build/typecheck/lint pass, with the same three existing hook warnings.
- Full GPS/contract/Telegram integration suite: 32 groups in an isolated schema and rollback, zero production business/sequence writes and zero real Telegram calls. Includes batch deletion, exact IDs/target, concurrent claim, duplicate request, scoped branch authorization, expired/legacy/changed-bot guards, partial progress, retry and unchanged financial data.
- Retraction API checks: 3 groups for auth/CSRF, response codes/rollback and commit-before-dedicated-worker dispatch; no notification send worker on a retract request.
- Existing delivery checks: 4 groups, including media continuation and scheduler behavior.
- Browser UI: 16 scenarios across Chromium 1440px and WebKit 390px. Explicit confirmation/reason, no auto-send after retract, explicit resend, exact older delivery selection, expiry/read-only/legacy, failed retry/API failure and cancelled-contract history. Every API mutation intercepted. No JavaScript errors or horizontal overflow.
- Older integration photo fixtures were updated to match the existing reference-based photo queue; legacy inline-byte snapshots are still verified. This feature does not change photo hydration behavior.

Synthetic screenshots/reports are local under `.backups/telegram-retractions-20261021/`. No real group message was sent or deleted for QA.
