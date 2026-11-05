# Mobile contract finance — 01/11/2026

Staff with the existing financial grants can review scoped balances/history and
record actual rental/debt receipts, missing deposits, extra receipts, deposit
refunds and early-return rental refunds. The app uses the existing payment domain
and cashbook tables. It does not initiate a bank transfer or create a separate
ledger. Linked renewal receipts and renewal corrections remain roadmap work.

## API and business boundary

- `GET /api/mobile/v1/contracts/:id/finance?page=1` requires `contracts.read` and
  `finance.read` or `finance.write`. It projects explicit balances, valid
  method-qualified accounts, available purposes, ownership billing summary and
  up to 25 historical receipts. It excludes raw composer/HR documents.
- `POST /contracts/:id/payments` requires `contracts.read` plus `finance.write`;
  issuance permission alone does not grant financial access. The UUID comes only
  from `Idempotency-Key`. Unknown fields, forged actor/store/request IDs, unsupported
  purposes, malformed revisions and invalid money/date input are rejected.
- `recordContractPayment` and the actor's mobile receipt commit in one scoped
  transaction. The response identifies the exact transaction ID and contract.
  `GET /payments/requests/:key` rechecks current actor/grants/resource visibility.
  Cancellation/reconciliation supports `payment.record:<contract ID>` using the
  same durable tombstone protocol as earlier writes. No new migration is needed.
- Over-collection follows the existing backend rule. If a positive rental balance
  is exceeded, the excess increases the contract total. If already fully paid,
  an extra debt receipt does not invent that total increase. The mobile review
  shows the effect and requires explicit overpayment acknowledgement. Extra
  receipts explicitly increase both total and paid amounts. Refund limits and
  hold/completion gates remain in the shared domain.
- Requests carry the reviewed total/remaining as well as `xmin`. Ownership
  installments can accrue without an `xmin` change; stale reviewed balances are
  rejected. The mobile transaction captures one server clock for its validation
  and all domain context reads, preventing a period boundary from changing the
  confirmed total halfway through that transaction.

The shared payment read model has an optional bounded-history mode. Aggregate
company receipts and prior rental refunds are computed across the full approved
history, independently of the page. Payment writes use summary-only mode. Default
web callers retain their original shape and behavior. Actual SQL execution is
covered by the isolated PostgreSQL suite below. Concurrent-session locking,
deployed RLS policies and staging performance still need separate verification.

## Mobile behavior

Contract detail opens a financial summary with explicit Load more and retry.
Failed later pages retain earlier receipts. Read-only roles cannot open recording
controls. The editor uses native date/time controls, method-qualified accounts,
safe areas, a persistent confirmation action and an explicit review dialog.

An uncertain request locks input and blocks another payment. Reconciliation
returns its exact saved transaction, or confirms that the old key is permanently
cancelled before unlocking the preserved form. Revision conflicts, accrual drift,
outages, process loss and reauthentication retain scoped metadata. Account recovery
keeps financial keys until the dedicated screen shows the transaction receipt and
the operator opens its financial history. Form contents and tokens are not stored
in the pending ledger.

## Evidence

- Financial API/client/read-model tests: **8 groups**,
  `.backups/mobile-finance-api-results.json`. Actual wrappers, parsing,
  permissions, scope, atomic/replay handling, cancellation and client decoding
  execute against synthetic DB/domain responses. The actual shared read model is
  separately exercised with aggregate values outside the visible page and an
  ownership period boundary. This is not proof of PostgreSQL execution/locking.
- Full mobile API/client/form/palette/scope suite: **62 groups**,
  `.backups/mobile-finance-api-verified-20261101.log`.
- Isolated PostgreSQL execution: **11 groups** (nine finance, two renewal preparation),
  `.backups/mobile-finance-sql-results.json`. Uses PGlite 0.5.14 in memory,
  the real `scopedConnect` transaction plumbing, shared payment read/write domain,
  mobile wrappers and actual mobile-request migration. Tests all five purposes,
  bounded/global history aggregates, exact receipts/replay, rollback after money
  writes, lost commit responses, durable cancellation, actor/branch RLS, reviewed
  balance/refund limits, over-collection and installment clock boundaries.
  Branch policies/base tables are synthetic; this is one connection and does not
  certify deployed RLS, competing transactions or staging performance.
  The additional preparation checks execute next-version references, exact bill
  evidence, scoped active-vehicle prices and the separate `contracts.renew` grant.
- Shared domain release suites: **44/44**, networking disabled,
  `.backups/mobile-finance-release-final.log`.
- Browser financial acceptance: **11/11**,
  `.backups/mobile-finance-final-finance-ui-20261101/results.json`. Covers all five
  purposes, history-page failure/retry, equal numeric account IDs, review/cancel,
  lost committed responses, unknown uncommitted requests, late blocked writes,
  lost cancellation acknowledgement, revision and accrual conflicts, expiry and
  reauthentication, refund limits, read-only controls and four viewport/theme
  configurations. No page errors, unexpected hosts, operational writes or real logins.
- Root/mobile typechecks and lint passed after the production build. One earlier
  direct typecheck overlapped Next's regeneration of `.next/types` and failed on
  removed generated files; the sequential rerun passed without changing tsconfig.
- Backend production build passed with the three new routes:
  `.backups/mobile-finance-backend-final-build-20261101.log`, including the final
  receipt RLS correction.
- iOS/Android Hermes export passed: `mobile/.expo/native-finance-accessible-qa/`.
  These are JavaScript artifacts, not a new signed APK/IPA or a performance result.

- Browser regressions after the final sticky-action/scope/accessible-label fixes passed foundation/customer **35/35**,
  composer **12/12** and issuance/reconciliation **10/10**. Evidence directories:
  `.backups/mobile-finance-final-base-ui-20261101/`,
  `.backups/mobile-finance-final-draft-ui-20261101/` and
  `.backups/mobile-finance-final-contract-ui-20261101/`.

Android financial acceptance passed **12/12**, `mode: full`, at
`2026-11-01T08:22:42Z` (15:22 Vietnam time). Evidence:
`.backups/mobile-finance-native-20261101-accessible/results.json`, screenshots,
`crash-buffer.log` and `anr-buffer.log`. Zero new app crashes/ANRs in the recorded
window (`startedEpoch: 1793520502`). This includes all five purposes, native
date/time pickers and keyboard, exact receipts, over-collection, process loss,
Account recovery, cancellation of an uncommitted request, Keystore restoration
and logout. The settled reconciliation node was asserted to expose its current
accessible label rather than a stale busy description. Counters ended at six
payments, two reconciliations and one tombstone; no operational data was used.

The existing x86_64 debug APK was reused with current Metro JavaScript; these
changes added no native dependency. This does not certify a new release binary,
a physical device or the remaining business workflows.

Source/bundle hashes for this checkpoint are retained in
`.backups/mobile-finance-provenance.json`. Before starting native media work, the
accepted APK was copied and hash-verified at
`.backups/mobile-finance-debug-before-media-20261101.apk`. Later renewal-client
and media changes are outside that financial acceptance snapshot.

## Native iteration and scope correction

The first financial native attempt stopped after eight completed groups: after
a lost response the reconciliation action was above the current scroll position.
The form now scrolls to errors and places reconciliation in the persistent action
bar, replacing the new-payment action while an old request is unresolved.
The failed result is retained in `.backups/mobile-finance-native-20261101/`.
Its transaction #9006 was subsequently recovered through the app before any fixture
reset; pending storage was not erased to get a passing run.

The next full attempt also stopped after eight groups. Its screenshot shows the
sticky action in place, but its native accessibility node retained only `busy`
after loading completed. React Native's Android content-description update leaves
the earlier description unchanged when no explicit label/state text remains. The
shared button now supplies its visible label explicitly. This preserves the
loading/disabled states and gives native automation/assistive technology the
current action name. The failed evidence and native XML remain in
`.backups/mobile-finance-native-20261101-verified/`; a subsequent pass must use a
different evidence directory. Full TalkBack/VoiceOver acceptance remains open.

A recovery attempt also observed an ANR during debug bundle startup, with a
`failed to complete startup` event. Evidence:
`.backups/mobile-finance-debug-anr-before-prewarm.png` and
`.backups/mobile-finance-debug-exit-info.log`. The recovery helper was corrected
to prewarm the full entry like the regular native harness. This does not prove
the underlying startup cause fixed. The native harness now rejects both new app
crashes and new `am_anr` events in its acceptance window.

A regression also reproduced loss of a resource-specific pending key when the
same actor changed branch/all-stores scope. The ledger now persists the same UUID
under that actor's current scope before returning it. Current permissions and
resource visibility are still checked on every server request. Other actors and
origins remain isolated; creation intents remain destination-scoped. Conflicting
older keys fail closed instead of choosing or deleting one. Five focused storage
groups passed: `.backups/mobile-pending-scope-results.json`; the pre-fix failure is
retained in `.backups/mobile-pending-scope-before-fix.log`. Real SecureStore scope
transition acceptance passed **3/3**, `mode: writes-only`, at
`2026-11-01T08:28:07Z` (15:28 Vietnam time):
`.backups/mobile-finance-scope-native-20261101/results.json` and
`22-native-scope-recovered-payment.png`. This separate run committed one payment,
changed the same actor from branch scope to all-stores, restarted the process and
recovered the original #9001 before allowing another intent. It then checked
Keystore restoration and logout. Zero new app crashes/ANRs in its recorded window
(`startedEpoch: 1793521398`). It is not an additional full acceptance run.

SQL execution also reproduced an RLS edge case: the actor could still read their
mobile request while the joined payment was hidden after a branch change. The
receipt reader now checks current contract visibility before treating a missing
transaction as a malformed receipt, returning `FORBIDDEN` for that scope change.
The synthetic wrapper and actual SQL suites both retain this regression.

## Reproduce isolated SQL acceptance

From the repo root (no environment files or database credentials needed):

```powershell
npm.cmd install --prefix .backups/mobile-sql-qa --no-save --package-lock=false --ignore-scripts @electric-sql/pglite@0.5.14
npm.cmd run test:mobile:sql -- --pglite-path .backups/mobile-sql-qa/node_modules/@electric-sql/pglite
```

The runtime is installed only under ignored QA artifacts, not in app dependencies.
The test blocks network clients before loading the application modules. CI repeats
these commands and preserves its result. [PGlite API](https://pglite.dev/docs/api).

## Remaining gates

Signed iOS/Android release, physical iPhone/Android acceptance, larger native text,
VoiceOver/TalkBack and release performance remain open. The earlier debug inspector
crash remains unproven as fixed; native acceptance now rejects new app crashes.
No production flag, migration, signing account, secret or operational row was changed.
