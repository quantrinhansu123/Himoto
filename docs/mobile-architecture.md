# Himoto Mobile — 31/10/2026

## Decision

Build the staff/manager application with React Native and Expo. Keep the Next.js
management application and its PostgreSQL backend. Mobile code lives in `mobile/`
with an independent npm lockfile; the server never imports mobile runtime code.
The dependency-free API contract is in `shared/mobile-contract.ts`.

Expo SDK 58 and its matching React/React Native versions come from the official
`default@sdk-58` template. Use `npx expo install` to resolve compatible additions.
Generated `ios/` and `android/` projects are ignored; native settings live in the
Expo config/plugins. Mobile APIs have an independent `/api/mobile/v1` namespace.

## Implemented workflows

- Native sign-in with existing staff accounts and current permissions.
- Secure restoration and an absolute eight-hour session, matching the web shift.
- Overview; paginated/searchable vehicle, contract and customer catalogues.
- Store/status filters, record details, account scope and server-side sign-out.
- Light/dark themes, system fonts, accessible controls, safe areas and tablet widths.
- Pull to refresh, cancellation, bounded network waits, recovery and expiry states.
- Create/edit customers, domestic and foreign contacts, optional documents and up
  to two relatives; quick creation defaults to an incomplete profile.
- Revision checks before updating, transactional duplicate prevention and safe
  retry/recovery when the server commits but the response is lost.

Customer mutations reuse the web application's domain service and existing RLS.
The staff UI includes draft editing, contract issuance and reservation
handover, five standalone receipt/refund purposes, renewal/period collection,
bill images, atomic return settlement, vehicle exchange and four warehouse
transfer actions. These reuse the existing domain with actor-bound receipts
and pending-write recovery; their separate acceptance scopes are documented
below and in the current status/QA reports. Early bill results are historical,
not whole-app certification. Bad-debt physical recovery now has its writer,
immutable proof, recovery and three-step editor; browser acceptance passed and
focused Samsung acceptance passed 10/10 with unchanged source and no observed
crash/ANR. Broader record media, OCR, push notifications
and offline drafts still need implementation and acceptance. Staging/RLS concurrency, signed iOS/iPhone and final releases also
remain unverified. It is not a complete replacement for every web workflow.

## Authentication and scope

Tokens have 256 bits of randomness and an `hm1_` prefix. The database stores a
SHA-256 hash, device label, platform, user ID, password version and expiry, never
the bearer token or password. Native clients store only the token, origin and
expiry in Expo SecureStore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`). Pending write
operations store opaque request keys and scope metadata there, without form
contents. User profiles and
catalogues are held in memory and cleared on sign-out or account/grant changes.
The token is sent only in Authorization, never query strings, logs or deep links.
Production requires HTTPS and redirect following is disabled.

Each request checks the session against the database, expiry, revocation, active
account, password version and fresh permissions. Sign-out acknowledges server
revocation before deleting the device session. There is no refresh token yet;
after eight hours staff sign in again. Returning to the foreground revalidates
the account without resetting the current navigation when grants are unchanged.

Login throttling uses an atomic database upsert shared between server instances:
ten attempts per normalized account per fifteen minutes, including successful
attempts. Buckets use a keyed hash; they do not retain account names. This first
version does not add a separate network/IP limit. Edge rate limits can be added
at the actual deployment boundary when its proxy topology is confirmed.

Business reads run in `dataAccess` and `himotoPool`, preserving the existing
`himoto_scoped` RLS. Fleet reads set `operation=fleet_read`, as the web does;
they never set `scope_all=true` for branch staff. Contracts/customers remain
branch scoped. Explicit DTO projection excludes identity documents, draft
payloads, GPS coordinates, revisions and storage URLs. The customer editor has a
separate, permission-checked projection described below. Mobile list requests are
bounded to 50 rows and do not support full export or arbitrary web filters.

Web cookie authentication and origin/CSRF checks remain unchanged. Native
endpoints reject browser Origin headers and do not enable CORS. Expo web is a
UI development/test target with memory-only session storage, not a production
login client; browser tests use an intercepted synthetic API.

## Backend rollout

1. Review and apply `docs/sql/2026-10-31-mobile-sessions.sql` as the existing DB
   owner. It creates two new tables with RLS enabled and no client/scoped grants.
2. Review and apply `docs/sql/2026-10-31-mobile-writes.sql` as DB owner. Its
   request receipts have actor-specific RLS; only `himoto_scoped` receives the
   necessary SELECT/INSERT/UPDATE grants. Existing operational rows are unchanged.
   Before enabling bill/renewal workflows also apply
   `docs/sql/2026-11-01-mobile-bills.sql` and
   `docs/sql/2026-11-01-mobile-renewals.sql`. Both have been tested only in
   isolated PGlite. Bill receipts are actor-scoped; renewal numbering metadata
   also permits reads for currently visible contracts so different operators
   cannot reuse a trimmed unpaid version. Receipt HTTP APIs remain actor-bound.
3. Deploy the server; configure its existing stable `MANAGEMENT_SESSION_SECRET`
   (at least 32 characters), database connection and `HIMOTO_MOBILE_ENABLED=true`.
4. Set `EXPO_PUBLIC_API_URL` to that server's HTTPS origin in the mobile build
   environment. The mobile .env contains public configuration only; never copy
   the root environment, database credentials or signing credentials into it.
5. Test with a dedicated QA account and every role/store combination before
   enrolling staff devices. Review the existing database RLS on a staging copy.

To disable mobile immediately, set `HIMOTO_MOBILE_ENABLED=false`. Web sessions
are independent. To revoke one user's sessions as DB owner:

```sql
UPDATE himoto.management_mobile_sessions SET revoked_at=now()
WHERE user_id=<reviewed_user_id> AND revoked_at IS NULL;
```

Run this maintenance on a scheduled owner-only job (no user payloads retained):

```sql
DELETE FROM himoto.management_mobile_sessions WHERE expires_at<now()-interval '7 days';
DELETE FROM himoto.management_mobile_login_limits WHERE expires_at<now()-interval '1 day';
```

Do not drop the tables during application rollback. No migration is applied to
production by the test suite or during application startup.

## Customer writes

`POST /api/mobile/v1/customers` and `PATCH /api/mobile/v1/customers/:id` require
both `customers.read` and `customers.write`. Branch users can save only at their
assigned store. `GET /customers/:id` exposes the explicitly selected editor
fields, including identity/document information, only with those same grants.
Catalogue/detail reads retain their smaller public projection.

Each mutation requires a UUID-v4 `Idempotency-Key`. The request receipt, payload
fingerprint and customer write commit in one scoped transaction. Retries with
the same normalized payload return the original receipt; a different payload
with that key returns a conflict. Updates also require the editor's PostgreSQL
`xmin` revision and lock the current row before comparing it. The shared domain
service retains the web duplicate checks and transaction locking.

`GET /customers/requests/:key` retrieves only the current actor's receipt and
checks the resulting customer's current visibility. A missing receipt is an
unknown outcome, not permission to generate another key. The client keeps the
same key after an uncertain response and offers to check the previous result.
After process termination or reauthentication it can recover a committed result
from that opaque key. Logout/expiry cancels queued reservations and removes the
session token, while retaining only unresolved request metadata in device-only
SecureStore entries. Entries are isolated by API origin and actor; create intents
also retain their destination store/all-stores scope. For an existing resource,
lookup/reservation reuses and persists the same actor's UUID across scope changes
before returning it, so a grant change cannot authorize a replacement write.
Every API still checks current grants and resource visibility. Ambiguous older
keys block new submissions; another actor cannot discover or overwrite them. There are at
most eight outstanding requests across accounts on one device, each in a small
entry with a UUID-only manifest. Corrupt metadata blocks new submissions instead
of silently inventing a replacement key. The earlier single-scope ledger is
migrated before sending a request. Browser previews keep this metadata only in
memory. Unsaved form contents are memory-only and do not survive process loss.
Back navigation confirms before discarding edits; conflicts preserve those edits
until the user explicitly loads the current server version.

Request receipts currently have no expiry protocol. Do not delete them on an
arbitrary timer: clients may still retry those keys. Add a coordinated retention
and retry-expiry contract before introducing receipt cleanup.

The Account screen now provides explicit reconciliation through
`POST /write-requests/:key/resolve`. It shares the unique actor/key row lock with
the business write. A committed result is returned only after current visibility
checks; otherwise a durable `cancelled:<operation>` tombstone blocks all late
writes with that key, including older server versions. Local metadata is removed
only after a definitive acknowledgement. No new schema is required. See
[reconciliation evidence and limits](qa/2026-11-01-mobile-write-recovery.md).

## Contract composer API

The backend, typed client and four-step staff composer share the contract-draft
document and existing domain write service.
All endpoints require `contracts.read` and `contracts.draft` with a freshly
verified mobile session:

- `GET /drafts/options`: a server-generated initial document, scoped revenue
  stores, the shared stock-store directory and configured contract types.
- `GET /drafts/staff`: active attribution names, IDs, store IDs and supported
  representative/sales/telesales roles. HR contact and payroll fields are never
  projected. Names can still be entered manually, matching the web domain.
- `GET /drafts/:id`, `POST /drafts`, `PATCH /drafts/:id`: reopen, create and update
  through the existing `saveDatabaseDraft` service and its revision checks.
- `GET /drafts/requests/:key`: actor-specific receipt recovery, with current
  visibility of the resulting contract verified. Replayed customer and draft
  writes also recheck the resource's current visibility.
- `GET /drafts/inventory`: twenty explicit vehicle projections per page, using
  the existing fleet policy. Vehicle reads additionally require `vehicles.read`.
- `POST /drafts/availability`: checks up to fifty selected vehicles against the
  existing rental-window function, plus visible soft draft holds. Hard rentals,
  deposit overlaps and draft holds remain distinct. Full counts/severity flags
  accompany the first twenty detail entries per category. Results identify the
  checked Vietnam-local time window and time of checking.
- `POST /drafts/customer-lookup`: requires `customers.read` as well. Numeric
  selection reads only the scoped catalogue. Exact phone/identity/contact lookup
  uses the existing web composer's company-wide purpose in a bounded, read-only
  owner transaction. The lookup value is sent in the body rather than the URL.

Draft bodies are bounded to 512 KiB and projected explicitly. Ownership terms,
custom installments, print requirements, optional documents and vehicle lines
are preserved. An unknown saved field requires review on web before editing,
preventing silent removal by an older app. Derived collection/deposit history is
excluded; the shared domain service obtains actual received amounts from the DB.
Structured validation errors are passed to the mobile client for field feedback.
Neither saving a draft nor checking availability reserves stock or issues a
contract. Issuance, handover and payments retain their separate business gates.

The mobile composer separates rental information, customer snapshot, stock and
review into four steps. Each step can save an incomplete draft. Customer snapshot
replacement needs confirmation; explicit per-vehicle driver identity, equipment
and date overrides survive customer/stock changes. Legacy saved contract types
remain selectable even when hidden from new contracts. Custom installment edits
are staged in a virtualized sheet and require Apply. Conflict reload and leaving
unsaved work require explicit confirmation. Compact landscape layouts retain
48-unit targets, with a keyboard dismissal action while editing. Availability
results identify the checked vehicles/window and become stale when those change.

## Mobile contract actions

Contract review/issuance and reservation handover now have scoped bearer routes
and a mobile confirmation screen. They require `contracts.read` plus
`contracts.finalize`, use the shared approval/domain services, and persist the
actor's request receipt in the same transaction as the business action. Initial
collections follow the existing issuance policy; this grant does not expose
general finance editing. Preparation projects receiving accounts and balances
without returning the payment history.

Imported line times are retained for review. The common contract window remains
the source of truth for pricing, printing and issuance, and mobile issuance
blocks differing metadata until it is explicitly aligned and saved. A mismatched
saved customer identity requires review. Manual notification outbox preparation
runs after commit and does not automatically send a message.

See [contract action evidence and limits](qa/2026-11-01-mobile-contract-actions.md).

## Contract finance

The financial summary and recording editor use `readPaymentContext` and
`recordContractPayment`. Dedicated bearer routes require current financial
read/write grants as well as contract visibility. Receipts return the exact
transaction; pending `payment.record:<id>` keys participate in durable cancellation
and Account recovery before another financial intent can be sent.

History is bounded to 25 rows per page without calculating refund limits from a
partial page. Optional read-model pagination and a server clock preserve default
web behavior. Reviewed balances guard installment accrual between loading and
recording even when `xmin` has not changed. See the
[financial workflow evidence and limits](qa/2026-11-01-mobile-finance.md).

## Renewal and bill workflow in progress

`GET /contracts/:id/renewals` requires `contracts.read` and `contracts.renew`,
independently of general financial grants. Its read-only snapshot projects active
vehicles (25 per page), current revision/balances, valid receiving accounts and
the next renewal version from the shared reference resolver. It reports bill
evidence only for that version. Ownership plans and unavailable contract states
return a business gate rather than suggesting a new fee.

The typed client validates the contract, version/bill slot and page shape.
Preparation does not reserve a version. Bill PUT checks order and existing-photo
revisions and commits the shared photo write and immutable mobile receipt together.
Native selection downsamples before decoding to a full bitmap, prepares bounded
JPEG bytes, requires image review and retains the original UUID until confirmed.

POST renewal locks the same UUID/order and rechecks line/order revisions, the
prepared version and the reviewed primary bill revision for collected money.
`renewContractAndCollect` keeps the period, fee, rental receipt and outside receipt
atomic. Outside money retains its separate exact transaction ID and never raises
rental totals or paid balance. The append-only mobile renewal ledger preserves
version references across actors and legacy JSON-history reconciliation; the
shared resolver remains compatible when that optional table is absent.

Dedicated receipt recovery returns the original immutable version/transaction
IDs, marks later cashbook/period-link changes and retains keys until the result
is reviewed. Account reconciliation uses `contracts.renew`, can durably cancel a
request which has not committed, and opens the dedicated result without clearing
its key. The keyed editor fences old sessions, locks uncertain writes and keeps
the form when cancellation confirms no write. Returning from bill editing
refreshes the version/image and requires fresh review.

Browser renewal acceptance passed 8/8; SQL covers 27 groups overall and the mobile
API/form suite 85. Bill Android acceptance passed 11/11 full, with a later zoom
fix covered by 3 focused groups. These do not certify native renewal, concurrent
database sessions, deployed RLS, physical devices or release performance.
See [renewal QA](qa/2026-11-01-mobile-renewals.md) and
[bill QA](qa/2026-11-01-mobile-bills.md).

## Saved renewal collections (01/11, native acceptance pending)

Finance now discovers saved composer renewal periods through a bounded 25-row
projection and records partial income against their exact period identity.
This uses the shared payment domain with `renewal_version`; it does not extend
dates or import the fee again. `finance.read|finance.write` plus `contracts.read`
govern viewing; `finance.write` governs collection and historical bill upload.

The order/period balance snapshot, whole-contract reviewed balances and exact
primary bill revision are checked in the write transaction. The append-only
mobile collection table retains original period/account/amount/transaction data
even after mutable cashbook correction. Actor-bound recovery distinguishes
`current` from `billCurrent` and keeps the UUID until operator acknowledgement.
Generic reconciliation uses `payment.renewal:<id>` and `payment.bill:<id>`;
Account routes these to their dedicated receipt screens without needing a
version parameter. An unresolved historical bill blocks collection review.

Client/form suite totals 102 groups, actual PGlite SQL 43 groups, browser saved
collections 9/9 and backend/Hermes exports pass. The migration is not deployed.
Native process/picker acceptance is still in progress; see
[collection QA](qa/2026-11-01-mobile-renewal-collections.md).

## iOS / xtool assessment

Reference: https://github.com/xtool-org/xtool (MIT), inspected 31/10/2026.
xtool builds and deploys SwiftPM-based iOS applications on Linux/WSL/macOS. It is
useful for Swift/SwiftUI work and device tooling. React Native's iOS project uses
a different native dependency/build pipeline; xtool is not a drop-in Expo build
replacement. We do not add it as a dependency to this app or promise that it
builds a React Native archive on Windows.

Use EAS Build for signed iOS builds from Windows, or Xcode on macOS for local
builds, simulator work and native debugging. Development builds, internal preview
and production profiles are in `mobile/eas.json`. Apple signing, the owning Expo
project and final bundle identifier must be configured under the customer's
accounts before distribution. `vn.himoto.staff` is the proposed identifier;
availability and ownership have not been verified.

Sources:
- https://docs.expo.dev/versions/v58.0.0/
- https://docs.expo.dev/develop/development-builds/introduction/
- https://docs.expo.dev/versions/v58.0.0/sdk/securestore/
- https://docs.expo.dev/guides/monorepos/
- https://github.com/xtool-org/xtool

## Record-media integration (02/11, editor/browser implemented; native in progress)

Keep the existing record photo model and slot identities. Return evidence uses
`contracts/return-<itemId>-...`; swap photos use
`contracts/vehicle-swap-<swapId>-<index>`; transfer/receive evidence uses
`vehicles/transfer-<eventId>-1` or `receive-<eventId>-1`, including supplemental
slots supported by the shared parser. The parent ID, line/swap/event identity,
current visibility and slot must be checked together; a supplied slot alone
must not authorize another record's media.

Reuse `parsePhotoTarget`, `requireContractPhotoSlot`, `writeRecordPhoto` and the
shared photo permission functions, with the proper contract/fleet RLS context.
Return lines can accept preparation evidence before physical return; transfer
and swap photos require their saved exact event. Reuse bounded native JPEG
preparation and authenticated image proxying already used by bills. Storage
URLs and bearer tokens must not cross into third-party image requests. Video
needs its own bounded native picker/processing/upload acceptance; the browser
worker and `File` implementation are not native adapters.

Scoped metadata/target preparation, exact-revision image proxy, atomic JPEG
writes, immutable original metadata receipts, tombstones and device pending/
Account recovery are implemented. The editor opens from contract/vehicle detail,
discovers exact saved targets, pages the gallery, selects a slot or supplementary
image, prepares a picked JPEG and requires loaded image review before explicit
confirmation. Existing and committed images must load before replacement/receipt
acknowledgement. Native camera permissions/settings are implemented but camera
acceptance is pending. Preserve all existing photos, extra slots and old receipts.
Read-only tests must prove no
request/sequence mutation; writer tests must cover stale parent/photo, invalid
cross-record targets, rollback, lost response and two actors. Browser/native
picker, cancellation/process loss, orientation/HEIC/camera, memory/cache and
signed iPhone remain separate acceptance requirements.

GET `/record-media/:entity/:id` discovers targets at25/page; the same route plus
`/:kind/:referenceId` pages saved photos at25. Exact-slot metadata (without a
revision query) reads its current photo and next supplementary slot from the
entire group. Image GET/PUT adds `/:slot`, exact photo revision for reads and
parent/reference/photo revisions, X-Media-Snapshot plus UUID for writing.
Snapshot binds the displayed target label as well as reference identity/revisions;
the writer recomputes it while locked. Return media binds a scoped line, swap
media a saved swap, transfer/receive a typed saved location event. The pinned
vehicle context matches the web photo wrapper without broadening contracts or
scope_all. `media.contract:<id>` / `media.vehicle:<id>` recover through the shared
resolver and `/record-media/requests/:key`; Account opens a dedicated original
receipt and requires acknowledgement before clearing the key. Proof stores the
original target, slot, actor, byte count/hash and photo revision; it does not
archive old image bytes. Later parent/reference/photo corrections have separate
current flags. The parent ledger reserves an exclusive intent across separate
editors, retains uncertain requests through actor/scope/process changes and
requires resolution before any further target on that parent can upload.
Migration is not deployed; SQL124/mobile155 (API8), release44/44, types/lint and
backend602 have passed. Browser8/8 covers real JPEG preparation, four responsive
light/dark viewports, original/replacement images, scope/actor recovery and
lost/drop/conflict/tombstone/late409. Durable media journal8 includes a real HTTP
restart. Samsung run1 failed with a native raw-JSX-text LogBox; its one committed
JPEG/immutable proof remains preserved (2200×1467/80836 bytes/full decode).
The text fragment was corrected, a native text lint rule added and receipt
navigation now replaces/disposes the editor while synchronizing its removal
guard. Mobile types/lint and browser regression8/8 passed. Samsung run2/dataset9200
passed8/8 focused; a separate Account ledger/session run passed3/3 without media
mutation. Each run retained180 source/QA hashes and observed zero crashes/ANRs;
the product source is identical across them. Five receipts/one tombstone remain,
including the original9100 proof; sessions ended at0, USB mapping was restored
and older transfer/recovery checkpoints stayed unchanged. The ledger check is
separate evidence, not an11-group whole-app acceptance. The harness fails
immediately on a native error overlay instead of continuing underneath LogBox;
`--ledger-only` verifies an existing journal without image selection or mutation.
The separate PostgreSQL17.11 QA suite passed9 groups with two actual sessions,
seven `pg_blocking_pids` observations and285 unchanged inputs. It exercises the
actual media writer/resolver/scopedConnect, unique/parent locks, commit/rollback/
cancel races, actor isolation and pooled role/scope/pinned-vehicle cleanup.
The loopback-only cluster uses a minimal synthetic branch fixture and retains a
new database per run; it does not certify deployed HQ/RLS, all other writers or
staging performance. See [PostgreSQL evidence](qa/2026-11-02-mobile-postgres-races.md).
Camera/video/HEIC/orientation/picker
Activity death/cache, staging and signed iPhone remain separate requirements.
See [record-media evidence and limits](qa/2026-11-02-mobile-record-media.md).

## Workflow validation boundaries

Vehicle transfers now expose scoped preparation/destinations/read-only preview
and atomic transfer/receive/reject/cancel writers through applyVehicleAction.
After upstream ac4b189, dispatch/receipt/reject/cancel move both vehicle owner
and warehouse. New mobile snapshots project actual owner separately from the
warehouse, bind ownership and owner labels and verify both after the domain write.
Original receipts without ownership stay readable/resolvable without backfill;
fresh preparation/preview requires the complete projection. Browser10/10,
SQL111 overall/mobile147 groups and the ownership Samsung run1 9/9 focused
passed, with 165 source/QA files unchanged and no observed crash/ANR. Existing
17 transfer receipts and recovery8098 checkpoint were preserved; final ledger
was empty/logout and USB restored. This is separate from earlier native evidence.
The action and one vehicle are pinned as on web; scope_all is never widened.
Ready stock awaits another actor receipt; other statuses transfer immediately
with linked dispatch/receipt events and unchanged contract/financial data.
Append-only actor-bound proof, post-lock snapshot recheck, generic vehicle.*
resolution/tombstones, pending ledger and Account original-proof recovery are
implemented. A three-step editor with explicit confirmation and one serialized
pending group for all four actions is implemented. Browser acceptance passed
10/10 with two separate actor sessions; durable fixture journal tests passed
8 groups including an actual server restart. One focused Samsung transfer run
passed 9/9 (151 source/QA files unchanged, zero observed crashes/ANRs); it does
not certify the whole app or deployed backend. The new migration is not deployed.
The original English receiver name exposed Telex composition in the default
login keyboard; the short QA alias isolates business tests, while that product
input behavior was corrected by a guarded MainActivity config plugin and a
fresh ARM64 build. A separate Samsung IME run passed 4/4; the native text class
was verified as 0x80091, with literal username and unchanged device keyboard.
See
[transfer QA and remaining work](qa/2026-11-02-mobile-vehicle-transfers.md).

Swaps now have scoped preparation/candidates, read-only exact-selection preview
and an atomic writer through
replaceContractVehicle, with post-lock order/line/stock checks, printed draft
synchronization, swap history and immutable actor-bound proof. return.swap joins
durable cancellation, pending storage and Account → original receipt recovery.
The three-step editor reviews original/replacement vehicles and warehouse before
confirmation, locks uncertain writes and keeps the UUID through process death.
Browser 10/10 and focused Samsung 6/6 pass with unchanged source hashes and no
new crash/ANR. These are not full app/staging/iPhone acceptance. The legacy QA
fixture on 8091 was already unavailable before this native run; its volatile RAM
was not restored or certified. Return fixture 8093 stayed unchanged and the swap
fixture on 8094 retains receipts/tombstones. See QA for exact environment limits.
SQL tests execute actual ownership HQ/RLS definitions and reproduce/fix metadata
policy recursion, missing HQ scope in label/physical-return helpers, legacy-29
classification and old-stock release across branches. Four new migrations are
not deployed. See [swap evidence and prerequisites](qa/2026-11-02-mobile-swaps.md).

Mobile returns now have an atomic writer through completeReturnBatch, locking
the parent UUID/order/lines and recomputing fee/settlement review hashes before
allocating child UUIDs. An actor-bound append-only proof retains exact original
vehicle and payment data; later corrections expose independent current flags.
return.record participates in durable cancellation, SecureStore pending keys
and Account recovery; the editor blocks uncertain writes and requires explicit
receipt acknowledgement before removing a key. The new migration is not deployed.
See [return writer evidence](qa/2026-11-02-mobile-return-write.md); the preview
paragraph below describes the earlier implementation boundary.

Return preparation and both fee/settlement previews now use scoped read-only
transactions. Fee and settlement hashes bind the selected line revisions,
financial history, ownership accrual and actual payment/refund intent. SQL
tests compare these projections with `completeReturnBatch` under rollback;
they do not enable a mobile return writer. The future writer must lock and
recompute, atomically retain an immutable receipt and participate in pending
recovery before an editor exposes recording. See
[return preview evidence](qa/2026-11-02-mobile-return-preview.md).

Automated fixture tests must not use production credentials or change operational
data. Native JS bundle export is a packaging check, not evidence of a signed
IPA/APK or native hardware behavior. Browser rendering tests validate shared UI;
they cannot certify VoiceOver/TalkBack, Keychain/Keystore, native back gestures,
camera/video or behavior on a physical iPhone. Complete those acceptance checks
with signed builds before declaring the app ready for staff rollout.

Bad-debt physical recovery has separate read-only preparation and preview APIs
under /contracts/:id/recoveries. They reuse the web date/note parser and frozen
plan gate; ordinary return remains unavailable for bad debt. Preview binds
order/line revisions, normalized actual recovery date/note, composer and ledger
row revisions to a snapshot, without allocating request keys or mutating rows.
It preserves the old debt/deposit amounts and does not predict globally free
stock from branch-visible rentals. SQL verifies read-only enforcement, paging,
RLS and parity with the actual web writer, including HQ/legacy-29 ownership.
The shared writer was fixed to preserve the original installment cutoff when
physical recovery is backdated or later. Mobile writing now locks the order/line,
recomputes that snapshot, calls the shared domain in one transaction and verifies
that money/ledger values did not change. Actor-bound immutable proof includes the
original event/line and financial fingerprint; later item/history/money/contract
flags never replace it. The return.recover resolver and device ledger share
exclusive reservation with return.record/swap per contract. The three-step editor
has browser10/10 plus return9/9/swap10/10 regression. After pull ac4b189, mobile146/21,
SQL108 and backend QA595 source files passed; the later focused Samsung run5
passed 10/10 with 165 source/QA files unchanged, no observed crashes/ANRs and
confirmed logout/empty ledger. Transfer ownership changes after this run require
their own evidence; this does not certify the whole app or iPhone.
See [recovery evidence](qa/2026-11-02-mobile-bad-debt-recovery.md).

The Windows host rebooted at 09:32 on 02/11. Earlier RAM-only fixtures on
8091/8093/8094 are offline; their artifacts remain, but their RAM is not claimed
to be restored. Transfer fixture 8097 was restored from its complete journal,
with exact digest/generation/proof verification. The old Metro/web PIDs are
historical. Check the latest handoff before resuming any local QA service.
