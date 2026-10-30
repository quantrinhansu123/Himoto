# Renewal period, fee and Telegram corrections — 2026-10-30

## Reproduced causes

- Telegram selected `created_at` / `occurred_at` ahead of `before_return_at`. Late collection or entry changed the displayed rental coverage, even producing a start later than the due date. The editor already held the requested coverage, so saving it returned an erroneous no-change error.
- Imported histories reused renewal version numbers. A receipt loop could overwrite the current composer period with a different receipt of the same version, and the editor also selected receipts by version alone.
- Cancelled receipts remained editable without an obvious status, and there was no separate renewal fee input. Grid fieldset legends and fixed two-column native datetime inputs overflowed on mobile.
- The old correction check script targeted a real customer order, used pool-level BEGIN/COMMIT without pinning a connection, and committed changes. It has been replaced with synthetic TEMP fixtures, strict SQL rewriting, a pinned connection and unconditional rollback. No customer correction was run as a test in this change.

## Resulting behavior

- Rental coverage uses the saved previous deadline and new deadline. Receipt/event creation time remains separate. Unchanged saved dates reload successfully without another audit entry.
- The current composer period stays authoritative. A different receipt reusing the version gets its own event; only matching receipts identify payment methods or editor receipt IDs. Event options include period and fee.
- Cancelled vouchers are labelled, cannot change contract fees, and cannot send/resume/retry a Telegram notice through this screen. Sent history and retraction controls remain available.
- Editing a fee on an active rental changes only the contract charge, vehicle line renewal amount and saved renewal amount by the fee difference. Returned vehicles and closed contracts cannot have their charge edited here. Receipt value, receipt date and paid total are preserved. A reason is required, the change is audited, revisions change for metadata edits, and UUID retries are idempotent.
- Changing the current deadline also updates the explicit parent deadline when present. Editing a historical period cannot move a vehicle back from a later renewal. Errors roll back the whole transaction.
- Mobile dates use separate date and 24-hour controls. Preview refresh does not send, edit or retract any Telegram message.
- Reopening/reloading an editor clears the old form synchronously. A late context response cannot overwrite edits entered into briefly visible data from the previous opening; this race was detected when checking the optimized deployment.

## Read-only checks on the reported contracts

Before any data mutation, production records already contained:

| Contract | Recorded current period | Current fee | Approved receipt | Separate cancelled receipt |
| --- | --- | --- | --- | --- |
| VPS-19881 | 23–27 October 2026, 15:04 | 1,200,000 VND | #185964: 1,200,000 VND | #172946: 900,000 VND |
| VPS-27454 | 15–22 October 2026, 16:30 | 910,000 VND | #185986: 910,000 VND | #172328: 450,000 VND |

These are database facts, not independent confirmation of bank settlement. The supplied 900,000 VND bill must not be relabelled as 1,200,000 VND. No customer financial data was changed and no Telegram was sent by this investigation. Any reconciliation of the additional approved receipt requires the operator's confirmation.

## Verification

- `node scripts/check-renewal-payment-corrections.cjs --live-temp`: 8 groups, including fee/paid separation, no-op, revision conflicts, UUID replay, reused version/cancelled voucher, deadline preservation, injected rollback failure, and PostgreSQL RLS.
- `python scripts/check-renewal-payment-corrections-ui.py ...`: 10 checks across Chromium and WebKit; widths 320/375/390px; routing corrections, 409 recovery, lost-response replay, period/fee changes, receipt selection under reused versions and cancelled receipt guards. All API mutations mocked; no JavaScript errors or real Telegram requests.
- `node scripts/check-contract-payments.cjs --live-temp`: 19 groups. TEMP fixtures updated for retained notification versions and mandatory bill evidence.
- `node scripts/check-contract-renewals.cjs --live-temp`: 6 groups.
- `node scripts/check-gps-contract-integrations.cjs --telegram-controls-only`: 13 groups. Corrected the obsolete 21-item limit assertion to the existing 50-item limit.
- Local authenticated GETs against the two production contracts verified current previews, exact receipt IDs, four/seven-day coverage and cancelled receipt send guards without writes.
- `tsc --noEmit`, ESLint and production build are release checks. Browser automation is not a physical iPhone/Safari device test.

Private snapshots, screenshots and API check results are kept under the ignored `.backups/renewal-corrections-20261030/` directory. Credentials and customer media are not committed.
