# Renewal and return-photo incident — 2026-10-21

## Findings from read-only inspection

- `VPS-29021` is order `57520`, rental line `62321`. The contract is in branch `23`, while vehicle `931` is managed by branch `32`. Actor `151` can read the contract/line and the shared vehicle label, but cannot read the foreign vehicle table row. The live `order_vehicle_details` UPDATE policy requires that vehicle row to be visible, so saving the renewal fails with an RLS violation. Three renewal photos exist; no renewal version or linked renewal receipt has been created.
- `005178` is order `57758`, completed rental line `62587`. Its saved attachments contain rental photos, but no return photos. The return notification correctly has no return attachments.
- Two authenticated images uploaded by actor `152` at **20:44:12** and **20:44:20 Asia/Saigon** remain in Cloudinary without a record attachment. Visual inspection identifies the signed `005178` contract/return document and its matching refund-recipient QR. The originals remain available. This establishes an upload/attachment gap; it does not establish whether the original Save action was omitted or failed.
- No live rental dates, fees, receipts, attachments, account permissions or Telegram deliveries were changed during investigation.

## Local changes

- Scoped renewals use `extend_contract_vehicle_line`, a restricted database helper which only changes the existing line's deadline and renewal amount. It verifies actor, contract scope, line ownership, status, completion, revision, later deadline and fee bounds. Foreign vehicle identity/location/write policies remain unchanged. Both the renewal dialog and Cashbook renewal path use it; the surrounding transaction still owns the contract total, history, receipt and notification preview.
- Photo saves require a successful JSON acknowledgement, followed by a fresh saved-photo list containing every submitted slot. Failed/unconfirmed saves keep the selected files and block confirming the transaction.
- Closing a renewal/return dialog with unsaved files asks before discarding them, including the header, Escape/backdrop and footer close paths.

## Validation

```powershell
node scripts/check-cross-branch-renewals.cjs
node scripts/check-renewal-collection.cjs
node scripts/check-record-photo-save.cjs
node scripts/check-photo-ocr.cjs
node scripts/check-refund-qr.cjs
node scripts/check-contract-payments.cjs
python -X utf8 scripts/check-renewal-collection-ui.py --url http://127.0.0.1:3014 --branch-cookie-file <private-session-file> --output <private-output>
python -X utf8 scripts/check-return-compact-ui.py --url http://127.0.0.1:3014 --cookie-file <private-session-file> --browser chromium --output <private-output>
python -X utf8 scripts/check-return-compact-ui.py --url http://127.0.0.1:3014 --cookie-file <private-session-file> --browser webkit --output <private-output>
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

The cross-branch database suite reproduces the original RLS error and tests the new helper with `SET LOCAL ROLE himoto_scoped` on isolated TEMP tables. It covers paid/unpaid renewals, UUID replay, rollback after receipt creation, forbidden contracts/lines/revisions/fees/statuses, installment plans and the Cashbook path. All database fixtures and helper DDL roll back; live business tables and sequences are untouched. Browser mutations and provider calls are intercepted.

Results: 7 cross-branch RLS groups, 8 atomic renewal/collection groups, 3 photo-save groups, 4 OCR groups, 5 refund-QR groups and 4 payment groups pass. Renewal browser checks pass all 6 scenarios across Chromium (1440 px) and WebKit (390 px), including an acknowledged-but-unattached file, preserved pending files, dismissed close confirmation and a verified retry. Compact return regression passes all 13 groups on each browser. No browser JavaScript errors or unexpected API mutations occur. Typecheck and the final production build pass. Lint has the same three pre-existing hook warnings in `ManagementPage` and `StaffOrganizationChart`.

## Deployment and recovery

1. Apply `docs/sql/2026-10-21-cross-branch-renewals.sql` before deploying the application. The migration defines/grants one helper; it updates no business records.
2. Deploy and verify branch-scoped reads. Do not submit a real renewal or payment for testing.
3. A private recovery plan under `.backups/renewal-return-20261021/recovery-plan.json` maps the reviewed originals to `return-62587-document-1` (signed document) and `return-62587-document-2` (QR). It includes original versions and image hashes; both hashes were verified by downloading the original assets again. Recovery must verify the contract/line and must not overwrite different existing photos. Attaching the two originals requires the user's approval to modify live records. It does not require repeating the return/refund or sending Telegram.

Before the authorized GitHub push, the database migration was applied and verified: the helper is installed, executes as its owner with a fixed search path, grants execution to `himoto_scoped`, and grants no public execution. It changed no business records. The application changes are prepared for Git-triggered Vercel deployment. The two-photo recovery plan remains **preview only**; pushing code does not attach these images or repeat a return/refund.
