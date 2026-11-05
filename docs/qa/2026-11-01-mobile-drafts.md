# Mobile contract composer — 01/11/2026

This milestone adds the backend/client contract and four-step mobile composer.
It supports incomplete draft creation and revision-bound editing, using the
existing web domain service. It does not issue a contract, collect money or hand
over stock. Native drafting acceptance is recorded separately below; browser
results alone do not certify a native build or a physical iPhone.

## Implemented

- Scoped contract options, complete editable document projection and reopen.
- Create/update through the existing `saveDatabaseDraft` domain service, with
  actor-specific transactional idempotency and required update revisions.
- Receipt recovery and current resource-visibility checks, including replays.
- Paginated stock selection and window checks using the same rental conflict
  functions as issuance. Hard rentals, deposit overlaps and soft drafts retain
  their business meaning and full counts when detail lists are capped.
- Scoped numeric customer selection and exact cross-branch customer lookup
  under the existing composer policy, guarded by the required customer grant.
- Strict wire projections, 512-KiB request bound, date validation, structured
  field feedback and preservation of ownership/custom-installment fields.
- Opaque pending keys support both customer and draft operations. Forms and
  customer identity information remain memory-only on the device.
- Four steps: rental information, customer snapshot, stock and review. Persistent
  save and previous/next actions, native date/time pickers, scoped revenue/shared
  stock stores and attribution choices from active staff names/roles.
- Explicit customer replacement confirmation, optional documents/relatives,
  per-vehicle driver/equipment details, fees, ownership terms, requirements and a
  virtualized, staged installment editor. Existing hidden types are preserved.
- Revision conflicts and dirty navigation require confirmation. Incomplete
  identity data can be saved; malformed entered money/dates remain visible.
- Unresolved UUIDs survive expiry/logout in small device-only SecureStore entries
  without retaining the token or form. Metadata remains isolated across actors,
  origins and store scopes; legacy IDs migrate before any new submission. A
  bounded manifest or storage corruption cannot silently cause a replacement key.

No new SQL migration is required beyond the already prepared mobile session and
request-receipt migrations. No production migration, deployment or feature flag
was changed for this milestone.

## Evidence

`node scripts/check-mobile-drafts.cjs` exercises 9 groups with synthetic DB
clients and a stub of the existing domain write service. It checks permission
and store binding, schema/date rejection, transactional replay/conflict
behavior, revision handling, current receipt visibility, document preservation,
stock projection/pagination, availability categories, exact lookup scope and
client decoding and the active staff projection. Existing release suites cover
the shared domain separately.

`node scripts/check-mobile-draft-form.cjs` passed 5 groups covering legacy type
restoration, whole-driver identity preservation, placeholder equipment/date
preservation, duplicate stock, date overrides and validation without erasing
input. It also runs without assuming native `structuredClone` availability.

`python scripts/check-mobile-draft-ui.py` passed **12/12** browser groups against
intercepted synthetic responses. It covers staff/date/time values, customer and
stock pickers, hard/deposit conflict labels, entered amounts/fees, installment
Apply/cancel, create/reopen/update, revision conflict confirmation, lost-response
retries, dirty navigation, committed receipt recovery, expiry followed by another
actor's login/logout and recovery by the original actor, exact foreign-customer
lookup and all four steps at 375×812, 430×932, 812×375 and 1024×768. No page
errors, unexpected hosts, real logins or operational writes occurred. Evidence:
`.backups/mobile-draft-ui-20261101-final/`.

`node scripts/check-mobile-drafts.cjs --sql-proof` records the actual read SQL
used by those tests in `.backups/mobile-draft-sql-proof.json`.
`node scripts/check-mobile-draft-sql.cjs` then plans six queries against the
configured PostgreSQL schema inside read-only transactions, using the scoped
role for scoped reads and the owner role for the staff directory and exact
lookup. It passed all
six: staff directory, draft reopen, inventory, availability, soft drafts and exact
customer lookup. This checks installed fields/functions and permissions; `EXPLAIN`
without `ANALYZE` does not establish runtime performance or business outcomes.

Result files: `.backups/mobile-drafts-api-results.json` and
`.backups/mobile-draft-sql-results.json`. No operational rows or sequences are
changed.

## Regression and packaging

- Backend and mobile typecheck/lint passed.
- API/client foundation 8 groups, palette 3 groups, customer writes/storage 10
  groups, draft API/client 9 groups and form behavior 5 groups passed in
  `npm run test:mobile` (35 groups).
- Existing business release suites passed **44/44**, with external networking
  disabled by the suite.
- Existing browser workflows passed **35/35**, with zero page errors, real
  logins or operational writes. Evidence:
  `.backups/mobile-draft-regression-20261101-final/results.json` and screenshots.
- iOS/Android JS/Hermes export passed with the final composer and recovery code:
  `mobile/.expo/native-composer-qa/`. This is packaging evidence, not a signed app.
- Final backend production build passed, including all eight draft route paths
  and the staff directory, with type/lint checks and static-page generation.

## Native composer acceptance

`python scripts/check-mobile-native.py --drafts --writes-only --output
.backups/mobile-draft-native-final-20261101` passed **5/5** against the installed
Android development APK, project-owned `Himoto_QA_20261031` AVD and loopback API:

- Open Android date/time controls, confirm a customer, select stock and create
  one branch-scoped draft. Fixture counters and saved identifiers are checked.
- Reopen the document, cancel leaving with hardware Back and save an update
  through the loaded revision.
- Recover a committed draft after a failed response, process termination and
  sign-out/sign-in. Save is disabled while the existing receipt is offered, and
  recovery does not create another draft.
- Restore and revalidate the Keystore-backed session after process termination.
- Server logout removes protected UI and persisted credentials across relaunch.

Evidence: `.backups/mobile-draft-native-final-20261101/results.json` and PNGs.
This is explicitly `mode: writes-only`, reusing a synthetic QA login; it does
not claim a new full 13-group run. The earlier customer 10/10 result remains a
separate milestone. No operational records were written. The QA harness now
checks display insets for keyboard visibility and scrolls to an interactive
control rather than stopping at its clipped text label. Only one UI Automator
reader is used at a time.

The same x86_64 debug development APK includes DateTimePicker 9.2.1; the composer
and recovery changes require no additional native dependency. APK SHA-256:
`21b029f8fb0615af05a91a4e0f98ca72a0becd69e3d00c7c32d62d039512ade5`.

iOS/physical-device acceptance, large native text, screen readers and release
performance remain unverified. Imported per-vehicle time metadata is preserved;
pricing, printing and issuance use the common contract window. The subsequent
[contract-action milestone](2026-11-01-mobile-contract-actions.md) adds explicit
review/alignment and blocks mobile issuance until the times agree.
