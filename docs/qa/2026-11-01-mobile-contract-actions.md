# Mobile issuance, reservation and handover — 01/11/2026

The app now provides a review screen for issuing saved drafts, recording initial
collections, taking rental advances to reserve stock, and handing over an existing
reservation. Subsequent standalone payments, renewals, returns and media capture
remain separate roadmap work. No production feature flag, migration or real
business row was changed during this milestone.

## Boundaries and behavior

- All four new route paths require a freshly verified bearer session plus
  `contracts.read` and `contracts.finalize`. A dedicated finalizer can review
  without being granted draft editing or general finance editing. Ownership
  approval follows the existing role policy, including legacy order types.
- Preparation projects customer/vehicle labels, the actual revenue branch,
  the contract window, balances, allowed receiving accounts and validation
  issues. It does not return payment history or the raw document/HR fields.
- The saved customer identity must match the persisted order. Unknown document
  fields and inconsistent identity require review rather than silent editing.
- Shared web validation supplies operational/reservation requirements. Existing
  pricing, printing and issuance use one contract window; differing imported
  line times remain visible and block mobile issuance until the operator
  explicitly aligns them and saves. Alignment preserves all other line data.
- `POST /contracts/:id/finalize` accepts explicit initial collections. Cash,
  personal-bank and company-bank accounts retain distinct identities even when
  numeric IDs collide. The review displays collected and outstanding amounts.
  Reservation advances count toward rental fees, rather than refundable deposit.
- `POST /contracts/:id/handover` accepts only the loaded revision and calls the
  existing handover service. It does not collect the advance again.
- Both mutations reuse the web domain services inside the scoped transaction.
  Actor/request UUID receipts commit with money/status/stock writes. Replays and
  `GET /contracts/requests/:key` verify current resource visibility. The client
  also rejects acknowledgements for a different contract.
- Uncertain outcomes retain their opaque `contract.finalize:*` or
  `contract.handover:*` key through process loss/reauthentication. Surrounding
  catalogue/detail data refreshes without replacing the open collection form.
  Dirty navigation, reload, overlap acknowledgement and final confirmation are
  explicit. The collection list is virtualized up to the domain's 100 rows.
- Existing manual notification outbox work is scheduled after the financial
  commit using Next's `after`. It cannot roll back money. This does not send a
  Telegram message automatically and does not certify eventual notification
  delivery if background work fails. Event keys remain deterministic for retries.

Routes are `/contracts/:id/preparation`, `/contracts/:id/finalize`,
`/contracts/:id/handover`, and `/contracts/requests/:key` under `/api/mobile/v1`.
They use the already prepared session/request-receipt migrations. No additional
table is required; the existing operation column accommodates these actions.

## Evidence

- `node scripts/check-mobile-contracts.cjs`: **8 groups** passed. DB clients and
  domain writes are synthetic. The actual wrapper, permissions, shared draft
  validation, identity/window checks, replay/revision/rollback handling, role
  policy, projection, queue separation and client decoding are exercised.
  Result: `.backups/mobile-contract-actions-results.json`.
- The shared business release suites passed **44/44**, with external networking
  disabled. They cover the actual issuance, payments, reservation and handover
  domain separately; a stubbed wrapper test is not a production transaction proof.
- Mobile API/client/form/palette checks total **43 groups**. Backend and mobile
  typechecks/lint passed before packaging.
- Browser preparation acceptance passed **6/6**, including legacy-window
  cancel/apply/save, split cọc/thuê with colliding account IDs, explicit overlap
  acknowledgement, reservation response loss and receipt recovery, handover
  without recollection, preserving invalid entered amounts, and persistent
  actions at 375×812, 430×932, 812×375 and 1024×768 in light/dark schemes.
  Evidence: `.backups/mobile-contract-ui-20261101/`.
- Existing composer **12/12** and foundation/customer **35/35** browser checks
  passed without page errors, real logins, unexpected hosts or operational writes:
  `.backups/mobile-contract-draft-regression-20261101/` and
  `.backups/mobile-contract-base-regression-20261101/`.
- Android/iOS JS/Hermes export passed:
  `mobile/.expo/native-contract-actions-qa/`. This is not a signed IPA/APK.
- Backend production build passed with the four new route paths, including the
  additional saved-customer identity guard.
- Android native `--contracts` acceptance passed **10/10**, `mode: full`, at
  07:22:04 on 01/11/2026. Evidence:
  `.backups/mobile-contract-native-20261101/results.json`. This selected suite
  covers login/keyboard, search/detail/Back, filters, legacy-window alignment and
  issuance, committed reservation recovery after process termination, handover
  without recollection, session restoration and logout. It uses synthetic data,
  reports zero operational writes and does not cover every business module.

The refresh/receipt-reconciliation patch at 07:10:26 has now passed the seventh
browser case: reload after a committed response is lost also resolves the pending
key. Evidence: `.backups/mobile-contract-ui-refresh-20261101/results.json`, 7/7.
Root/mobile lint and typechecks were rerun successfully. The older native 10/10
and bundle evidence above retain their original scope. Latest reconciliation,
bundle and native evidence is tracked in [write recovery QA](2026-11-01-mobile-write-recovery.md).
No physical iPhone, large native text, screen reader or release-performance
certification is claimed. See the [handoff](../mobile-handoff-2026-11-01.md).

Framework reference: [Next.js after](https://nextjs.org/docs/app/api-reference/functions/after).

## Remaining operational work

The device ledger remains bounded to eight unresolved requests across accounts.
Server-confirmed cancellation/reconciliation is now implemented for abandoned
uncommitted intents; see the [protocol and QA](2026-11-01-mobile-write-recovery.md).
PostgreSQL staging concurrency validation, signed device QA and
the remaining business modules remain required by the full project goal.
