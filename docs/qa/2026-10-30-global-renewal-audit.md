# Global renewal audit — 2026-10-30

The review covers all nondeleted vehicle rental/ownership orders, not just the two reported contracts. Legacy battery anchor orders are excluded from vehicle renewal checks. Deleted records are counted for scope only.

## Data checks

The overall financial projection is collected inside one PostgreSQL `REPEATABLE READ READ ONLY` transaction. It compares each order's paid field with approved income minus rental refunds, excluding outside collections; refundable deposits remain separate. Legacy imports, negative historical values, missing deposit receipts and later cancellations are review flags, not proof of lost revenue and not authority to rewrite totals.

Every order with renewal evidence is then exercised through the actual `readPaymentContext`, `readContractTelegram` and `readContractHistory` functions, each inside a pinned read-only transaction. Checks cover valid coverage dates, receipt IDs in the selected period, cancelled receipt sending guards, and the exact approved receipt amounts used by Telegram previews. The current sample contains 140 such orders and 355 preview events; both the initial and hardened matching implementation completed all reads without a flagged mismatch. This verifies the read path, not bank settlement or the customer's agreed dates.

Detailed per-order CSVs, per-period CSVs, snapshots and the Vietnamese report remain under the ignored `.backups/global-contract-audit-20261030/` directory. They contain no customer phone numbers, bank account numbers or media. Financial exports and customer-specific findings are not committed to Git. The audit made no production business writes or Telegram requests.

## Additional defects reproduced and fixed

- `sameRenewalPeriod` returned true for equal creation timestamps before checking coverage bounds. An edited period could therefore absorb an older receipt. It now checks explicit valid bounds and vehicle identity before the timestamp fallback. Empty snapshots and timestamps alone do not identify coverage; legacy snapshots with complete bounds or a shared bound plus event identity remain supported.
- A fee/period correction updated only the selected receipt snapshot, even when multiple approved vouchers collected the same renewal in parts. Corrections now synchronize fee/coverage metadata for the approved matching receipts, preserve actual values, dates, receiving accounts and collected amounts, bump revisions and record all affected receipt IDs in the correction audit. A final-write failure rolls back the sibling updates too.
- A receipt-specific Telegram event could still be edited while its delivery was pending if the receipt retained a version number. Correction locking now checks both the version event and the receipt-specific event. The regression reproduces the previously missed pending notice and expects a conflict.
- The cross-branch fixture needed its mandatory saved bill and the current contract vehicle-label helper. Its SQL guard still rejects business queries outside TEMP tables and its RLS checks remain enabled.

## Verification

- `node scripts/check-renewal-period-matching.cjs`: 11 matching cases; reproduced the equal-timestamp/different-period failure before the fix.
- `node scripts/check-renewal-payment-corrections.cjs --live-temp`: 10 groups, including a distinct receipt period with the same timestamp, partial collections, preserved money/date/account, revision changes, injected rollback failures, no-op saves, UUID replay, deadline preservation and RLS. The partial-collection case failed before synchronization was added.
- `node scripts/check-contract-payments.cjs --live-temp`: 20 groups.
- `node scripts/check-contract-renewals.cjs --live-temp`: 6 groups.
- `node scripts/check-renewal-collection.cjs`: 10 groups.
- `node scripts/check-cross-branch-renewals.cjs`: 7 groups.
- `node scripts/check-gps-contract-integrations.cjs --telegram-controls-only`: 13 groups.
- `node scripts/check-contract-receipt-summary.cjs`: 3 groups.
- Browser regression uses `check-renewal-coverage-ui.py` and `check-renewal-payment-corrections-ui.py` on Chromium/WebKit with mocked business mutations. This includes early/late payment, hourly and multi-vehicle renewals, a missing prior deadline, slow context loads, lost responses, and mobile widths down to 320px.
- TypeScript, ESLint and a production build are release checks. Browser emulation does not replace physical iPhone/Android testing.

The audit does not bulk-reconcile imported contract amounts, change historical deadlines, revive cancelled receipts, or alter previously sent Telegram messages.
